import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';
import {androidDevice} from './helpers/android-device.mjs';
import build from '../shared/mobile-build.json' with {type:'json'};

const engine=process.argv.includes('--system-webview')?'webview':'gecko';
const host=engine==='gecko'?await androidGeckoDevice():await androidDevice();
const device=engine==='gecko'?host:{
  ...host,
  evaluate:expression=>host.page.evaluate(expression),
  ready:()=>host.page.waitForSelector('.mobile-file-list,.mobile-document'),
  reload:async()=>{await host.page.reload();await host.page.waitForSelector('.mobile-file-list,.mobile-document');},
  initialize:()=>host.page.evaluate(()=>navigator.userAgent),
  tap:(selector,index=0,scroll=true)=>host.tap(host.page.locator(selector).nth(index),{x:24,y:12,scroll})
};
const {evaluate,native,shell,tap,keyboard}=device;
const folder='shared-ime-'+engine+'-'+Date.now(),note=folder+'/note.md';
const output=new URL('../../../work/shared-ime-device/',import.meta.url);
const content=Array.from({length:70},(_,i)=>'段落 '+i+'，输入法滚动动画测试。').join('\n\n');
const results=[];
let previous,created=false;

async function until(check){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){if(await check())return;await delay(150);}
  throw Error('Timed out');
}
async function hideKeyboard(){
  if(keyboard()){shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>!keyboard());}
  await evaluate('document.activeElement?.blur();true');await delay(250);
}
async function recordCase(covered){
  await evaluate(`(async()=>{
    const scroller=document.querySelector('.mobile-document'),paragraph=document.querySelectorAll('.ProseMirror > p')[35];
    scroller.style.scrollBehavior='auto';
    scroller.scrollTop+=paragraph.getBoundingClientRect().top-(${covered?'innerHeight-90':'230'});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    window.__imeSamples=[];window.__imeViewportEvents=[];
    if(window.__imeViewportObserver)window.removeEventListener('moyu-mobile-viewport',window.__imeViewportObserver);
    window.__imeViewportObserver=event=>{
      const app=document.querySelector('.mobile-app');
      window.__imeViewportEvents.push({time:performance.now()-window.__imeStart,detail:event.detail,height:app.getBoundingClientRect().height});
    };
    window.addEventListener('moyu-mobile-viewport',window.__imeViewportObserver);
    document.addEventListener('pointerdown',()=>{
      window.__imeTracing=true;const start=performance.now();window.__imeStart=start;
      const tick=()=>{
        const selection=getSelection(),caret=selection?.rangeCount?selection.getRangeAt(0).getBoundingClientRect():null;
        window.__imeSamples.push({time:performance.now()-start,scroll:scroller.scrollTop,
          height:document.querySelector('.mobile-app').getBoundingClientRect().height,
          browserHeight:innerHeight,visualTop:visualViewport?.offsetTop,windowScroll:scrollY,
          caret:caret?.bottom,target:paragraph.getBoundingClientRect().top,bottom:scroller.getBoundingClientRect().bottom});
        if(window.__imeTracing&&performance.now()-start<15000)requestAnimationFrame(tick);
      };
      tick();
    },{once:true,capture:true});return true;
  })()`);
  await tap('.ProseMirror > p',35,false);await until(keyboard);
  // Wait for actual IME completion; emulator keyboard startup can be delayed.
  await until(()=>evaluate("window.__imeViewportEvents?.some(event=>event.detail.phase==='end'&&event.detail.visible)===true"));
  await delay(250);
  const samples=await evaluate('window.__imeTracing=false;window.__imeSamples');
  const positions=[...new Set(samples.map(row=>Math.round(row.scroll)))],end=samples.at(-1);
  const clearance=await evaluate("parseFloat(getComputedStyle(document.querySelectorAll('.ProseMirror > p')[35]).lineHeight)*2");
  const nativeEvents=await evaluate('window.__imeViewportEvents'),nativeState=await native('feature','mobile.viewport');
  results.push({covered,positions,clearance,nativeState,nativeEvents,samples});
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(new URL(build.version+'-'+engine+'.json',output),JSON.stringify(results,null,2));
  console.log(JSON.stringify({engine,covered,positions,clearance,gap:end.bottom-end.caret,
    firstHeight:samples[0]?.height,lastHeight:end.height,nativeState}));
  assert.ok(samples.some(row=>row.height<samples[0].height),'The shared viewport must follow the keyboard');
  assert.ok(samples.every(row=>Number.isFinite(row.scroll)&&row.height>0),'Native viewport samples must remain valid');
  assert.equal(await evaluate("document.documentElement.dataset.mobileViewport==='native'"),true);
  if(covered)assert.ok(end.bottom-end.caret>=clearance-4,'Keep two lines above the keyboard');
  else assert.ok(Math.max(...samples.map(row=>row.scroll))-Math.min(...samples.map(row=>row.scroll))<=2,'Visible input must not move');
  await hideKeyboard();
}

try{
  await device.ready();await device.initialize();assert.equal((await native('load')).root,'internal');
  previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual',
    'moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await device.reload();await device.initialize();
  await evaluate("[...document.querySelectorAll('.mobile-mode-tabs button')].find(node=>node.textContent==='编辑').click();true");
  await until(()=>evaluate("!!document.querySelector('.ProseMirror')&&!document.querySelector('[data-editor-pending=true]')"));
  await hideKeyboard();
  for(const covered of [true,false])await recordCase(covered);
}catch(error){
  await fs.mkdir(output,{recursive:true});
  await fs.writeFile(new URL(build.version+'-'+engine+'-failure.png',output),device.screenshot());
  await fs.writeFile(new URL(build.version+'-'+engine+'-input.txt',output),shell('shell','dumpsys','input_method'));
  throw error;
}finally{
  try{
    if(previous)await native('feature','preferences.set-many',{values:previous});
    if(created)await native('trash',folder);
  }catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
