import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {androidDevice} from './helpers/android-device.mjs';
const device=await androidDevice(),{page,native,tap,keyboard,shell}=device;
const folder='viewport-qa-'+Date.now(),note=folder+'/note.md',label=process.env.MOYU_IME_LABEL||'after';
const output=path.resolve(import.meta.dirname,'../../../work/ime-viewport-'+label);await fs.mkdir(output,{recursive:true});
const content=Array.from({length:80},(_,i)=>'段落 '+String(i).padStart(3,'0')+'：输入法弹出时，文字和页面应保持稳定。').join('\n\n');let previous,cdp;
const results=[];
async function sample(name,target,targetBottom){
  await target.evaluate(element=>element.scrollIntoView({block:'center'}));await page.waitForTimeout(250);
  if(targetBottom!==undefined)await target.evaluate((element,bottom)=>{const scroller=element.closest('.source-editor')?.querySelector('.cm-scroller')||element.closest('.mobile-document');scroller.scrollTop+=element.getBoundingClientRect().bottom-bottom;},targetBottom);
  await page.evaluate(()=>{
    const scroller=document.querySelector('.mobile-document'),view=scroller.querySelector('.ProseMirror,.source-editor .cm-content');
    window.__viewportTrace=[];window.__viewportRunning=true;window.__viewportChanges=[];
    const observer=new MutationObserver(records=>window.__viewportChanges.push(...records.map(record=>({time:performance.now(),value:record.target.getAttribute('style')}))));observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']});window.__viewportObserver=observer;
    const record=()=>{const box=scroller.getBoundingClientRect(),selection=getSelection(),caret=selection?.isCollapsed&&selection.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;window.__viewportTrace.push({time:performance.now(),width:innerWidth,height:innerHeight,visual:visualViewport.height,offset:visualViewport.offsetTop,css:document.documentElement.style.getPropertyValue('--mobile-viewport-height'),app:document.querySelector('.mobile-app').getBoundingClientRect().height,top:box.top,bottom:box.bottom,scroll:scroller.scrollTop,editorScroll:document.querySelector('.source-editor .cm-scroller')?.scrollTop,windowScroll:scrollY,connected:view.isConnected,contentTop:view.getBoundingClientRect().top,caret:caret?.height?{top:caret.top,bottom:caret.bottom}:null,focus:document.activeElement?.className,native:window.__moyuNativeViewport});if(window.__viewportRunning)requestAnimationFrame(record);};requestAnimationFrame(record);
  });
  let sequence=0,writes=[];const frames=event=>{cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});writes.push(fs.writeFile(path.join(output,name+'-'+String(sequence++).padStart(3,'0')+'.jpg'),Buffer.from(event.data,'base64')));};
  cdp.on('Page.screencastFrame',frames);await cdp.send('Page.startScreencast',{format:'jpeg',quality:85,maxWidth:500,maxHeight:1100,everyNthFrame:1});
  await tap(target,{x:90,y:12});await expect.poll(keyboard).toBe(true);await page.waitForTimeout(900);await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',frames);await Promise.all(writes);
  const trace=await page.evaluate(()=>{window.__viewportRunning=false;window.__viewportObserver.disconnect();return{frames:window.__viewportTrace,changes:window.__viewportChanges};});results.push({name,...trace});console.log(name,JSON.stringify(trace.frames.filter((frame,index,list)=>!index||['height','visual','css','app','scroll','offset','contentTop'].some(key=>frame[key]!==list[index-1][key]))));
  if(label!=='before'){
    expect(trace.frames.every(frame=>frame.connected&&frame.windowScroll===0),name+' keeps the editor mounted and avoids page panning').toBe(true);
    expect(trace.frames.every(frame=>frame.top===trace.frames[0].top),name+' keeps the header and document top fixed').toBe(true);
    const native=trace.frames.some(frame=>frame.native?.phase==='progress');
    const resized=trace.frames.filter(frame=>Math.abs(frame.app-trace.frames[0].app)>1),before=trace.frames.filter(frame=>Math.abs(frame.app-trace.frames[0].app)<=1).at(-1),after=trace.frames.at(-1);
    expect(resized.length).toBeGreaterThan(0);
    if(native){expect(trace.frames.every(frame=>frame.height===trace.frames[0].height),name+' keeps the native WebView size fixed').toBe(true);for(const frame of trace.frames.filter(frame=>frame.native))expect(Math.abs(frame.app-frame.native.bottom*frame.width/frame.native.width)).toBeLessThan(1);}
    if(name!=='source'){
      expect(before.caret,name+' records the focused caret before the resize').not.toBeNull();
      const key=name==='source-covered'?'editorScroll':'scroll',hidden=Math.max(0,before.caret.bottom-after.bottom),delta=after[key]-before[key];
      if(!hidden)expect(delta,name+' must not move a visible caret').toBe(0);
      else{expect(delta,name+' reveals only the covered part').toBeLessThanOrEqual(hidden+3);expect(after.caret.bottom).toBeLessThanOrEqual(after.bottom+1);expect(resized.some(frame=>frame[key]>before[key]&&frame[key]<after[key]),name+' has intermediate animation frames').toBe(true);expect(resized.every((frame,index)=>!index||frame[key]>=resized[index-1][key]),name+' scrolls without reversing direction').toBe(true);}
    }
  }
  shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);await expect.poll(()=>page.locator('.mobile-app').evaluate(element=>element.getBoundingClientRect().height)).toBe(trace.frames[0].app);
}
try{
  if((await native('load')).root!=='internal')throw Error('Use the debug internal vault.');previous=await native('feature','preferences.get');await native('create',folder,'folder','');await native('create',note,'file',content);await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await page.reload();await tap(page.getByRole('tab',{name:'编辑',exact:true}));await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');cdp=await page.context().newCDPSession(page);
  await sample('top',page.locator('.ProseMirror > p').first());await sample('middle',page.locator('.ProseMirror > p').nth(35));await sample('covered',page.locator('.ProseMirror > p').nth(35),600);
  await tap(page.getByRole('tab',{name:'源码',exact:true}));await expect(page.locator('.source-editor')).not.toHaveAttribute('data-editor-pending','true');await sample('source',page.locator('.source-editor .cm-line').filter({hasText:'段落 035'}));await sample('source-covered',page.locator('.source-editor .cm-line').filter({hasText:'段落 035'}),600);
  expect((await native('read',note)).content).toBe(content);
}finally{
  await fs.writeFile(path.join(output,'trace.json'),JSON.stringify(results,null,2));if(previous)await native('feature','preferences.set-many',{values:{'moyu-save-policy':previous['moyu-save-policy']||'realtime','moyu-session-internal':previous['moyu-session-internal']||'null'}}).catch(()=>{});await native('feature','mobile.draft-clear',{path:note}).catch(()=>{});await native('trash',folder).catch(()=>{});await cdp?.detach();await device.close();
}
