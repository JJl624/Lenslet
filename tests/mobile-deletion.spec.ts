import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

async function start(page:Page,content:string){
  await mockAndroid(page,{files:{'note.md':{content}}});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
}
async function afterCode(page:Page){
  const code=page.locator('.milkdown-code-block');await code.locator('.cm-content').tap();
  await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:'换行',exact:true}).tap();
  await expect(code.locator('xpath=following-sibling::p[1]')).toBeVisible();
}
for(const list of ['root','ordered','nested'] as const)test(`Backspace on an empty line after code enters the code editor, not its outer footer (${list})`,async({page})=>{
  const content=list==='root'?'```text\n11\n```':list==='ordered'?'1. 项目\n\n   ```text\n   11\n   ```':'- 一级\n\n  - 二级\n\n    ```text\n    11\n    ```';
  await start(page,content);await afterCode(page);
  await page.keyboard.press('Backspace');
  const editable=page.locator('.milkdown-code-block .cm-content');await expect(editable).toBeFocused();
  const items=await page.locator('.ProseMirror .list-item').count();
  await page.keyboard.press('Backspace');await expect(editable).toHaveText('1');
  await expect(page.locator('.ProseMirror .list-item')).toHaveCount(items);
  await page.keyboard.insertText('1');await expect(editable).toHaveText('11');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await page.getByRole('button',{name:'重做',exact:true}).tap();
  await expect(editable).toHaveText('11');
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
});

test('Forward Delete before code enters its first character; empty code can become a paragraph',async({page})=>{
  await start(page,'前文\n\n```text\n11\n```');const first=page.locator('.ProseMirror > p').first();
  await first.tap();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');const code=page.locator('.milkdown-code-block .cm-content');await expect(code).toBeFocused();
  await page.keyboard.insertText('0');await expect(code).toHaveText('011');
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await expect(code).toHaveText('');
  await page.keyboard.press('Backspace');await expect(page.locator('.milkdown-code-block')).toHaveCount(0);
  await page.keyboard.insertText('正文');await expect(page.locator('.ProseMirror p')).toHaveText('正文');
});

for(const nested of [false,true])for(const key of ['Backspace','Delete'])test(`Table boundary deletion keeps a real text position or a visible node selection (${nested?'list':'root'}, ${key})`,async({page})=>{
  const table='| 列 | 值 |\n| --- | --- |\n| 数据 | 1 |',raw=nested?'- 项目\n\n'+table.split('\n').map(line=>'  '+line).join('\n')+'\n\n  尾文':'前文\n\n'+table+'\n\n尾文';
  await start(page,raw);const p=page.locator('.ProseMirror p').filter({hasText:key==='Backspace'?/^尾文$/:nested?/^项目$/:/^前文$/});
  await p.tap();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
  const items=await page.locator('.ProseMirror .list-item').count();await page.keyboard.press(key);
  const hidden=await page.locator('.ProseMirror').evaluate(el=>el.classList.contains('ProseMirror-hideselection'));
  if(hidden){
    await expect(page.locator('.ProseMirror')).toHaveCSS('caret-color','rgba(0, 0, 0, 0)');
    await page.keyboard.press(key);await expect(page.locator('.milkdown-table-block')).toHaveCount(0);
  }else{
    expect(await page.evaluate(()=>{const n=getSelection()?.anchorNode,e=n?.nodeType===1?n as Element:n?.parentElement;return !!e?.closest('p');})).toBe(true);
    await expect(page.locator('.milkdown-table-block table.children')).toContainText('数据');
    await page.locator('.ProseMirror table.children td p').first().tap();
    await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:'删除表格',exact:true}).tap();await expect(page.locator('.milkdown-table-block')).toHaveCount(0);
  }
  await expect(page.locator('.ProseMirror .list-item')).toHaveCount(items);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(page.locator('.milkdown-table-block table.children')).toHaveCount(1);
});

