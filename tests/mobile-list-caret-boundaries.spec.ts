import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Leaving code through its context action focuses the visible paragraph directly',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'- 项目\n\n  ```text\n  11\n  ```'}}});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await page.locator('.milkdown-code-block .cm-content').tap();
  await page.evaluate(()=>{
    (window as any).__outerFocus=[];
    document.querySelector('.ProseMirror')!.addEventListener('focusin',event=>{
      if(event.target!==event.currentTarget)return;
      const node=getSelection()?.anchorNode,e=node?.nodeType===1?node as Element:node?.parentElement;
      (window as any).__outerFocus.push({inCode:!!e?.closest('.cm-editor'),paragraph:!!e?.closest('p')});
    });
  });
  await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:'换行',exact:true}).tap();
  const focus=await page.evaluate(()=>(window as any).__outerFocus);
  expect(focus.length).toBeGreaterThan(0);expect(focus.every((entry:any)=>!entry.inCode&&entry.paragraph)).toBe(true);
  await page.keyboard.insertText('块外输入');await expect(page.locator('.ProseMirror p').last()).toHaveText('块外输入');
  await expect(page.locator('.cm-content')).toHaveText('11');
});

// The resize footer has a fixed touch height even when prose is very small.
// Exercise the actual footer target, not a programmatically focused paragraph.
for(const size of [10,17,24])for(const list of ['ordered','task','nested'] as const){
  test(`List code footer creates a separate typing line (${list}, ${size}px)`,async({page})=>{
    const raw=list==='ordered'?'1. 项目\n\n   ```text\n   11\n   ```':list==='task'?'- [ ] 项目\n\n  ```text\n  11\n  ```':'- 一级\n\n  - 二级\n\n    ```text\n    11\n    ```';
    await mockAndroid(page,{files:{'note.md':{content:raw}}});
    await page.addInitScript(size=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-mobile-size']=String(size);(window as any).__mobileState.settings['moyu-save-policy']='manual';},size);
    await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
    const code=page.locator('.milkdown-code-block');await code.locator('.cm-content').tap();
    await expect(code.locator('.code-resize')).toBeVisible();
    await page.evaluate(()=>document.addEventListener('touchend',event=>{(window as any).__footerTouchCancelled=event.defaultPrevented;},{once:true}));
    const rect=(await code.boundingBox())!;await page.touchscreen.tap(rect.x+10,rect.y+rect.height-2);
    const continuation=code.locator('xpath=following-sibling::p[1]');await expect(continuation).toBeVisible();
    const position=await continuation.evaluate(p=>{const selection=getSelection(),node=selection?.anchorNode;return{inside:!!node&&p.contains(node),top:p.getBoundingClientRect().top,codeBottom:p.previousElementSibling!.getBoundingClientRect().bottom};});
    expect(position.inside).toBe(true);expect(position.top).toBeGreaterThanOrEqual(position.codeBottom);
    expect(await page.evaluate(()=>(window as any).__footerTouchCancelled)).toBe(true);
    await page.keyboard.insertText('*');await expect(continuation).toHaveText('*');await expect(code.locator('.cm-content')).toHaveText('11');
    await page.keyboard.press('Space');await page.keyboard.insertText('新项目');
    const child=page.locator('.ProseMirror p').filter({hasText:/^新项目$/});await expect(child).toBeVisible();
    expect(await child.evaluate(p=>{let depth=0;for(let n=p.parentElement;n;n=n.parentElement)if(n.classList.contains('list-item'))depth++;return depth;})).toBe(list==='nested'?3:2);
    await page.getByRole('button',{name:'撤销',exact:true}).tap();await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(child).toBeVisible();
    await expect(code.locator('.cm-content')).toHaveText('11');
    expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(raw);
  });
}
