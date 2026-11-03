import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

const prose=Array.from({length:35},(_,i)=>'第 '+i+' 段。').join('\n\n');
async function send(page:Page,sequence:number,bottom:number,progress=1){
  await page.evaluate(({sequence,bottom,progress})=>window.dispatchEvent(new CustomEvent('moyu-mobile-viewport',{detail:{sequence,animation:1,phase:progress===1?'end':'start',width:1179,height:2256,bottom,startBottom:2256,targetBottom:1431,visible:true,animating:progress!==1,progress}})),{sequence,bottom,progress});
}
for(const size of [17,24])for(const tail of ['paragraph','code','table'] as const)test(`The last empty line stays above the IME with two lines of space (${tail}, ${size}px)`,async({page})=>{
  const suffix=tail==='code'?'\n\n```text\n11\n```':tail==='table'?'\n\n| 列 | 值 |\n| --- | --- |\n| 数据 | 1 |':'';
  await page.setViewportSize({width:393,height:752});await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:prose+suffix}}});
  await page.addInitScript(size=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-mobile-size']=String(size));},size);
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  if(tail==='paragraph'){await page.locator('.ProseMirror > p').last().tap();await page.keyboard.press('End');await page.keyboard.press('Enter');}
  else{await page.locator(tail==='code'?'.milkdown-code-block .cm-content':'.ProseMirror table.children td p').first().tap();await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:'换行',exact:true}).tap();}
  await page.evaluate(()=>{const p=document.querySelector('.ProseMirror > p:last-child')!,editor=p.closest<HTMLElement>('.ProseMirror')!;editor.focus({preventScroll:true});getSelection()!.collapse(p,0);const scope=p.closest('.mobile-document')!;scope.scrollTop=scope.scrollHeight;});
  expect(await page.locator('.ProseMirror > p').last().textContent()).toBe('');
  await send(page,10,2256,0);await send(page,11,1431);
  const result=await page.evaluate(async()=>{const {viewportTarget,caretClearance}=await import('/src/mobile/viewportTarget.ts'),target=viewportTarget(true)!;return{bottom:target.rect.bottom,boundary:target.scroller.getBoundingClientRect().bottom,clearance:caretClearance(target),scroll:target.scroller.scrollTop};});
  expect(result.bottom).toBeLessThanOrEqual(result.boundary-result.clearance+3);expect(result.scroll).toBeGreaterThan(0);
  await page.keyboard.insertText('9');await expect(page.locator('.ProseMirror > p').last()).toHaveText('9');
});

test('An already visible keyboard reveals a newly tapped empty last line without needing an input event',async({page})=>{
  await page.setViewportSize({width:393,height:752});await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:prose}}});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await page.locator('.ProseMirror > p').last().tap();await page.keyboard.press('End');await page.keyboard.press('Enter');await send(page,10,2256,0);await send(page,11,1431);
  const before=await page.evaluate(()=>{const p=document.querySelector('.ProseMirror > p:last-child')!,scope=p.closest('.mobile-document')!;getSelection()!.collapse(p,0);scope.scrollTop=Math.max(0,scope.scrollHeight-scope.clientHeight-200);window.dispatchEvent(new Event('moyu-mobile-caret-tap'));return scope.scrollTop;});
  await expect.poll(()=>page.locator('.mobile-document').evaluate(el=>el.scrollTop)).toBeGreaterThan(before);
  await expect.poll(()=>page.locator('.ProseMirror > p').last().evaluate(p=>p.getBoundingClientRect().bottom-p.closest('.mobile-document')!.getBoundingClientRect().bottom)).toBeLessThan(0);
});

test('A selected table is not treated as a text caret by keyboard avoidance',async({page})=>{
  await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:'| 列 |\n| --- |\n| 内容 |\n\n尾文'}}});await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await page.locator('.ProseMirror p').last().tap();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');
  await expect(page.locator('.ProseMirror')).toHaveClass(/ProseMirror-hideselection/);
  expect(await page.evaluate(async()=>!!(await import('/src/mobile/viewportTarget.ts')).viewportTarget(true))).toBe(false);
});
