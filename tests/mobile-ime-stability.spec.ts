import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
const content='普通文字\n\n```js {id=0001}\nconsole.log(1);\nconsole.log(2);\n```\n\n```tabs {id=0002}\n:::js 第一页\nconsole.log(1);\n:::py 第二页\nprint(2)\n```';
async function start(page:Page){await mockAndroid(page,{files:{'note.md':{content}}});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');}
test('Ordinary short taps do not toggle inputmode or blur the same focused editor',async({page})=>{
  await start(page);await page.evaluate(()=>{(window as any).__imeModes=[];(window as any).__imeOut=[];new MutationObserver(records=>{for(const record of records)(window as any).__imeModes.push((record.target as HTMLElement).getAttribute('inputmode'));}).observe(document.querySelector('.mobile-document')!,{subtree:true,attributes:true,attributeFilter:['inputmode']});document.addEventListener('focusout',event=>(window as any).__imeOut.push(event.target));});
  const paragraph=page.locator('.ProseMirror > p').first();await paragraph.tap();await paragraph.tap();
  const code=page.locator('.milkdown-code-block:not(.tabbed-code) .cm-content');await code.tap();await page.evaluate(()=>(window as any).__imeOut=[]);await code.tap();
  expect(await page.evaluate(()=>(window as any).__imeModes)).toEqual([]);expect(await code.evaluate(element=>(window as any).__imeOut.includes(element))).toBe(false);
});
test('Long holds suppress input but a subsequent tap opens the native IME without a focus cycle',async({page})=>{
  await start(page);const code=page.locator('.milkdown-code-block:not(.tabbed-code) .cm-content');await code.evaluate(element=>element.scrollIntoView({block:'center'}));
  await code.dispatchEvent('pointerdown',{pointerType:'touch',clientX:100,clientY:200});await expect(code).toHaveAttribute('inputmode','none');
  await code.focus();await code.dispatchEvent('pointercancel',{pointerType:'touch'});expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await code.evaluate(element=>{(window as any).__imeFocusOut=0;element.addEventListener('focusout',()=>(window as any).__imeFocusOut++);});
  await code.tap();await expect(code).not.toHaveAttribute('inputmode','none');await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(true);expect(await page.evaluate(()=>(window as any).__imeFocusOut)).toBe(0);
});
test('Scrolling cancels a pending hold and moving focus clears only inactive input suppression',async({page})=>{
  await start(page);const paragraph=page.locator('.ProseMirror > p').first(),editor=page.locator('.ProseMirror'),code=page.locator('.milkdown-code-block:not(.tabbed-code) .cm-content');
  await paragraph.dispatchEvent('pointerdown',{pointerType:'touch',clientX:100,clientY:200});await paragraph.dispatchEvent('pointermove',{pointerType:'touch',clientX:100,clientY:240});await paragraph.dispatchEvent('pointercancel',{pointerType:'touch'});await page.waitForTimeout(550);await expect(editor).not.toHaveAttribute('inputmode','none');
  await paragraph.dispatchEvent('pointerdown',{pointerType:'touch',clientX:100,clientY:200});await expect(editor).toHaveAttribute('inputmode','none');await editor.focus();await paragraph.dispatchEvent('pointercancel',{pointerType:'touch'});
  await code.focus();await expect(editor).not.toHaveAttribute('inputmode','none');expect(await code.evaluate(element=>element===document.activeElement)).toBe(true);
});
