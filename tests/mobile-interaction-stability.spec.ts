import {openMobileSettings} from './helpers/mobile-controls.mjs';
import {test,expect,type Page,type Locator} from './helpers/mobile-test';
import path from 'node:path';
import {mockAndroid} from './helpers/mobile-native-mock';
const lines=Array.from({length:24},(_,i)=>'console.log('+i+');').join('\n');
const content=Array.from({length:12},(_,i)=>'开头段落 '+i).join('\n\n')+'\n\n> [+] 折叠标题\n> 引用正文\n>\n> > [-] 嵌套标题\n> > 嵌套正文\n\n```js {id=0001 height=160}\n'+lines+'\n```\n\n```tabs {id=0002 height=180}\n:::js 第一页\n'+lines+'\n:::py 第二页\nprint(2)\n```\n\n'+Array.from({length:12},(_,i)=>'结尾段落 '+i).join('\n\n');
async function start(page:Page){await mockAndroid(page,{files:{'note.md':{content}}});await page.addInitScript(()=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-save-policy']='manual';});await page.goto('/mobile.html');await expect(page.locator('.reading-view')).toBeVisible({timeout:30000});await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');}
async function drag(page:Page,handle:Locator,delta:number,hold=1100){
  await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(hold);if(hold>=1000)await expect(handle).toHaveClass(/resize-ready/);for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+delta*i/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
}
async function reset(page:Page,handle:Locator){const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);try{for(let i=0;i<2;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}}finally{await cdp.detach();}}
const keyboard=(page:Page)=>page.evaluate(()=>(window as any).__mobileState.keyboardVisible);
const closed=(page:Page)=>page.evaluate(()=>{(window as any).__mobileState.keyboardVisible=false;window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));});

