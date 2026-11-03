import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Gecko uses the same native viewport and long-hold policy as WebView',async({page})=>{
  await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:'普通文字。\n\n第二段。'}}});await page.goto('/mobile.html');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('moyu-mobile-viewport',{detail:{sequence:1,animation:1,phase:'end',width:1179,height:2256,bottom:1000,startBottom:2256,targetBottom:1000,visible:true,animating:false,progress:1}})));
  expect(await page.locator('.mobile-app').evaluate(element=>element.getBoundingClientRect().height)).toBeCloseTo(1000/3,1);
  await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('moyu-mobile-keyboard',{detail:false}));document.querySelector('.ProseMirror')!.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:50,clientY:180}));});
  await page.waitForTimeout(550);await expect(page.locator('.ProseMirror')).toHaveAttribute('inputmode','none');
  expect(await page.evaluate(()=>(window as any).__mobileCalls['mobile.keyboard-show']||0)).toBe(0);
});

test('Standard caret hit testing maps a Firefox text position into a Range',async({page})=>{
  await page.goto('/mobile.html');
  const result=await page.evaluate(async()=>{
    const {caretRangeAt}=await import('/src/domCaret.ts'),text=document.createTextNode('光标位置');
    const testDocument=document.implementation.createHTMLDocument();testDocument.body.append(text);
    Object.defineProperty(testDocument,'caretPositionFromPoint',{value:()=>({offsetNode:text,offset:2})});
    Object.defineProperty(testDocument,'caretRangeFromPoint',{value:()=>{throw Error('Must use the standard API');}});
    const range=caretRangeAt(testDocument,20,30);return{offset:range?.startOffset,text:range?.startContainer.textContent,collapsed:range?.collapsed};
  });expect(result).toEqual({offset:2,text:'光标位置',collapsed:true});
});

test('A disconnected engine rejects pending requests and subsequent calls',async({page})=>{
  await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:'普通文字'}}});await page.goto('/mobile.html');await expect(page.locator('.mobile-mode-tabs')).toBeVisible();
  const errors=await page.evaluate(async()=>{
    const {nativeCall}=await import('/src/mobile/native.ts');window.MoyuNative!.postMessage=()=>{};
    const pending=nativeCall('load').catch(error=>error.message);
    window.MoyuNative!.connected=false;window.dispatchEvent(new Event('moyu-native-disconnected'));
    return[await pending,await nativeCall('load').catch(error=>error.message)];
  });expect(errors).toEqual(['与应用的连接已断开，请重新打开应用。','与应用的连接已断开，请重新打开应用。']);
});

for(const scenario of ['covered','visible','hidden','stale'] as const)test('Shared Gecko IME geometry: '+scenario,async({page})=>{
  await page.setViewportSize({width:393,height:752});await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:Array.from({length:70},(_,i)=>'段落 '+i+'，键盘动画测试。').join('\n\n')}}});await page.goto('/mobile.html');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.ProseMirror')).toBeVisible();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  await page.evaluate(async covered=>{
    const editor=document.querySelector<HTMLElement>('.ProseMirror')!,paragraph=editor.querySelectorAll('p')[35],scroller=document.querySelector('.mobile-document')!;editor.focus({preventScroll:true});
    const range=document.createRange();range.setStart(paragraph.firstChild!,0);range.collapse(true);getSelection()!.removeAllRanges();getSelection()!.addRange(range);
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));scroller.scrollTop+=range.getBoundingClientRect().bottom-(covered?650:230);
  },scenario==='covered');
  const result=await page.evaluate(scenario=>{
    const element=document.querySelector('.mobile-document')!,before=element.scrollTop;
    const send=(sequence:number,bottom:number,visible:boolean,progress:number)=>window.dispatchEvent(new CustomEvent('moyu-mobile-viewport',{detail:{sequence,animation:1,phase:progress===1?'end':'start',width:1179,height:2256,bottom,startBottom:2256,targetBottom:1431,visible,animating:progress!==1,progress}}));
    if(scenario==='stale'){send(10,2256,false,1);send(9,1431,true,1);}
    else{send(1,2256,scenario!=='hidden',0);send(2,scenario==='hidden'?2256:1431,scenario!=='hidden',1);}
    return{before,after:element.scrollTop,height:document.querySelector('.mobile-app')!.getBoundingClientRect().height};
  },scenario);
  if(scenario==='covered')expect(result.after).toBeGreaterThan(result.before);else expect(result.after).toBe(result.before);
  expect(result.height).toBe(scenario==='hidden'||scenario==='stale'?752:477);
});

test('The normal Gecko app keeps release update checks enabled',async({page})=>{
  await mockAndroid(page,{engine:'gecko',files:{'note.md':{content:'普通文字'}}});await page.goto('/mobile.html');await expect(page.locator('.mobile-mode-tabs')).toBeVisible();
  const state=await page.evaluate(async()=>(await import('/src/mobile/mobileUpdates.ts')).mobileUpdates.state());expect(state.canAutoCheck).toBe(true);expect(state.automatic).toBe(true);
});
