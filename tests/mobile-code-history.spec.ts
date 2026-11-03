import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

const body=(language:string)=>language==='tabs'?':::text 第一页\n11\n:::text 第二页\n22':language==='html'?'<p>11</p>':'11';
const fence=(language:string)=>'```'+language+'\n'+body(language)+'\n```';
async function start(page:Page,source:string){
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
}
const nested=(source:string,depth:number)=>depth===0?source:(depth===1?'- 项目\n\n':'- 一级\n\n  - 二级\n\n')+source.split('\n').map(line=>' '.repeat(depth*2)+line).join('\n');
const history=(page:Page,label:string)=>page.getByRole('button',{name:label,exact:true}).tap();
const context=(page:Page,label:string)=>page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:label,exact:true}).tap();
async function codeCaret(page:Page){
  const code=page.locator('.milkdown-code-block .cm-content');await expect(code).toBeFocused();
  await expect.poll(()=>code.evaluate(el=>el.contains(getSelection()?.anchorNode||null))).toBe(true);
}
async function typeAtCodeCaret(page:Page){
  await codeCaret(page);
  const expected=await page.evaluate(async()=>{
    const path='/node_modules/.vite/deps/@codemirror_view.js',{EditorView}=await import(path),view=EditorView.findFromDOM(document.querySelector('.milkdown-code-block .cm-content'));
    const range=view.state.selection.main,source=view.state.doc.toString();return source.slice(0,range.from)+'7'+source.slice(range.to);
  });
  await page.keyboard.insertText('7');await expect(page.locator('.milkdown-code-block .cm-content')).toHaveText(expected);
}
async function removeCode(page:Page,language:string){
  const block=page.locator('.milkdown-code-block');if(language==='tabs')await block.getByRole('button',{name:'显示源码',exact:true}).tap();
  const code=block.locator('.cm-content');await code.tap();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await expect(code).toHaveText('');
  await page.keyboard.press('Backspace');await expect(block).toHaveCount(0);
}

for(const depth of [0,1,2])for(const language of ['text','html','tabs'])test(`Undo code removal restores a typing caret without tapping the restored block (${depth}, ${language})`,async({page})=>{
  await start(page,nested(fence(language),depth));await removeCode(page,language);await history(page,'撤销');
  await typeAtCodeCaret(page);
});

for(const action of ['缩进至列表','脱离列表'])for(const depth of [0,1])for(const language of ['text','html','tabs'])test(`Undo and redo list movement keep the code caret (${action}, ${depth}, ${language})`,async({page})=>{
  const source=action==='缩进至列表'?nested('- 前项\n\n'+fence(language),depth):nested(fence(language),depth+1);
  await start(page,source);await page.locator('.milkdown-code-block .cm-content').tap();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  await context(page,action);await history(page,'撤销');await codeCaret(page);await history(page,'重做');await codeCaret(page);await typeAtCodeCaret(page);
});

for(const language of ['text','html','tabs'])test(`Undo leaving code enters code; redo returns to the separate paragraph (${language})`,async({page})=>{
  await start(page,nested(fence(language),1));await page.locator('.milkdown-code-block .cm-content').tap();await context(page,'换行');
  await history(page,'撤销');await codeCaret(page);await history(page,'重做');
  const code=page.locator('.milkdown-code-block'),p=code.locator('xpath=following-sibling::p[1]');
  await expect(page.locator('.ProseMirror')).toBeFocused();expect(await p.evaluate(el=>el.contains(getSelection()?.anchorNode||null))).toBe(true);
  expect(await p.evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling!.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(0);
  await page.keyboard.insertText('7');await expect(p).toHaveText('7');
});

for(const language of ['text','html','tabs'])test(`History preserves a closed keyboard when it restores or removes code (${language})`,async({page})=>{
  await start(page,fence(language));await removeCode(page,language);await page.evaluate(()=>{(window as any).__mobileState.keyboardVisible=false;window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));});
  const shown=await page.evaluate(()=>(window as any).__mobileCalls['mobile.keyboard-show']||0);
  await history(page,'撤销');await expect(page.locator('.milkdown-code-block')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await history(page,'重做');await expect(page.locator('.milkdown-code-block')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);expect(await page.evaluate(()=>(window as any).__mobileCalls['mobile.keyboard-show']||0)).toBe(shown);
});

for(const language of ['text','tabs'])test(`Keyboard undo and redo also synchronize code and outer text carets (${language})`,async({page})=>{
  await start(page,nested(fence(language),2));await removeCode(page,language);await page.keyboard.press('ControlOrMeta+z');await codeCaret(page);
  await page.keyboard.press('ControlOrMeta+Shift+Z');await expect(page.locator('.milkdown-code-block')).toHaveCount(0);await expect(page.locator('.ProseMirror')).toBeFocused();
  await page.keyboard.press('ControlOrMeta+z');await typeAtCodeCaret(page);
});

for(const language of ['text','tabs'])test(`IME historyUndo restores a code caret through the outer editor (${language})`,async({page})=>{
  await start(page,nested(fence(language),1));await removeCode(page,language);
  await page.locator('.ProseMirror').evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true})));
  await codeCaret(page);await history(page,'重做');await expect(page.locator('.milkdown-code-block')).toHaveCount(0);await expect(page.locator('.ProseMirror')).toBeFocused();
});

for(const depth of [0,1,2])test(`Undo a paused removal restores a visible editor for completely empty tabs (${depth})`,async({page})=>{
  await start(page,nested(fence('tabs'),depth));const block=page.locator('.milkdown-code-block'),code=block.locator('.cm-content');
  await block.getByRole('button',{name:'显示源码',exact:true}).tap();await code.tap();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await expect(code).toHaveText('');
  // Separate clearing the source from removing its block, as on a real phone.
  await page.waitForTimeout(600);await page.keyboard.press('Backspace');await expect(block).toHaveCount(0);
  await history(page,'撤销');await expect(code).toHaveText('');await expect(code).toBeVisible();await codeCaret(page);
  await history(page,'重做');await expect(block).toHaveCount(0);await expect(page.locator('.ProseMirror')).toBeFocused();
  await history(page,'撤销');await expect(code).toBeVisible();await typeAtCodeCaret(page);
});
