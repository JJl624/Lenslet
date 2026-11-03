import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
const content=Array.from({length:60},(_,i)=>'段落 '+String(i).padStart(3,'0')+'：键盘弹出时保持正文位置。').join('\n\n');
async function start(page:Page,mode:string,source=content){
  await page.setViewportSize({width:393,height:752});await mockAndroid(page,{files:{'note.md':{content:source}}});await page.goto('/mobile.html');await page.getByRole('tab',{name:mode,exact:true}).tap();await expect(page.locator(mode==='编辑'?'.ProseMirror':'.source-editor .cm-content')).toBeVisible();await expect(page.locator('.mobile-document [data-editor-pending=true]')).toHaveCount(0);
}
async function positionCaret(page:Page,edge:'top'|'bottom',coordinate:number){
  // A real user tap cancels the pending read→edit position restoration.
  await page.locator('.mobile-document').dispatchEvent('pointerdown',{pointerType:'touch',button:0});
  await page.evaluate(async({edge,coordinate})=>{
    const editable=document.querySelector<HTMLElement>('.ProseMirror')!,paragraph=editable.querySelectorAll('p')[35],scroller=editable.closest('.mobile-document')!;editable.focus({preventScroll:true});
    const range=document.createRange();range.setStart(paragraph.firstChild!,0);range.collapse(true);getSelection()!.removeAllRanges();getSelection()!.addRange(range);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    scroller.scrollTop+=range.getBoundingClientRect()[edge]-coordinate;
  },{edge,coordinate});
}
async function shrink(page:Page){return page.evaluate(()=>{
  const scroller=document.querySelector('.mobile-document')!,before=scroller.scrollTop;
  Object.defineProperty(visualViewport,'height',{configurable:true,value:477});window.dispatchEvent(new Event('resize'));
  const caret=getSelection()!.getRangeAt(0).getBoundingClientRect();return{delta:scroller.scrollTop-before,scroll:scroller.scrollTop,caret:{top:caret.top,bottom:caret.bottom},viewport:scroller.getBoundingClientRect().toJSON()};
});}
for(const mode of ['编辑','源码'])test(mode+' keeps the header and visible content stable across keyboard resizing',async({page})=>{
  await start(page,mode);const target=page.locator(mode==='编辑'?'.ProseMirror > p':'.source-editor .cm-line').first();await target.tap();
  const measure=()=>page.evaluate(()=>({top:document.querySelector('.mobile-document')!.getBoundingClientRect().top,header:document.querySelector('.mobile-editor-header')!.getBoundingClientRect().height,content:document.querySelector('.ProseMirror > p,.source-editor .cm-line')!.getBoundingClientRect().top,status:getComputedStyle(document.querySelector('.mobile-document-title small')!).display}));const before=await measure();
  await page.setViewportSize({width:393,height:477});await expect.poll(()=>page.locator('.mobile-app').evaluate(element=>element.getBoundingClientRect().height)).toBe(477);await page.waitForTimeout(180);expect(await measure()).toEqual(before);
  await page.setViewportSize({width:393,height:752});await expect.poll(measure).toEqual(before);
});
test('An obscured text caret scrolls smoothly by the covered distance and two lines of context',async({page})=>{
  await start(page,'编辑');await positionCaret(page,'bottom',530);const position=await shrink(page);expect(position.delta).toBe(0);
  const samples=await page.evaluate(async()=>{const element=document.querySelector('.mobile-document')!,start=element.scrollTop,result:number[]=[];for(let i=0;i<28;i++){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));result.push(element.scrollTop-start);}return result;});
  const clearance=await page.evaluate(()=>parseFloat(getComputedStyle(getSelection()!.anchorNode!.parentElement!).lineHeight)*2);
  expect(samples.filter(value=>value>0&&value<samples.at(-1)!)).not.toHaveLength(0);expect(samples.every((value,index)=>!index||value>=samples[index-1])).toBe(true);expect(samples.at(-1)).toBeGreaterThan(0);expect(samples.at(-1)).toBeLessThanOrEqual(530-position.viewport.bottom+clearance+3);
  expect(await page.evaluate(()=>getSelection()!.getRangeAt(0).getBoundingClientRect().bottom)).toBeLessThanOrEqual(position.viewport.bottom);
});
test('A new touch immediately interrupts a keyboard scroll',async({page})=>{
  await start(page,'编辑');await positionCaret(page,'bottom',680);await shrink(page);await page.waitForTimeout(80);
  const stopped=await page.evaluate(()=>{document.querySelector('.mobile-document')!.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));return document.querySelector('.mobile-document')!.scrollTop;});await page.waitForTimeout(450);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(stopped);
});
test('Reduced-motion users get minimal direct avoidance',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await start(page,'编辑');await positionCaret(page,'bottom',530);const position=await shrink(page);const clearance=await page.evaluate(()=>parseFloat(getComputedStyle(getSelection()!.anchorNode!.parentElement!).lineHeight)*2);expect(position.caret.bottom).toBeLessThanOrEqual(position.viewport.bottom);expect(position.delta).toBeLessThanOrEqual(530-position.viewport.bottom+clearance+3);
});
for(const [edge,coordinate] of [['bottom',425],['top',101]] as const)test('A visible caret near the '+edge+' edge is not scrolled when the keyboard opens',async({page})=>{
  await start(page,'编辑');await positionCaret(page,edge,coordinate);const position=await shrink(page);expect(position.delta).toBe(0);expect(position.caret.top).toBeGreaterThanOrEqual(position.viewport.top);expect(position.caret.bottom).toBeLessThanOrEqual(position.viewport.bottom);await page.waitForTimeout(350);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(position.scroll);
});
test('A visible tab title stays in place even when the rest of its form is below the keyboard',async({page})=>{
  await start(page,'编辑',content+'\n\n```tabs {id=0001 height=180}\n:::js 第一页\nconsole.log(1);\n:::py 第二页\nprint(2)\n```\n\n'+content);const tabs=page.locator('.tabbed-code');await tabs.getByRole('button',{name:'管理代码标签页',exact:true}).tap();const title=tabs.getByLabel('标签页标题',{exact:true});await title.focus();await page.waitForTimeout(100);
  const result=await title.evaluate(element=>{
    const scroller=element.closest('.mobile-document')!;scroller.scrollTop+=element.getBoundingClientRect().bottom-425;const before=scroller.scrollTop;
    Object.defineProperty(visualViewport,'height',{configurable:true,value:477});window.dispatchEvent(new Event('resize'));
    return{delta:scroller.scrollTop-before,scroll:scroller.scrollTop,bottom:element.getBoundingClientRect().bottom,visibleBottom:scroller.getBoundingClientRect().bottom,formBottom:element.closest('.tabs-management')!.getBoundingClientRect().bottom};
  });expect(result.formBottom).toBeGreaterThan(result.visibleBottom);expect(result.bottom).toBeLessThanOrEqual(result.visibleBottom);expect(result.delta).toBe(0);await page.waitForTimeout(350);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(result.scroll);
});
test('A hidden keyboard leaves an offscreen selection alone during formatting input',async({page})=>{
  await start(page,'编辑');await positionCaret(page,'bottom',680);
  const before=await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));const scroller=document.querySelector('.mobile-document')!;scroller.scrollTop-=100;const before=scroller.scrollTop;document.querySelector('.ProseMirror')!.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'formatBold'}));return before;});await page.waitForTimeout(100);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(before);
});