test('Cell text deletion does not remove neighboring cells, rows or table',async({page})=>{
  await start(page,'- 项目\n\n  | 列 | 值 |\n  | --- | --- |\n  | 数据 | 保留 |');
  const cell=page.locator('.ProseMirror table.children td p').first();await cell.tap();
  await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');await expect(cell).toHaveText('');
  await expect(page.locator('.ProseMirror table.children tr')).toHaveCount(2);await expect(page.locator('.ProseMirror table.children td')).toHaveCount(2);
  await expect(page.locator('.ProseMirror table.children td p').last()).toHaveText('保留');
  await page.keyboard.insertText('新值');await expect(cell).toHaveText('新值');
});

for(const kind of ['image','underline','highlight','link','bold','italic','strike','math'] as const)test(`Selected ${kind} deletion removes its whole source and undo restores it`,async({page})=>{
  const source={image:'![图片](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iNTAiPjwvc3ZnPg==)',underline:'__下划线__',highlight:'==高亮==',link:'[链接](https://example.com/)',bold:'**加粗**',italic:'*斜体*',strike:'~~删除线~~',math:'$x^2$'}[kind];
  await start(page,'前文\n\n'+source+'\n\n后文');
  await page.locator('.ProseMirror > p').nth(1).evaluate(p=>{const editor=p.closest<HTMLElement>('.ProseMirror')!;editor.focus();const range=document.createRange();range.selectNodeContents(p);const selected=getSelection()!;selected.removeAllRanges();selected.addRange(range);});
  await page.keyboard.press('Backspace');await expect(page.locator('.ProseMirror > p').nth(1)).toHaveText('');
  await expect(page.locator('.ProseMirror > p').first()).toHaveText('前文');await expect(page.locator('.ProseMirror > p').last()).toHaveText('后文');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(page.locator('.ProseMirror > p').nth(1)).not.toHaveText('');
  await page.getByRole('tab',{name:'源码',exact:true}).tap();await expect(page.locator('.source-editor .cm-content')).toContainText(source);
});

for(const key of ['Backspace','Delete'])test(`A selection across list, code, table, image and folded quote deletes cleanly (${key})`,async({page})=>{
  await start(page,'开头\n\n- 列表\n\n  ```text\n  11\n  ```\n\n  | 列 | 值 |\n  | --- | --- |\n  | 数据 | 1 |\n\n  ![图片](image.svg)\n\n> [-] 标题\n> 隐藏内容\n\n```tabs\n:::text 第一页\n111\n:::text 第二页\n222\n```\n\n结尾');
  await page.locator('.ProseMirror > p').first().tap();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press(key);
  await expect(page.locator('.milkdown-code-block,.milkdown-table-block,.visual-attachment,.folding-quote,.attachment-overlay')).toHaveCount(0);
  await expect(page.locator('.ProseMirror p')).toHaveCount(1);await page.keyboard.insertText('新正文');await expect(page.locator('.ProseMirror p')).toHaveText('新正文');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await page.getByRole('button',{name:'撤销',exact:true}).tap();
  await expect(page.locator('.milkdown-code-block')).toHaveCount(2);await expect(page.locator('.milkdown-table-block')).toHaveCount(1);
});

test('IME deletion intent is cleared by touch and keyboard dismissal; cut does not arm code focus',async({page})=>{
  await start(page,'普通文字');const editor=page.locator('.ProseMirror'),host=page.locator('.editor-host');await editor.tap();
  await editor.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true})));await expect(host).toHaveAttribute('data-mobile-deletion','true');
  await page.getByRole('tab',{name:'编辑',exact:true}).dispatchEvent('pointerdown',{pointerType:'touch',bubbles:true});await expect(host).not.toHaveAttribute('data-mobile-deletion','true');
  await editor.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteByCut',bubbles:true})));await expect(host).not.toHaveAttribute('data-mobile-deletion','true');
  await editor.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteWordBackward',bubbles:true})));await expect(host).toHaveAttribute('data-mobile-deletion','true');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false})));await expect(host).not.toHaveAttribute('data-mobile-deletion','true');
});

