import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {androidDevice} from './helpers/android-device.mjs';
import {performanceDocuments} from './fixtures/performance-documents.mjs';
const device=await androidDevice(),{page,native,tap,keyboard,shell}=device;
const folder='panel-qa-'+Date.now(),note=folder+'/note.md',content=performanceDocuments[1].markdown+'\n\n> [+] 折叠标题\n> 内容\n\n```tabs {id=0100 height=180}\n:::js 第一页\nconsole.log(1);\n:::py 第二页\nprint(2)\n```\n\n'+Array.from({length:20},(_,i)=>'结尾段落 '+i).join('\n\n');
let previous;
async function drag(handle){await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(750);await expect(handle).toHaveClass(/resize-ready/);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+40}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}}
try{
  if((await native('load')).root!=='internal')throw Error('Use the debug internal vault.');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');await native('create',note,'file',content);await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-mobile-size':'17','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await page.reload();
  await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true',{timeout:30000});
  const samples=await page.evaluate(async()=>{const original=document.querySelector('.reading-view').firstChild,results=[];for(let i=0;i<4;i++){const start=performance.now();document.querySelector(i%2?'.mobile-document-title':'button[aria-label="文档操作"]').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const dialog=document.querySelector('.mobile-sheet[open]');if(!dialog||dialog.matches(':modal'))throw Error('Expected the lightweight panel');results.push(Math.round(performance.now()-start));dialog.querySelector('header > button:last-child').click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));}if(document.querySelector('.reading-view').firstChild!==original)throw Error('Reading content was replaced');return results;});
  console.log('Native WebView menu frame latency (ms):',JSON.stringify(samples));expect(keyboard()).toBe(false);
  const grip=page.locator('.reading-view .code-resize').first(),target=grip.locator('..').locator('pre > code').first();await grip.evaluate(element=>element.scrollIntoView({block:'center'}));expect((await grip.boundingBox()).height).toBe(28);
  expect(await grip.evaluate(element=>{const box=element.getBoundingClientRect();return[2,14,26].every(y=>element.contains(document.elementFromPoint(box.x+box.width/2,box.y+y)));})).toBe(true);
  const height=(await target.boundingBox()).height;await drag(grip);expect((await target.boundingBox()).height).toBeGreaterThan(height+35);expect(keyboard()).toBe(false);
  await tap(page.getByRole('tab',{name:'编辑',exact:true}));await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true',{timeout:30000});
  const block=page.locator('.tabbed-code'),toggle=block.getByRole('button',{name:'管理代码标签页',exact:true});await toggle.evaluate(element=>element.scrollIntoView({block:'center'}));
  expect((await block.locator('.tabs-bar').boundingBox()).height).toBeLessThanOrEqual(30);
  await page.evaluate(()=>{window.__panelIme=[];window.addEventListener('moyu-mobile-keyboard',event=>window.__panelIme.push(event.detail));});
  await tap(toggle);await expect(toggle).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(300);expect(keyboard()).toBe(false);expect(await page.evaluate(()=>window.__panelIme.includes(true))).toBe(false);
  const title=block.getByLabel('标签页标题',{exact:true});await tap(title);await expect.poll(keyboard).toBe(true);
  await expect.poll(()=>title.evaluate(element=>{const box=element.getBoundingClientRect(),scope=element.closest('.mobile-document').getBoundingClientRect();return box.top>=scope.top&&box.bottom<=scope.bottom;})).toBe(true);
  await title.fill('修改后的标题');await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/android-tabs-keyboard-v1026.png'),device.screenshot());
  await tap(toggle);await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(block.getByRole('tab',{name:'修改后的标题',exact:true})).toBeVisible();
  if(keyboard()){shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);}
  expect((await native('read',note)).content).toBe(content);console.log('PASS: native large-document panels, fully reachable reading resize grip, compact tabs, pressed toggle, explicit IME entry and visible title field; manual file unchanged.');
}finally{
  if(previous)await native('feature','preferences.set-many',{values:{'moyu-save-policy':previous['moyu-save-policy']||'realtime','moyu-mobile-size':previous['moyu-mobile-size']||'17','moyu-session-internal':previous['moyu-session-internal']||'null'}}).catch(()=>{});
  await native('feature','mobile.draft-clear',{path:note}).catch(()=>{});await native('trash',folder).catch(()=>{});await device.close();
}
