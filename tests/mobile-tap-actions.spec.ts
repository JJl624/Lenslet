import {test,expect,type Page,type Locator} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="orange"/></svg>';
const content='开头文字\n\n![图片|140](image.svg)\n\n普通 **粗体** [外部链接](https://example.com/tap) ==高亮== $x+1$ 文字\n\n- 列表里的 ![列表图片|120](image.svg) 后文\n\n- [ ] 任务文字\n\n> [+] 折叠标题\n> 引用内容\n\n| 第一列 | 第二列 |\n| --- | --- |\n| 单元格文字 | 另一个单元格 |\n\n```js {id=0001}\nconsole.log(1);\n```\n\n'+Array.from({length:20},(_,i)=>'结尾文字 '+i).join('\n\n');
async function start(page:Page){await mockAndroid(page,{files:{'note.md':{content},'image.svg':{content:svg}}});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.ProseMirror')).toBeVisible();await expect(page.locator('.attachment-overlay img')).toHaveCount(2);}
async function touch(page:Page,target:Locator,dx:number,dy:number,hold=30){
  await target.evaluate(element=>element.scrollIntoView({block:'center'}));const box=(await target.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(hold);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
}
test('One touch opens image source and places an editable caret, including after leaving CodeMirror',async({page})=>{
  await start(page);
  for(const index of [0,1,0]){
    await page.locator('.milkdown-code-block .cm-content').tap();await page.locator('.attachment-overlay img').nth(index).tap();
    const raw=page.locator('.visual-attachment .syntax-raw').nth(index);await expect(raw).toBeVisible();expect(await raw.evaluate(element=>element.contains(getSelection()?.anchorNode||null))).toBe(true);expect(await page.evaluate(()=>document.activeElement?.classList.contains('ProseMirror'))).toBe(true);
    await page.locator('.ProseMirror > p').first().tap();await expect(page.locator('.attachment-overlay img').nth(index)).toBeVisible();
  }
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
});
test('Small finger movement is a tap; panning an image scrolls without opening its source or keyboard',async({page})=>{
  await start(page);const image=page.locator('.attachment-overlay img').first(),raw=page.locator('.visual-attachment .syntax-raw').first();await touch(page,image,3,1);await expect(raw).toBeVisible();await page.locator('.ProseMirror > p').first().tap();await expect(image).toBeVisible();
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));});
  await image.evaluate(element=>element.scrollIntoView({block:'center'}));const before=await page.locator('.mobile-document').evaluate(element=>element.scrollTop);await touch(page,image,0,-100,80);await expect(raw).toBeHidden();expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBeGreaterThan(before+20);expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
});
test('Short taps edit rendered links and inline styles without following the link',async({page})=>{
  await start(page);
  for(const value of ['外部链接','粗体','高亮','x+1']){
    const inline=page.locator('.ProseMirror .inline-syntax').filter({hasText:value}).first();await inline.locator('.syntax-preview').tap();await expect(inline.locator('.syntax-raw')).toBeVisible();expect(await inline.locator('.syntax-raw').evaluate(element=>element.contains(getSelection()?.anchorNode||null))).toBe(true);await page.locator('.ProseMirror > p').first().tap();
  }expect(await page.evaluate(()=>(window as any).__mobileState.openedURL)).toBeUndefined();
});
test('A cell and text after code take the caret in one tap; fold controls keep a closed keyboard closed',async({page})=>{
  await start(page);await page.locator('.milkdown-code-block .cm-content').tap();const cell=page.locator('.ProseMirror td').filter({hasText:'单元格文字'});await cell.tap();expect(await cell.evaluate(element=>element.contains(getSelection()?.anchorNode||null))).toBe(true);
  await page.locator('.milkdown-code-block .cm-content').tap();const paragraph=page.locator('.ProseMirror > p').filter({hasText:'结尾文字 0'});await paragraph.tap();expect(await paragraph.evaluate(element=>element.contains(getSelection()?.anchorNode||null))).toBe(true);
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));});const fold=page.locator('.folding-quote');await fold.locator('button').first().tap();await expect(fold).toHaveAttribute('data-fold-open','false');expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  const task=page.getByRole('checkbox',{name:'完成列表任务',exact:true});await task.tap();await expect(task).toHaveAttribute('aria-checked','true');await task.tap();await expect(task).toHaveAttribute('aria-checked','false');expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
});
test('Holding an image does not turn the hold into an edit tap',async({page})=>{
  await start(page);await touch(page,page.locator('.attachment-overlay img').first(),0,0,700);await expect(page.locator('.visual-attachment .syntax-raw').first()).toBeHidden();expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
});
test('A held overlay also suppresses native editor focus, while the next tap can edit it',async({page})=>{
  await start(page);const image=page.locator('.attachment-overlay img').first(),editor=page.locator('.ProseMirror');await image.dispatchEvent('pointerdown',{pointerType:'touch',button:0,clientX:80,clientY:180});await expect(editor).toHaveAttribute('inputmode','none');await editor.focus();await image.dispatchEvent('pointercancel',{pointerType:'touch'});expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await image.tap();await expect(page.locator('.visual-attachment .syntax-raw').first()).toBeVisible();await expect(editor).not.toHaveAttribute('inputmode','none');await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(true);
});