test('Reading code and tabs resize temporarily after a hold, scroll before it, and double tap restores the original size',async({page})=>{
  await start(page);const shells=page.locator('.reading-view .code-block-shell');
  for(const index of [0,1]){
    const shell=shells.nth(index),target=index?shell.locator('.tabs-frame'):shell.locator('pre > code').first(),handle=shell.getByRole('separator',{name:'临时调整代码块高度'});
    await expect(handle).toBeAttached();const before=await target.evaluate(element=>element.getBoundingClientRect().height);await drag(page,handle,60);await expect.poll(()=>target.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThan(before+45);expect(await keyboard(page)).toBe(false);
    await reset(page,handle);await expect.poll(()=>target.evaluate(element=>element.getBoundingClientRect().height)).toBeCloseTo(before,0);
  }
  await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
  const handle=shells.first().getByRole('separator'),target=shells.first().locator('pre > code');await drag(page,handle,-80,0);expect(await target.evaluate(element=>element.style.height)).toBe('');
  await page.reload();await expect(page.locator('.reading-view')).toBeVisible();expect(await page.locator('.reading-view .code-block-shell').first().locator('pre > code').evaluate(element=>element.style.height)).toBe('');
});

test('Edit resizing changes fence metadata without opening the keyboard and survives switching to source',async({page})=>{
  await start(page);await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  const blocks=page.locator('.milkdown-code-block');for(const index of [0,1]){const block=blocks.nth(index),handle=block.getByRole('separator',{name:'拖动调整代码块高度',exact:true});await drag(page,handle,60);await expect.poll(()=>block.getAttribute('data-code-height')).toMatch(/^(2\d\d|[3-9]\d\d)$/);expect(await keyboard(page)).toBe(false);}
  await page.getByRole('tab',{name:'源码',exact:true}).tap();await expect(page.locator('.source-editor')).toBeVisible();expect(await keyboard(page)).toBe(false);
  // CodeMirror virtualizes offscreen source lines. Verify the serialized
  // heights by reopening rich editing rather than reading the visible DOM.
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  await expect(blocks.nth(0)).toHaveAttribute('data-code-height','220');await expect(blocks.nth(1)).toHaveAttribute('data-code-height','240');
  expect(await keyboard(page)).toBe(false);expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
});

test('Fold, tab and menu actions keep a hidden keyboard closed and preserve a visible block position',async({page})=>{
  await start(page);await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  const fold=page.locator('.ProseMirror > .folding-quote');expect(await fold.evaluate(element=>({left:getComputedStyle(element).borderLeftWidth,radius:getComputedStyle(element).borderRadius,padding:getComputedStyle(element).padding}))).toEqual({left:'2px',radius:'0px 6px 6px 0px',padding:'0px'});await fold.locator('p').first().tap();await closed(page);expect(await keyboard(page)).toBe(false);
  const toggle=fold.getByRole('button',{name:'折叠：折叠标题',exact:true});await toggle.evaluate(element=>element.scrollIntoView({block:'center'}));const top=await fold.evaluate(element=>element.getBoundingClientRect().top);await toggle.tap();await expect(fold).toHaveAttribute('data-fold-open','false');expect(await keyboard(page)).toBe(false);expect(Math.abs(await fold.evaluate(element=>element.getBoundingClientRect().top)-top)).toBeLessThan(3);
  await fold.getByRole('button',{name:'展开：折叠标题',exact:true}).tap();await fold.locator('p').first().tap();await closed(page);const height=await page.locator('.mobile-document').evaluate(element=>element.clientHeight);await page.getByRole('toolbar').getByRole('button',{name:'默认折叠',exact:true}).tap();expect(await keyboard(page)).toBe(false);expect(await page.locator('.mobile-document').evaluate(element=>element.clientHeight)).toBe(height);
  const tabs=page.locator('.milkdown-code-block.tabbed-code');await tabs.getByRole('tab',{name:'第二页',exact:true}).evaluate(element=>element.scrollIntoView({block:'center'}));const tabTop=await tabs.evaluate(element=>element.getBoundingClientRect().top);await tabs.getByRole('tab',{name:'第二页',exact:true}).tap();expect(await keyboard(page)).toBe(false);expect(Math.abs(await tabs.evaluate(element=>element.getBoundingClientRect().top)-tabTop)).toBeLessThan(3);
  await tabs.locator('.cm-content').tap();await expect.poll(()=>keyboard(page)).toBe(true);await tabs.getByRole('tab',{name:'第一页',exact:true}).tap();expect(await keyboard(page)).toBe(true);await closed(page);await tabs.getByRole('button',{name:'显示源码',exact:true}).tap();expect(await keyboard(page)).toBe(false);
  await page.locator('.ProseMirror > p').first().tap();await closed(page);await page.getByRole('button',{name:'全部格式',exact:true}).tap();await page.getByRole('dialog').getByRole('button',{name:'加粗',exact:true}).tap();expect(await keyboard(page)).toBe(false);
});

test('Context labels are optional and persistent; compact tabs and fold headers keep titles clear at phone widths',async({page})=>{
  await start(page);await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await openMobileSettings(page);await page.getByRole('switch',{name:'显示动态图标文字',exact:true}).uncheck();await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await page.locator('[data-path="note.md"] .mobile-file-open').tap();
  const summary=page.locator('.reading-view > details.folding-quote > summary');await summary.evaluate(element=>element.scrollIntoView({block:'center'}));await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/mobile-fold-reading-v1022.png')});
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');const tabs=page.locator('.tabbed-code');await tabs.locator('.cm-content').tap();
  await expect(page.getByRole('toolbar').locator('.mobile-context-format')).not.toHaveCount(0);await expect(page.getByRole('toolbar').locator('.mobile-context-format > span')).toHaveCount(0);await expect(page.getByRole('toolbar').getByRole('button',{name:'换行',exact:true})).toBeVisible();
  for(const width of [320,393]){await page.setViewportSize({width,height:851});expect((await tabs.locator('.tabs-bar').boundingBox())!.height).toBeLessThanOrEqual(36);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);}
  await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/mobile-tabs-v1022.png')});await page.reload();await expect(page.locator('.reading-view')).toBeVisible();await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await openMobileSettings(page);await expect(page.getByRole('switch',{name:'显示动态图标文字',exact:true})).not.toBeChecked();
});

test('Transient IME visibility changes leave the text input focused until an explicit control gesture',async({page})=>{
  await start(page);await page.getByRole('tab',{name:'编辑',exact:true}).tap();const tabs=page.locator('.tabbed-code'),code=tabs.locator('.cm-content');await code.tap();await expect.poll(()=>keyboard(page)).toBe(true);await closed(page);expect(await code.evaluate(element=>element===document.activeElement)).toBe(true);
  await page.evaluate(()=>{(window as any).__mobileState.keyboardVisible=true;window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:true}));});expect(await code.evaluate(element=>element===document.activeElement)).toBe(true);await closed(page);await tabs.getByRole('tab',{name:'第二页',exact:true}).tap();expect(await keyboard(page)).toBe(false);
});
