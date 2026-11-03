import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

async function start(page:Page,content:string){
  await mockAndroid(page,{files:{'note.md':{content}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
}
async function format(page:Page,label:string){
  await page.getByRole('button',{name:'全部格式',exact:true}).tap();
  await page.getByRole('dialog',{name:'全部格式',exact:true}).getByRole('button',{name:label,exact:true}).tap();
}
for(const kind of ['ordered','bullet','task','nested'])test(`Empty first paragraph and later text stay in the same list item after view changes (${kind})`,async({page})=>{
  const list=kind==='ordered'?'1. first\n2. middle\n3. last':kind==='task'?'- [ ] first\n- [ ] middle\n- [ ] last':'- first\n- middle\n- last';
  await start(page,kind==='nested'?'- outer\n\n'+list.split('\n').map(line=>'  '+line).join('\n'):list);
  const middle=page.locator('.ProseMirror p').filter({hasText:/^middle$/});await middle.tap();await middle.evaluate(p=>{p.closest<HTMLElement>('.ProseMirror')!.focus();const range=document.createRange();range.selectNodeContents(p);getSelection()!.removeAllRanges();getSelection()!.addRange(range);});
  await expect.poll(()=>page.evaluate(()=>getSelection()?.toString())).toBe('middle');await page.keyboard.press('Backspace');
  await format(page,'换行');await page.keyboard.insertText('1');
  const item=page.locator('.ProseMirror .list-item').filter({has:page.locator('p',{hasText:/^1$/})}).last();
  await expect(item.locator(':scope > .children > .content-dom > p')).toHaveText(['','1']);
  for(let repeat=0;repeat<2;repeat++){
    await page.getByRole('tab',{name:'阅读',exact:true}).tap();await expect(page.locator('.reading-view li').filter({has:page.locator('p',{hasText:/^1$/})}).last()).toBeVisible();
    await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(item.locator(':scope > .children > .content-dom > p')).toHaveText(['','1']);
    await expect(page.locator('.ProseMirror p').filter({hasText:/^last$/})).toBeVisible();
  }
  const text=item.locator('p').last();await text.tap();await page.keyboard.press('End');await page.keyboard.insertText('2');await expect(page.locator('.ProseMirror p').filter({hasText:/^12$/})).toBeVisible();
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await expect(page.locator('.ProseMirror p').filter({hasText:/^12$/})).toBeVisible();
  await expect(page.locator('.ProseMirror p').filter({hasText:/^last$/})).toBeVisible();
});
