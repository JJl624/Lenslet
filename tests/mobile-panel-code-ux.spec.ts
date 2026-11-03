import {test,expect,type Page,type Locator} from './helpers/mobile-test';
import path from 'node:path';
import {mockAndroid} from './helpers/mobile-native-mock';
const code=Array.from({length:22},(_,i)=>'console.log('+i+');').join('\n');
const content=Array.from({length:12},(_,i)=>'前面的段落 '+i).join('\n\n')+'\n\n> [+] 折叠标题\n> 内容\n\n```js {id=0001 height=160}\n'+code+'\n```\n\n```tabs {id=0002 height=180}\n:::js 第一页\n'+code+'\n:::py 第二页\nprint(2)\n```\n\n'+Array.from({length:12},(_,i)=>'结尾段落 '+i).join('\n\n');
async function start(page:Page){await mockAndroid(page,{files:{'note.md':{content}}});await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});await page.goto('/mobile.html');await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');}
async function resize(page:Page,handle:Locator){
  await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(650);await expect(handle).toHaveClass(/resize-ready/);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+40}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
}
test('Every reading and editing resize grip has the same fully reachable hit area and gesture',async({page})=>{
  await start(page);
  for(const mode of ['阅读','编辑']){
    if(mode==='编辑'){await page.getByRole('tab',{name:mode,exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');}
    const handles=page.locator('.mobile-document .code-resize');await expect(handles).toHaveCount(2);
    for(const handle of await handles.all()){
      await handle.evaluate(element=>element.scrollIntoView({block:'center'}));expect((await handle.boundingBox())!.height).toBe(28);
      expect(await handle.evaluate(element=>{const box=element.getBoundingClientRect();return[2,14,26].every(offset=>element.contains(document.elementFromPoint(box.x+box.width/2,box.y+offset)));})).toBe(true);
      const target=mode==='阅读'?handle.locator('..').locator('.tabs-frame,pre > code').first():handle.locator('..').locator('.tabs-frame,.cm-editor').first(),height=(await target.boundingBox())!.height;
      await resize(page,handle);await expect.poll(async()=>(await target.boundingBox())!.height).toBeGreaterThan(height+35);
      expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
    }
  }
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
});
test('Compact tabs expose a pressed management toggle without focusing an input; explicit input remains visible above the IME',async({page})=>{
  await start(page);await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  const block=page.locator('.tabbed-code'),toggle=block.getByRole('button',{name:'管理代码标签页',exact:true});
  await toggle.evaluate(element=>element.scrollIntoView({block:'center'}));expect((await block.locator('.tabs-bar').boundingBox())!.height).toBeLessThanOrEqual(30);
  await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','true');await expect(toggle).toHaveAttribute('aria-expanded','true');expect(await toggle.evaluate(element=>getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);await expect(block.getByLabel('标签页标题')).not.toBeFocused();
  await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/mobile-tabs-management-v1026.png')});
  await block.getByLabel('标签页标题').tap();await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(true);
  await page.setViewportSize({width:393,height:450});await expect.poll(()=>block.getByLabel('标签页标题').evaluate(element=>{const box=element.getBoundingClientRect(),root=element.closest('.mobile-document')!.getBoundingClientRect();return box.top>=root.top&&box.bottom<=root.bottom;})).toBe(true);
  await block.getByLabel('标签页标题').fill('新标题');await toggle.tap();await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(block.locator('.tabs-management')).toBeHidden();await expect(block.getByRole('tab',{name:'新标题',exact:true})).toBeVisible();
});
test('Sheet focus is trapped, Escape and the dim layer dismiss it, and reopening does not wake the keyboard',async({page})=>{
  await start(page);await page.getByRole('button',{name:'文档操作',exact:true}).tap();let dialog=page.getByRole('dialog',{name:'文档操作',exact:true});await expect(dialog).toBeVisible();await expect(dialog).toHaveAttribute('aria-modal','true');
  const last=dialog.getByRole('button',{name:'关闭文档',exact:true});await last.focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'关闭文档操作',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(last).toBeFocused();
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await page.locator('.mobile-document-title').tap();dialog=page.getByRole('dialog',{name:'已打开的文档',exact:true});await expect(dialog).toBeVisible();await page.locator('.mobile-sheet-backdrop').tap({position:{x:10,y:10}});await expect(dialog).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
});
test('Fold headings stay close to the left rail in both modes at large and small text sizes',async({page})=>{
  await start(page);for(const mode of ['阅读','编辑']){if(mode==='编辑')await page.getByRole('tab',{name:mode,exact:true}).tap();const title=page.locator(mode==='阅读'?'.reading-view .folding-quote > summary':'.ProseMirror .folding-quote > p:first-child');await expect(title).toBeVisible();expect(await title.evaluate(element=>parseFloat(getComputedStyle(element).paddingLeft))).toBe(24);}
});
