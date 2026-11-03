import {test,expect,type Page,type Locator} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

const content=Array.from({length:100},(_,i)=>'段落标记'+String(i).padStart(3,'0')+'，这是用于阅读和编辑定位的正文。').join('\n\n');
async function start(page:Page,source=content){
  await mockAndroid(page,{files:{'a.md':{content:source},'b.md':{content:'文档 B'},'c.md':{content:'文档 C'}}});
  await page.addInitScript(()=>{if(window!==window.top)return;const state=(window as any).__mobileState;state.settings['moyu-save-policy']='manual';state.touchSettings={longPressTimeout:800,doubleTapTimeout:350,touchSlop:8};});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');
}
async function homeOpen(page:Page,path:string){await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await page.locator('[data-path="'+path+'"] .mobile-file-open').tap();await expect(page.locator('.mobile-document-title strong')).toHaveText(path.replace('.md',''));}
async function touch(page:Page,target:Locator,hold:number,move=0){
  await target.evaluate(element=>element.scrollIntoView({block:'center'}));const box=(await target.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,cdp=await page.context().newCDPSession(page);
  try{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});if(move)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+move}]});await page.waitForTimeout(hold);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await cdp.detach();}
}
test('Save has a fixed slot beside the title and never displaces undo or redo',async({page})=>{
  await start(page,'正文');await page.getByRole('tab',{name:'源码',exact:true}).tap();await expect(page.locator('.source-editor')).not.toHaveAttribute('data-editor-pending','true');
  const undo=page.getByRole('button',{name:'撤销',exact:true}),redo=page.getByRole('button',{name:'重做',exact:true}),positions=[(await undo.boundingBox())!.x,(await redo.boundingBox())!.x];
  await page.locator('.source-editor .cm-content').tap();await page.keyboard.insertText('修改');await expect(page.getByRole('button',{name:'保存文档',exact:true})).toBeVisible();
  expect([(await undo.boundingBox())!.x,(await redo.boundingBox())!.x]).toEqual(positions);expect((await page.getByRole('button',{name:'保存文档',exact:true}).boundingBox())!.x).toBeLessThan(positions[0]);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);expect([(await undo.boundingBox())!.x,(await redo.boundingBox())!.x]).toEqual(positions);
});
test('Opened documents form an MRU stack and the document menu closes back through that stack',async({page})=>{
  await start(page);await homeOpen(page,'b.md');await homeOpen(page,'c.md');await homeOpen(page,'a.md');
  await page.locator('.mobile-document-title').tap();expect(await page.locator('.mobile-opened-row > button:first-child').allTextContents()).toEqual(['a','c','b']);
  await page.getByRole('button',{name:'关闭已打开的文档',exact:true}).tap();await page.reload();await expect(page.locator('.mobile-document-title strong')).toHaveText('a');
  for(const expected of ['c','b','']){
    await page.getByRole('button',{name:'文档操作',exact:true}).tap();await page.getByRole('button',{name:'关闭文档',exact:true}).tap();
    if(expected)await expect(page.locator('.mobile-document-title strong')).toHaveText(expected);else await expect(page.locator('.mobile-list-heading')).toBeVisible();
  }
});
test('Reading, editing and source follow the visible content without focusing the editor',async({page})=>{
  await start(page);const paragraph=page.locator('.reading-view p').filter({hasText:'段落标记050'});await paragraph.evaluate(element=>element.scrollIntoView({block:'start'}));
  for(const name of ['编辑','源码','阅读','编辑','阅读']){
    await page.getByRole('tab',{name,exact:true}).tap();await expect(page.locator('.mobile-document [data-editor-pending=true]')).toHaveCount(0);
    await expect.poll(async()=>page.evaluate(()=>{
      const scope=document.querySelector('.mobile-document')!,top=scope.getBoundingClientRect().top;
      const nodes=[...scope.querySelectorAll('.ProseMirror p,.reading-view p,.cm-line')].filter(node=>node.textContent?.includes('段落标记050'));
      return nodes.some(node=>{const rect=node.getBoundingClientRect();return rect.top>=top-45&&rect.top<top+100;});
    }),{message:name+' should keep paragraph 050 visible'}).toBe(true);
    expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  }
});
test('Resize uses the system hold duration, keeps the viewport and never opens a closed keyboard',async({page})=>{
  await start(page,content+'\n\n```js {height=160}\n'+Array.from({length:30},(_,i)=>'console.log('+i+');').join('\n')+'\n```');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const handle=page.getByRole('separator',{name:'拖动调整代码块高度',exact:true});await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,top=await page.locator('.mobile-document').evaluate(element=>element.scrollTop),cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await page.waitForTimeout(500);await expect(handle).not.toHaveClass(/resize-ready/);await page.waitForTimeout(400);await expect(handle).toHaveClass(/resize-ready/);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
  expect(Math.abs(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)-top)).toBeLessThan(3);expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await expect(page.locator('.milkdown-code-block')).toHaveAttribute('data-code-height','210');
});
test('Long pressing an editor link opens it once, while a scroll gesture does not open it',async({page})=>{
  await start(page,'[外部链接](https://example.com/test)\n\n[文档 B](b.md)');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const external=page.locator('.editor-host .inline-syntax').filter({hasText:'外部链接'});await touch(page,external,950);
  await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.openedURL)).toBe('https://example.com/test');expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await touch(page,page.locator('.editor-host a[href="b.md"]'),950,40);await expect(page.locator('.mobile-document-title strong')).toHaveText('a');
  await touch(page,page.locator('.editor-host a[href="b.md"]'),950);await expect(page.locator('.mobile-document-title strong')).toHaveText('b');await expect(page.getByRole('tab',{name:'阅读',exact:true})).toHaveAttribute('aria-selected','true');
});

