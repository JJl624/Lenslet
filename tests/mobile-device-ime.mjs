import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {androidDevice} from './helpers/android-device.mjs';
const device=await androidDevice(),{page,native,tap,hold,keyboard,shell}=device;
const folder='ime-qa-'+Date.now(),note=folder+'/note.md',content='普通文字，用于检查输入法。\n\n```js {id=0001 height=160}\nconsole.log(1);\nconsole.log(2);\nconsole.log(3);\n```\n\n```tabs {id=0002 height=180}\n:::js 第一页\nconsole.log(1);\n:::py 第二页\nprint(2)\n```\n\n'+Array.from({length:12},(_,i)=>'结尾段落 '+i).join('\n\n');
const results=[],label=process.env.MOYU_IME_LABEL||'after';let previous;
async function trace(name,action,expectVisible=true){
  await page.evaluate(()=>{window.__imeTrace=[];if(window.__imeTraceReady)return;window.__imeTraceReady=true;const ids=new WeakMap();let id=0;const record=(type,event)=>{const target=event?.target;if(target instanceof Element&&!ids.has(target))ids.set(target,++id);window.__imeTrace.push({type,time:Math.round(performance.now()),node:ids.get(target),target:target?.className||target?.tagName||'',height:innerHeight,visual:visualViewport?.height,visible:event?.detail});};for(const type of ['focusin','focusout','pointerdown','pointerup'])document.addEventListener(type,event=>record(type,event),true);window.addEventListener('moyu-mobile-keyboard',event=>record('ime',event));visualViewport?.addEventListener('resize',event=>record('resize',event));});
  await action();let failure;try{await expect.poll(keyboard).toBe(expectVisible);}catch(error){failure=error;}await page.waitForTimeout(650);const events=await page.evaluate(()=>window.__imeTrace),focus=events.filter(event=>event.type==='focusin'||event.type==='focusout'),restarts=focus.filter((event,index)=>event.type==='focusout'&&focus[index+1]?.type==='focusin'&&event.node===focus[index+1]?.node).length,visibility=events.filter(event=>event.type==='ime').map(event=>event.visible);results.push({name,restarts,visibility,events});console.log(JSON.stringify({name,restarts,visibility,opened:keyboard()}));
  if(label!=='before'){if(failure)throw failure;expect(restarts,name+' must not restart the focused editor').toBe(0);if(expectVisible)expect(visibility).not.toContain(false);else expect(visibility).not.toContain(true);}
}
async function hide(){if(keyboard()){shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);}await page.waitForTimeout(150);}
try{
  if((await native('load')).root!=='internal')throw Error('Use the debug internal vault.');previous=await native('feature','preferences.get');await native('create',folder,'folder','');await native('create',note,'file',content);await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-mobile-size':'17','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await page.reload();await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');await tap(page.getByRole('tab',{name:'编辑',exact:true}));await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  await trace('ordinary text first tap',()=>tap(page.locator('.ProseMirror > p').first(),{x:90,y:12}));await hide();
  const code=page.locator('.milkdown-code-block').first();await trace('code first tap',()=>tap(code.locator('.cm-content'),{x:80,y:14}));await hide();
  const config=await native('feature','mobile.touch-settings');await hold(code.locator('.cm-line').first(),config.longPressTimeout+150,{x:80,y:10});expect(keyboard()).toBe(false);
  // Dismiss Android's floating selection toolbar before measuring text entry.
  // A tap on that native toolbar is not a WebView input gesture.
  await page.evaluate(()=>getSelection()?.removeAllRanges());await page.waitForTimeout(150);
  await trace('code tap after long selection',()=>tap(code.locator('.cm-line').last(),{x:150,y:10}));await hide();
  await tap(page.getByRole('tab',{name:'源码',exact:true}));await expect(page.locator('.source-editor')).not.toHaveAttribute('data-editor-pending','true');await trace('source first tap',()=>tap(page.locator('.source-editor .cm-content'),{x:100,y:20}));await hide();
  await tap(page.getByRole('tab',{name:'编辑',exact:true}));const tabs=page.locator('.tabbed-code');await trace('tab editor first tap',()=>tap(tabs.locator('.cm-content'),{x:90,y:12}));await hide();
  const manage=tabs.getByRole('button',{name:'管理代码标签页',exact:true});await trace('management control',()=>tap(manage),false);await trace('management title input',()=>tap(tabs.getByLabel('标签页标题',{exact:true})));await hide();
  expect((await native('read',note)).content).toBe(content);
}finally{
  await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/android-ime-'+label+'.json'),JSON.stringify(results,null,2));
  if(previous)await native('feature','preferences.set-many',{values:{'moyu-save-policy':previous['moyu-save-policy']||'realtime','moyu-mobile-size':previous['moyu-mobile-size']||'17','moyu-session-internal':previous['moyu-session-internal']||'null'}}).catch(()=>{});await native('feature','mobile.draft-clear',{path:note}).catch(()=>{});await native('trash',folder).catch(()=>{});await device.close();
}
