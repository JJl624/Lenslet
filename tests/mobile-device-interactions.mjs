import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {androidDevice} from './helpers/android-device.mjs';
import {expectFoldAligned} from './helpers/fold-layout.ts';

const device=await androidDevice(),{page,native,tap,keyboard,shell}=device;
const folder='interaction-qa-'+Date.now(),note=folder+'/note.md',lines=Array.from({length:24},(_,i)=>'console.log('+i+');').join('\n');
const content=Array.from({length:12},(_,i)=>'段落 '+i).join('\n\n')+'\n\n> [+] 设备折叠标题\n> 正文内容\n>\n> > [-] 嵌套标题\n> > 嵌套正文\n\n```js {id=0001 height=160}\n'+lines+'\n```\n\n```tabs {id=0002 height=180}\n:::js 第一页\n'+lines+'\n:::py 第二页\nprint(2)\n```\n\n'+Array.from({length:12},(_,i)=>'结尾 '+i).join('\n\n');
let previous;
async function drag(handle,delta){await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(1150);await expect(handle).toHaveClass(/resize-ready/);for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+delta*i/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}}
try{
  if((await native('load')).root!=='internal')throw Error('Use the debug internal vault.');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');await native('create',note,'file',content);await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await page.reload();await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true',{timeout:30000});expect(keyboard()).toBe(false);
  const read=page.locator('.reading-view .code-block-shell').first(),readCode=read.locator('pre > code');await drag(read.getByRole('separator',{name:'临时调整代码块高度'}),70);await expect.poll(()=>readCode.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThan(215);expect(keyboard()).toBe(false);expect((await native('read',note)).content).toBe(content);
  await tap(page.getByRole('tab',{name:'编辑',exact:true}));await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true',{timeout:30000});expect(keyboard()).toBe(false);
  const code=page.locator('.milkdown-code-block').first();await drag(code.getByRole('separator',{name:'拖动调整代码块高度'}),70);await expect(code).toHaveAttribute('data-code-height','230');expect(keyboard()).toBe(false);
  await tap(code.locator('.cm-content'));await expect.poll(keyboard).toBe(true);await drag(code.getByRole('separator',{name:'拖动调整代码块高度'}),20);await expect(code).toHaveAttribute('data-code-height','250');expect(keyboard()).toBe(true);shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);
  const tabs=page.locator('.milkdown-code-block.tabbed-code');await tap(tabs.getByRole('tab',{name:'第二页',exact:true}));expect(keyboard()).toBe(false);await tap(tabs.locator('.cm-content'));await expect.poll(keyboard).toBe(true);await tap(tabs.getByRole('tab',{name:'第一页',exact:true}));expect(keyboard()).toBe(true);
  shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);await tap(tabs.getByRole('button',{name:'显示源码',exact:true}));await page.waitForTimeout(300);expect(keyboard()).toBe(false);await tap(tabs.getByRole('button',{name:'显示标签页',exact:true}));expect(keyboard()).toBe(false);
  const fold=page.locator('.ProseMirror > .folding-quote'),toggle=fold.getByRole('button',{name:'折叠：设备折叠标题',exact:true});expect(await fold.evaluate(element=>({left:getComputedStyle(element).borderLeftWidth,radius:getComputedStyle(element).borderRadius}))).toEqual({left:'2px',radius:'0px 6px 6px 0px'});await toggle.evaluate(element=>element.scrollIntoView({block:'center'}));const top=await fold.evaluate(element=>element.getBoundingClientRect().top);await tap(toggle);await expect(fold).toHaveAttribute('data-fold-open','false');expect(Math.abs(await fold.evaluate(element=>element.getBoundingClientRect().top)-top)).toBeLessThan(3);expect(keyboard()).toBe(false);await tap(fold.getByRole('button',{name:'展开：设备折叠标题',exact:true}));
  await tap(fold.locator('p').first(),{x:70,y:18});await expect.poll(keyboard).toBe(true);shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);await tap(page.getByRole('toolbar').getByRole('button',{name:'默认折叠',exact:true}));await page.waitForTimeout(300);expect(keyboard()).toBe(false);
  await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/android-fold-v1022.png'),device.screenshot());
  await tap(page.getByRole('button',{name:'全部格式',exact:true}));await tap(page.getByRole('dialog').getByRole('button',{name:'加粗',exact:true}));await page.waitForTimeout(300);expect(keyboard()).toBe(false);expect((await native('read',note)).content).toBe(content);
  await tap(page.getByRole('tab',{name:'阅读',exact:true}));
  for(const size of [10,24]){
    for(let step=0;step<24&&await page.getByRole('group',{name:'页面字号 '+size+' px',exact:true}).count()===0;step++)await tap(page.getByRole('button',{name:size===10?'缩小字号':'放大字号',exact:true}));
    await expectFoldAligned(page.locator('.reading-view > .folding-quote > summary'),size);
    await tap(page.getByRole('tab',{name:'编辑',exact:true}));await expectFoldAligned(page.locator('.ProseMirror > .folding-quote > p').first(),size);
    await tap(page.getByRole('tab',{name:'阅读',exact:true}));
  }
  await expect(page.locator('.reading-view > .folding-quote')).toBeVisible();
  await page.locator('.reading-view > .folding-quote').evaluate(element=>element.scrollIntoView({block:'center'}));
  await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/android-fold-v1023.png'),device.screenshot());
  console.log('PASS: native Android resize and IME behavior, folding title alignment at 10/24px in both modes, and manual files unchanged.');
}finally{
  if(previous)await native('feature','preferences.set-many',{values:{'moyu-mobile-size':previous['moyu-mobile-size']||'17','moyu-save-policy':previous['moyu-save-policy']||'realtime','moyu-session-internal':previous['moyu-session-internal']||'null'}}).catch(()=>{});
  await native('feature','mobile.draft-clear',{path:note}).catch(()=>{});await native('trash',folder).catch(()=>{});await device.close();
}