test('Mode changes keep a code block near the same viewport position in a long structured document',async({page})=>{
  await start(page,content+'\n\n```js {height=160}\n'+Array.from({length:40},(_,i)=>'console.log('+i+');').join('\n')+'\n```\n\n'+content);
  await page.locator('.reading-view .code-block-shell').evaluate(element=>element.scrollIntoView({block:'start'}));
  for(const mode of ['编辑','源码','阅读']){
    await page.getByRole('tab',{name:mode,exact:true}).tap();await expect(page.locator('.mobile-document [data-editor-pending=true]')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>{const root=document.querySelector('.mobile-document')!,top=root.getBoundingClientRect().top;const target=root.querySelector('.milkdown-code-block,.code-block-shell')||[...root.querySelectorAll('.cm-line')].find(node=>node.textContent?.includes('console.log(0)'));if(!target)return false;const box=target.getBoundingClientRect();return box.bottom>top&&box.top<top+140;}),{message:mode+' should keep the code block visible'}).toBe(true);
    expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  }
});

test('A single long wrapped paragraph keeps its visible text through all three modes',async({page})=>{
  await start(page,Array.from({length:500},(_,i)=>'第'+i+'段连续文字，').join(''));
  const offset=()=>page.evaluate(()=>{const p=document.querySelector('.reading-view p')!,scope=p.closest('.mobile-document')!,box=scope.getBoundingClientRect(),point=document.caretRangeFromPoint(box.left+50,box.top+24)!;const range=document.createRange();range.selectNodeContents(p);range.setEnd(point.startContainer,point.startOffset);return range.toString().length;});
  await page.locator('.mobile-document').evaluate(element=>element.scrollTop=1200);const before=await offset();expect(before).toBeGreaterThan(300);
  for(const name of ['编辑','源码','阅读']){
    await page.getByRole('tab',{name,exact:true}).tap();const view=page.locator(name==='编辑'?'.editor-host':name==='源码'?'.source-editor':'.reading-view');await expect(view).toBeVisible();await expect(view).not.toHaveAttribute('data-editor-pending','true');
    await expect.poll(()=>page.evaluate(()=>document.querySelector('.mobile-document')!.scrollTop+(document.querySelector('.source-editor .cm-scroller')?.scrollTop||0))).toBeGreaterThan(300);
  }
  await expect.poll(async()=>Math.abs(await offset()-before)).toBeLessThan(70);
});

test('Hardware arrows can still enter an ordinary code block for typing',async({page})=>{
  await start(page,'前一段\n\n```js {id=0001}\nconsole.log(1);\n```\n\n后一段');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await page.locator('.ProseMirror > p').first().tap();await page.keyboard.press('End');await page.keyboard.press('ArrowDown');
  await expect(page.locator('.milkdown-code-block .cm-content')).toBeFocused();await page.keyboard.insertText('/* 输入 */');await expect(page.locator('.milkdown-code-block')).toContainText('/* 输入 */');
});