for(const list of ['ordered','bullet','nested'])for(const language of ['text','html','tabs'])test(`Code indentation hands input to the inner editor (${list}, ${language})`,async({page})=>{
  const body=language==='tabs'?':::text 第一页\n11\n:::text 第二页\n22':language==='html'?'<p>11</p>':'11';
  const fence='```'+language+'\n'+body+'\n```';
  await start(page,list==='nested'?'- 一级\n\n  - 二级\n\n'+fence.split('\n').map(line=>'  '+line).join('\n'):(list==='ordered'?'1. 项目':'- 项目')+'\n\n'+fence);
  const code=page.locator('.milkdown-code-block'),editable=code.locator('.cm-content');await editable.tap();
  await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
  const bar=page.getByRole('toolbar',{name:'文本格式'});
  const depth=()=>code.evaluate(el=>{let n=el.parentElement,count=0;while(n){if(n.matches('.list-item'))count++;n=n.parentElement;}return count;});
  const originalDepth=await depth();
  await bar.getByRole('button',{name:'缩进至列表',exact:true}).tap();await expect(editable).toBeFocused();
  expect(await depth()).toBe(originalDepth+1);
  const before=await editable.textContent();await page.keyboard.insertText('7');await expect(editable).toHaveText(before!.slice(0,1)+'7'+before!.slice(1));await page.keyboard.press('Backspace');await expect(editable).toHaveText(before!);
  await bar.getByRole('button',{name:'脱离列表',exact:true}).tap();await expect(editable).toBeFocused();
  expect(await depth()).toBe(originalDepth);
  await page.keyboard.insertText('8');await expect(editable).toHaveText(before!.slice(0,1)+'8'+before!.slice(1));await page.keyboard.press('Backspace');await expect(editable).toHaveText(before!);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false})));
  const shown=await page.evaluate(()=>(window as any).__mobileCalls['mobile.keyboard-show']||0);
  await bar.getByRole('button',{name:'缩进至列表',exact:true}).tap();await expect(editable).not.toBeFocused();
  expect(await page.evaluate(()=>(window as any).__mobileCalls['mobile.keyboard-show']||0)).toBe(shown);
});

test('Moving a code block preserves a backward text selection and undo restores its list level',async({page})=>{
  await start(page,'- 项目\n\n```text\n12345\n```');
  const code=page.locator('.milkdown-code-block'),editable=code.locator('.cm-content'),bar=page.getByRole('toolbar',{name:'文本格式'});
  await editable.tap();await page.keyboard.press('Home');await page.keyboard.press('End');await page.keyboard.press('Shift+ArrowLeft');await page.keyboard.press('Shift+ArrowLeft');
  await bar.getByRole('button',{name:'缩进至列表',exact:true}).tap();await expect(editable).toBeFocused();
  expect(await page.evaluate(()=>getSelection()?.toString())).toBe('45');
  await page.keyboard.insertText('9');await expect(editable).toHaveText('1239');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(editable).toHaveText('12345');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();expect(await code.evaluate(el=>!!el.closest('.list-item'))).toBe(false);
  await page.getByRole('button',{name:'重做',exact:true}).tap();expect(await code.evaluate(el=>!!el.closest('.list-item'))).toBe(true);
});

for(const container of ['root','list','nested'])for(const language of ['text','html','tabs'])test(`Soft IME deletion removes an empty code block and keeps a real paragraph (${container}, ${language})`,async({page})=>{
  const fence='```'+language+'\n'+(language==='tabs'?':::text 第一页\n11':'11')+'\n```';
  await start(page,container==='root'?fence:container==='list'?'- 项目\n\n'+fence.split('\n').map(line=>'  '+line).join('\n'):'- 一级\n\n  - 二级\n\n'+fence.split('\n').map(line=>'    '+line).join('\n'));
  const block=page.locator('.milkdown-code-block');
  if(language==='tabs')await block.getByRole('button',{name:'显示源码',exact:true}).tap();
  const code=block.locator('.cm-content');await code.tap();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.press('Backspace');await expect(code).toHaveText('');
  await code.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true})));
  await expect(block).toHaveCount(0);expect(await page.evaluate(()=>{const n=getSelection()?.anchorNode;return !!n?.parentElement?.closest('.cm-editor');})).toBe(false);
  await page.keyboard.insertText('正文');const text=page.locator('.ProseMirror p').filter({hasText:/^正文$/});await expect(text).toBeVisible();
  expect(await text.evaluate(el=>{let count=0;for(let n=el.parentElement;n;n=n.parentElement)if(n.matches('.list-item'))count++;return count;})).toBe(container==='root'?0:container==='list'?1:2);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(block).toHaveCount(1);
});
