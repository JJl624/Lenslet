import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Backspace with multiple code selections deletes characters without converting the block',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'```text\nabc\n```'}},engine:'gecko'});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const code=page.locator('.milkdown-code-block .cm-content');await code.tap();
  await page.evaluate(async()=>{
    const viewPath='/node_modules/.vite/deps/@codemirror_view.js',statePath='/node_modules/.vite/deps/@codemirror_state.js';
    const {EditorView}=await import(viewPath),{EditorState,EditorSelection,StateEffect}=await import(statePath);
    const view=EditorView.findFromDOM(document.querySelector('.milkdown-code-block .cm-content'));
    view.dispatch({effects:StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)),selection:EditorSelection.create([EditorSelection.cursor(0),EditorSelection.cursor(2)])});
    if(view.state.selection.ranges.length!==2)throw Error('Multiple selections were not configured');
  });
  await page.keyboard.press('Backspace');await expect(code).toHaveText('ac');
});

test('An active IME composition owns empty-code deletion even when beforeinput omits isComposing',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'```text\n\n```'}},engine:'gecko'});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const code=page.locator('.milkdown-code-block .cm-content');await code.tap();
  await code.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{data:'',bubbles:true}));el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true}));});
  await expect(code).toHaveCount(1);
  await code.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{data:'',bubbles:true})));
  await code.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true})));
  await expect(page.locator('.milkdown-code-block')).toHaveCount(0);await page.keyboard.insertText('正文');await expect(page.locator('.ProseMirror p')).toHaveText('正文');
});
