import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
const content=Array.from({length:80},(_,i)=>'段落 '+String(i).padStart(3,'0')+'，原生键盘定位和动画测试。').join('\n\n');
async function startEngine(page:Page,bottom=530,fontSize=17,engine:'gecko'|'webview'='webview'){
  await page.setViewportSize({width:393,height:752});await mockAndroid(page,{engine,files:{'note.md':{content}}});await page.addInitScript(fontSize=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-mobile-size']=String(fontSize);},fontSize);await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');await page.locator('.ProseMirror > p').nth(35).tap();
  await page.evaluate(async bottom=>{const editor=document.querySelector<HTMLElement>('.ProseMirror')!,paragraph=editor.querySelectorAll('p')[35];editor.focus({preventScroll:true});const range=document.createRange();range.setStart(paragraph.firstChild!,0);range.collapse(true);getSelection()!.removeAllRanges();getSelection()!.addRange(range);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));const scroller=editor.closest('.mobile-document')!;scroller.scrollTop+=range.getBoundingClientRect().bottom-bottom;},bottom);
}
async function frame(page:Page,sequence:number,progress:number,options:{animation?:number;start?:number;target?:number;visible?:boolean;phase?:string;width?:number;height?:number}={}){
  const {animation=1,start=2256,target=1431,visible=true,phase=progress===1?'end':'progress',width=1179,height=2256}=options;
  return page.evaluate(state=>{
    window.dispatchEvent(new CustomEvent('moyu-mobile-viewport',{detail:state}));const active=document.activeElement as HTMLElement,scope=active.closest('.mobile-document,.mobile-sheet-content,.mobile-home-content')||document.querySelector('.mobile-document,.mobile-home-content')!,selection=getSelection(),rect=active.matches('input,textarea')?active.getBoundingClientRect():selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;return{scroll:scope.scrollTop,app:document.querySelector('.mobile-app')!.getBoundingClientRect().height,bottom:scope.getBoundingClientRect().bottom,caret:rect?.bottom??0};
  },{sequence,animation,width,height,bottom:Math.round(start+(target-start)*progress),startBottom:start,targetBottom:target,visible,animating:phase!=='end'&&phase!=='layout',phase,progress});
}
for(const engine of ['webview','gecko'] as const)test.describe(engine,()=>{
const start=(page:Page,bottom=530,fontSize=17)=>startEngine(page,bottom,fontSize,engine);

test('Physical browser dimensions win over DPR and stale visualViewport measurements',async({page})=>{
  await start(page);await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:319});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:73});});const initial=await frame(page,1,0,{phase:'start'});
  const quarter=await frame(page,2,.25);expect(quarter.app).toBeCloseTo(Math.round(2256+(1431-2256)*.25)/3,1);expect(quarter.scroll).toBe(initial.scroll);
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(100);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(quarter.scroll);
  const covered=await frame(page,3,.9);expect(covered.scroll).toBeGreaterThan(initial.scroll);const end=await frame(page,4,1);expect(end.app).toBe(477);expect(end.caret).toBeLessThanOrEqual(end.bottom);const gap=await page.evaluate(()=>{const node=getSelection()!.anchorNode!.parentElement!;return Number.parseFloat(getComputedStyle(node).lineHeight)*2;});expect(end.bottom-end.caret).toBeGreaterThanOrEqual(gap-2);expect(end.bottom-end.caret).toBeLessThanOrEqual(gap+3);expect(end.scroll-initial.scroll).toBeLessThanOrEqual(initial.caret-end.bottom+gap+3);
});
test('Visible carets do not move and native progress does not have an independent JS clock',async({page})=>{
  await start(page,425);const initial=await frame(page,1,0,{phase:'start'});const halfway=await frame(page,2,.5);await page.waitForTimeout(350);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(initial.scroll);const end=await frame(page,3,1);expect(halfway.scroll).toBe(initial.scroll);expect(end.scroll).toBe(initial.scroll);
});
test('Candidate-bar height changes use a new system animation; hiding never rewinds the document',async({page})=>{
  await start(page);await frame(page,1,0,{phase:'start'});const first=await frame(page,2,1);await frame(page,3,0,{animation:2,start:1431,target:1080,phase:'start'});const enlarged=await frame(page,4,1,{animation:2,start:1431,target:1080});expect(enlarged.scroll).toBeGreaterThan(first.scroll);expect(enlarged.caret).toBeLessThanOrEqual(enlarged.bottom);
  await frame(page,5,.5,{animation:3,start:1080,target:2256,visible:false});const hidden=await frame(page,6,1,{animation:3,start:1080,target:2256,visible:false});expect(hidden.app).toBe(752);expect(hidden.scroll).toBe(enlarged.scroll);
});
test('User touch cancels avoidance but the viewport continues to track the keyboard',async({page})=>{
  await start(page);await frame(page,1,0,{phase:'start'});const halfway=await frame(page,2,.9);await page.locator('.mobile-document').dispatchEvent('pointerdown',{pointerType:'touch',button:0});const end=await frame(page,3,1);expect(end.scroll).toBe(halfway.scroll);expect(end.app).toBe(477);await frame(page,4,1,{start:1431,target:1431,phase:'layout'});await page.waitForTimeout(350);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(end.scroll);
});
test('Large reading text and another physical display width keep the caret above the actual keyboard boundary',async({page})=>{
  await start(page,560,24);const width=1440,height=Math.round(752*width/393),target=Math.round(477*width/393);const initial=await frame(page,1,0,{width,height,start:height,target,phase:'start'});const end=await frame(page,2,1,{width,height,start:height,target});expect(end.app).toBeCloseTo(target*393/width,1);const gap=await page.evaluate(()=>Number.parseFloat(getComputedStyle(getSelection()!.anchorNode!.parentElement!).lineHeight)*2);expect(end.bottom-end.caret).toBeGreaterThanOrEqual(gap-2);expect(end.bottom-end.caret).toBeLessThanOrEqual(gap+3);expect(end.scroll-initial.scroll).toBeLessThanOrEqual(initial.caret-end.bottom+gap+3);
});
test('Input sheets follow the keyboard boundary instead of remaining behind the full WebView',async({page})=>{
  await start(page);await frame(page,1,1,{start:2256,target:2256,visible:false,phase:'layout'});await frame(page,2,0,{animation:2,phase:'start'});const halfway=await frame(page,3,.5,{animation:2});await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await page.getByRole('button',{name:'新建',exact:true}).tap();await page.getByRole('button',{name:'新建文档',exact:true}).tap();const input=page.getByRole('textbox',{name:'名称',exact:true});await expect(input).toBeFocused();expect(await page.locator('.mobile-sheet-layer').evaluate(element=>element.getBoundingClientRect().bottom)).toBe(halfway.app);
  await frame(page,4,1,{animation:2});const bounds=await input.evaluate(element=>({input:element.getBoundingClientRect().toJSON(),sheet:element.closest('.mobile-sheet-layer')!.getBoundingClientRect().toJSON()}));expect(bounds.sheet.bottom).toBe(477);expect(bounds.input.bottom).toBeLessThan(477);expect(bounds.input.top).toBeGreaterThanOrEqual(0);
});
test('Floating keyboards and out-of-order snapshots do not shrink or reposition the page',async({page})=>{
  await start(page);const initial=await frame(page,10,1,{start:2256,target:2256,phase:'layout'});await frame(page,9,1);await page.waitForTimeout(100);expect(await page.locator('.mobile-app').evaluate(element=>element.getBoundingClientRect().height)).toBe(752);expect(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)).toBe(initial.scroll);
});

});
