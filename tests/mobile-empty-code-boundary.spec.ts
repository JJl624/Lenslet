import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

async function start(page:Page,kind:string,language='text',backward=true){
  const fence='```'+language+'\n```';
  const content=kind==='root'?(backward?'':'<br />\n\n')+fence:kind==='ordered'?'1. sss\n2. 1\n3. <br />\n\n'+fence.split('\n').map(line=>'   '+line).join('\n')+'\n\n4. 3\n5. 3':'- 一级\n\n  - <br />\n\n'+fence.split('\n').map(line=>'    '+line).join('\n')+'\n\n  - 下一项';
  await mockAndroid(page,{files:{'note.md':{content}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  const code=page.locator('.milkdown-code-block');if(language==='tabs')await code.getByRole('button',{name:'显示源码',exact:true}).tap();
  await code.locator('.cm-content').tap();
  if(backward)await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:'换行',exact:true}).tap();
  const p=code.locator(backward?'xpath=following-sibling::p[1]':'xpath=preceding-sibling::p[1]');await expect(p).toBeVisible();await p.tap();
  await expect.poll(()=>p.evaluate(el=>el.contains(getSelection()?.anchorNode||null))).toBe(true);
  return{code,p};
}
for(const kind of ['root','ordered','nested'])for(const method of ['keyboard','beforeinput','dom','dom-code','native-range'])for(const language of ['text','html','tabs'])test(`First deletion outside an empty code block enters it and preserves the block (${kind}, ${method}, ${language})`,async({page})=>{
  const {code,p}=await start(page,kind,language),items=await page.locator('.ProseMirror .list-item').count();
  if(method==='keyboard')await page.keyboard.press('Backspace');
  else if(method==='dom')await p.evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',keyCode:229,bubbles:true}));el.remove();});
  else if(method==='dom-code')await p.evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',keyCode:229,bubbles:true}));el.previousElementSibling!.remove();});
  else if(method==='native-range')await p.evaluate(el=>{const range=document.createRange();range.setStart(el.previousElementSibling!,0);range.setEnd(el,0);getSelection()!.removeAllRanges();getSelection()!.addRange(range);el.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',keyCode:229,bubbles:true}));});
  else expect(await p.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true})))).toBe(false);
  await expect(code).toHaveCount(1);await expect(code.locator('.cm-content')).toBeFocused();
  await expect(page.locator('.ProseMirror .list-item')).toHaveCount(items);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(p).toBeVisible();await expect(code).toHaveCount(1);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(code.locator('.cm-content')).toBeFocused();
  await page.keyboard.insertText('7');await expect(code.locator('.cm-content')).toHaveText('7');
  await page.keyboard.press('Backspace');await expect(code.locator('.cm-content')).toHaveText('');
  await page.keyboard.press('Backspace');await expect(code).toHaveCount(0);await expect(page.locator('.ProseMirror .list-item')).toHaveCount(items);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(code.locator('.cm-content')).toBeFocused();
  await page.keyboard.insertText('8');await expect(code.locator('.cm-content')).toHaveText('8');
});

for(const kind of ['root','ordered','nested'])for(const method of ['keyboard','beforeinput'])for(const language of ['text','html','tabs'])test(`Forward deletion before empty code preserves both the code and its required list paragraph (${kind}, ${method}, ${language})`,async({page})=>{
  const {code,p}=await start(page,kind,language,false),items=await page.locator('.ProseMirror .list-item').count();
  if(method==='keyboard')await page.keyboard.press('Delete');
  else expect(await p.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentForward',bubbles:true,cancelable:true})))).toBe(false);
  await expect(code).toHaveCount(1);await expect(code.locator('.cm-content')).toBeFocused();await expect(page.locator('.ProseMirror .list-item')).toHaveCount(items);
  if(kind!=='root')await expect(p).toBeVisible();
  await page.keyboard.insertText('9');await expect(code.locator('.cm-content')).toHaveText('9');
});

test('An IME Process key alone does not change touch mode or reopen a closed keyboard',async({page})=>{
  const {p}=await start(page,'ordered');
  await p.dispatchEvent('keydown',{key:'Process',keyCode:229,bubbles:true});await expect(page.locator('html')).toHaveAttribute('data-mobile-input','touch');
  await p.dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});await expect(page.locator('html')).toHaveAttribute('data-mobile-input','touch');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false})));
  await p.dispatchEvent('keydown',{key:'Process',keyCode:229,bubbles:true});await expect(page.locator('html')).toHaveAttribute('data-mobile-input','touch');
});

test('An explicit range across empty code can still be deleted after IME input',async({page})=>{
  const {code,p}=await start(page,'ordered');
  await p.dispatchEvent('keydown',{key:'Process',keyCode:229,bubbles:true});
  await p.dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});
  await p.evaluate(el=>{const range=document.createRange();range.setStart(el.previousElementSibling!,0);range.setEnd(el,0);getSelection()!.removeAllRanges();getSelection()!.addRange(range);});
  await p.dispatchEvent('pointerup',{pointerType:'touch',bubbles:true});
  await p.dispatchEvent('keydown',{key:'Process',keyCode:229,bubbles:true});
  await page.keyboard.press('Backspace');await expect(code).toHaveCount(0);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(code).toHaveCount(1);
});

test('Closing and reopening after DOM-first boundary deletion keeps the code in reading mode',async({page})=>{
  const {code,p}=await start(page,'ordered');
  await p.evaluate(el=>{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Process',keyCode:229,bubbles:true}));el.previousElementSibling!.remove();});
  await expect(code.locator('.cm-content')).toBeFocused();
  await page.getByRole('button',{name:'文档操作',exact:true}).tap();await page.getByRole('button',{name:'关闭文档',exact:true}).tap();
  const confirm=page.getByRole('dialog',{name:'未保存的修改'});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'保存并继续',exact:true}).tap();
  await page.locator('[data-path="note.md"] .mobile-file-open').tap();await expect(page.getByRole('tab',{name:'阅读',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);await expect(page.locator('.reading-view')).not.toContainText('```');await expect(page.locator('.reading-view')).not.toContainText('<br />');
});
