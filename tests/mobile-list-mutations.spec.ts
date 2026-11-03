import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

async function start(page:Page,content:string){
  await mockAndroid(page,{files:{'note.md':{content}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');
}
const edit=async(page:Page)=>{await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');};
const labels=(page:Page)=>page.locator('.ProseMirror .label-wrapper .ordered');
const action=(page:Page,name:string)=>page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name,exact:true}).tap();

test('Mixed ordered delimiters and empty paragraphs are numbered consistently before any edit',async({page})=>{
  const content='1. 33\n\n3) <br />\n\n   <br />';await start(page,content);
  await expect(page.locator('.reading-view ol')).toHaveCount(1);
  await edit(page);await expect(labels(page)).toHaveText(['1.','2.']);await expect(page.locator('.ProseMirror ol')).toHaveCount(1);
  await expect(page.locator('.ProseMirror .list-item').last().locator('p')).toHaveCount(2);
  await page.getByRole('tab',{name:'阅读',exact:true}).tap();await edit(page);await expect(labels(page)).toHaveText(['1.','2.']);
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
  await page.locator('.ProseMirror p').first().tap();await page.keyboard.press('End');await page.keyboard.insertText('4');
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await edit(page);await expect(labels(page)).toHaveText(['1.','2.']);
});

test('Taking a code block out splits numbering into two independent lists starting at one',async({page})=>{
  await start(page,'1. 上方甲\n2. 上方乙\n\n   ```text\n   11\n   ```\n\n3. 下方甲\n4. 下方乙');await edit(page);
  await page.locator('.milkdown-code-block .cm-content').tap();await action(page,'脱离列表');
  await expect(labels(page)).toHaveText(['1.','2.','1.','2.']);await expect(page.locator('.ProseMirror ol')).toHaveCount(2);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(labels(page)).toHaveText(['1.','2.','3.','4.']);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(labels(page)).toHaveText(['1.','2.','1.','2.']);
  await action(page,'缩进至列表');await expect(labels(page)).toHaveText(['1.','2.','3.','4.']);
});

async function invariant(page:Page){
  const error=await page.locator('.ProseMirror').evaluate(root=>{
    for(const list of root.querySelectorAll('ol,ul')){
      const ordered=list.tagName==='OL',start=Number(list.getAttribute('start')??1);
      const items=list.querySelectorAll(':scope > .milkdown-list-item-block > .list-item');
      if(!items.length)return {start,index:-1,actual:'Missing direct list items'};
      for(const [index,item] of [...items].entries()){
        const marker=item.querySelector(':scope > .label-wrapper .label');
        if(marker?.getAttribute('role')==='checkbox')continue;
        if(marker?.textContent!==(ordered?`${start+index}.`:'•'))return {start,index,actual:marker?.textContent};
      }
    }
    return null;
  });expect(error).toBeNull();
}
const wrap=(raw:string,depth:number)=>depth?'- 外层\n\n'+wrap(raw,depth-1).split('\n').map(line=>'  '+line).join('\n'):raw;
const paragraph=(page:Page,text:string)=>page.locator('.ProseMirror p').filter({hasText:new RegExp('^'+text+'$')});

for(const kind of ['ordered','bullet','task'])for(const depth of [0,1,2])for(const first of kind==='ordered'?[1,5]:[1])test(`Typing, splitting, joining, nesting and item deletion stay numbered (${kind}, depth ${depth}, start ${first})`,async({page})=>{
  const marker=(index:number)=>kind==='ordered'?`${first+index}.`:kind==='task'?'- [ ]':'-';
  const content=wrap(['alpha','beta','gamma','delta'].map((text,index)=>`${marker(index)} ${text}`).join('\n'),depth);
  await start(page,content);await edit(page);
  const count=await page.locator('.ProseMirror .list-item').count();
  await paragraph(page,'gamma').tap();
  await paragraph(page,'gamma').evaluate(p=>{p.closest<HTMLElement>('.ProseMirror')!.focus();getSelection()!.collapse(p.firstChild!,2);});
  await expect.poll(()=>page.evaluate(()=>getSelection()?.anchorOffset)).toBe(2);await page.keyboard.press('Enter');
  await expect(paragraph(page,'ga')).toBeVisible();await expect(paragraph(page,'mma')).toBeVisible();await invariant(page);
  await page.waitForTimeout(600); // Keep this deletion separate from typing in history.
  await page.keyboard.press('Backspace');await expect(page.locator('.ProseMirror .list-item')).toHaveCount(count);await invariant(page);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(page.locator('.ProseMirror .list-item')).toHaveCount(count+1);await invariant(page);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(page.locator('.ProseMirror .list-item')).toHaveCount(count);await invariant(page);
  await page.keyboard.press('Backspace');await expect(paragraph(page,'gamma')).toBeVisible();await invariant(page);
  await paragraph(page,'gamma').tap();await page.keyboard.press('Tab');await invariant(page);
  const nested=await paragraph(page,'gamma').evaluate(p=>p.closest('.list-item')?.parentElement?.parentElement?.closest('.list-item')?.textContent);expect(nested).toContain('beta');
  await page.keyboard.press('Shift+Tab');await invariant(page);
  await paragraph(page,'alpha').tap();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.insertText('inserted');await expect(paragraph(page,'inserted')).toBeVisible();await invariant(page);
  await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await expect(paragraph(page,'inserted')).toHaveCount(0);await invariant(page);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await edit(page);await invariant(page);
  for(const text of ['alpha','beta','gamma','delta'])await expect(paragraph(page,text)).toHaveCount(1);
});

for(const kind of ['ordered','bullet','task'])for(const depth of [0,1])for(const key of ['Backspace','Delete'])test(`Deleting across items removes intervening code, table and quote in one undoable change (${kind}, ${depth}, ${key})`,async({page})=>{
  const mark=(index:number)=>kind==='ordered'?`${index+1}.`:kind==='task'?'- [ ]':'-';
  const indent=kind==='ordered'?3:kind==='task'?2:2;
  const resources='```text\n11\n```\n\n| a | b |\n| - | - |\n| c | d |\n\n> 引用';
  const content=wrap(`${mark(0)} alpha\n${mark(1)} beta\n\n`+resources.split('\n').map(line=>' '.repeat(indent)+line).join('\n')+`\n\n${mark(2)} gamma\n${mark(3)} delta`,depth);
  await start(page,content);await edit(page);await expect(page.locator('.milkdown-code-block')).toHaveCount(1);
  await paragraph(page,'alpha').tap();
  await page.locator('.ProseMirror').evaluate(root=>{
    const a=[...root.querySelectorAll('p')].find(p=>p.textContent==='alpha')!,b=[...root.querySelectorAll('p')].find(p=>p.textContent==='delta')!;
    root.focus();getSelection()!.setBaseAndExtent(a.firstChild!,a.firstChild!.textContent!.length,b.firstChild!,0);
  });
  await expect.poll(()=>page.evaluate(()=>getSelection()?.toString().includes('gamma'))).toBe(true);
  await page.keyboard.press(key);await expect(paragraph(page,'alphadelta')).toBeVisible();await expect(page.locator('.milkdown-code-block')).toHaveCount(0);await expect(page.locator('.milkdown-table-block')).toHaveCount(0);await invariant(page);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(paragraph(page,'gamma')).toBeVisible();await expect(page.locator('.milkdown-code-block')).toHaveCount(1);await expect(page.locator('.milkdown-table-block')).toHaveCount(1);await invariant(page);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(paragraph(page,'alphadelta')).toBeVisible();await invariant(page);
});

for(const resource of ['code','table','image'])for(const depth of [0,1,2])test(`Moving ${resource} out of and back into a list resets or joins numbering immediately (${depth})`,async({page})=>{
  const block=resource==='code'?'```text\n11\n```':resource==='table'?'| a | b |\n| - | - |\n| c | d |':'![图](missing.svg)';
  await start(page,wrap('5. alpha\n6. beta\n\n'+block.split('\n').map(line=>'   '+line).join('\n')+'\n\n7. gamma\n8. delta',depth));await edit(page);
  const target=resource==='code'?page.locator('.milkdown-code-block .cm-content'):resource==='table'?page.locator('.ProseMirror td p').first():page.locator('.visual-attachment');
  if(resource==='image'){
    const id=await target.getAttribute('data-attachment-preview');if(id&&await page.locator('#'+id).isVisible())await page.locator('#'+id).tap();
    await target.locator('.syntax-raw').tap();
  }else await target.tap();
  for(let repeat=0;repeat<2;repeat++){
    await action(page,'脱离列表');await expect(labels(page)).toHaveText(['5.','6.','1.','2.']);await invariant(page);
    await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(labels(page)).toHaveText(['5.','6.','7.','8.']);
    await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(labels(page)).toHaveText(['5.','6.','1.','2.']);
    await action(page,'缩进至列表');await expect(labels(page)).toHaveText(['5.','6.','7.','8.']);await invariant(page);
  }
  await paragraph(page,'delta').tap();await page.keyboard.press('End');await page.keyboard.insertText('!');
  await expect(paragraph(page,'delta!')).toBeVisible();await invariant(page);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await edit(page);await expect(labels(page)).toHaveText(['5.','6.','7.','8.']);
});

test('An intentional empty paragraph remains a list boundary after deleting its text and saving',async({page})=>{
  await start(page,'1. alpha\n2. beta\n\n分隔段落\n\n1. gamma\n2. delta');await edit(page);
  await paragraph(page,'分隔段落').tap();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
  await expect(paragraph(page,'分隔段落')).toHaveCount(0);await expect(labels(page)).toHaveText(['1.','2.','1.','2.']);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await edit(page);await expect(labels(page)).toHaveText(['1.','2.','1.','2.']);
  await expect(page.locator('.ProseMirror > p')).toHaveCount(1);
});
