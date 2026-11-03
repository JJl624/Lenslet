import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

/** Debug-only private-file test transport; no CDP/WebView dependency. */
export async function androidGeckoDevice(options={}){
  const sdk=options.sdk||process.env.ANDROID_HOME,serial=options.serial||process.env.ANDROID_SERIAL||'emulator-5580',app='com.lrj.moyu.gecko.debug';
  if(!sdk||!serial.startsWith('emulator-')&&options.allowPhysical!==true&&process.env.MOYU_TEST_PHYSICAL_DEVICE!=='1')throw Error('Set ANDROID_HOME; physical devices require explicit opt-in and an ANDROID_SERIAL.');
  const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
  const shell=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
  let bounds;
  if(options.launch!==false){
    shell('shell','input','keyevent','KEYCODE_WAKEUP');shell('shell','wm','dismiss-keyguard');
    shell('shell','am','force-stop',app);shell('shell','am','start','-n',app+'/app.moyu.notes.MainActivity');
  }
  shell('shell','run-as',app,'mkdir','-p','files/gecko-test');
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'moyu-gecko-test-'));
  // Keep physical test sessions awake without changing the user's display or
  // lock settings. A setup phase can otherwise outlast the screen timeout.
  const awake=!serial.startsWith('emulator-')&&options.keepAwake!==false?setInterval(()=>{try{shell('shell','input','keyevent','KEYCODE_WAKEUP');}catch{}},15000):undefined;
  awake?.unref();
  async function evaluate(expression){
    const id='qa-'+randomUUID(),local=path.join(temporary,id+'.js'),remote='/data/local/tmp/'+id+'.js';await fs.writeFile(local,expression);
    shell('push',local,remote);shell('shell','run-as',app,'cp',remote,'files/gecko-test/'+id+'.js');shell('shell','rm',remote);
    shell('shell','am','broadcast','-a',app+'.QA_EVAL','-p',app,'--es','id',id);
    try{
      const until=Date.now()+30000;let response;
      while(Date.now()<until){try{response=JSON.parse(shell('shell','run-as',app,'cat','files/gecko-test/'+id+'.json'));break;}catch{await delay(300);}}
      if(!response)throw Error('Gecko evaluation timed out: '+id);if(!response.ok)throw Error(response.error+'\n'+(response.stack||''));bounds=response.bounds;return response.payload===undefined?response.value:JSON.parse(response.payload);
    }finally{shell('shell','run-as',app,'rm','-f','files/gecko-test/'+id+'.js','files/gecko-test/'+id+'.json');await fs.rm(local);}
  }
  async function ready(){
    const deadline=Date.now()+120000;let lastError;
    while(Date.now()<deadline){await delay(1000);try{if(await evaluate("!!window.moyu&&window.MoyuNative?.connected===true&&document.readyState==='complete'&&!!document.querySelector('.mobile-file-list,.mobile-document')"))return;}catch(error){lastError=error;}}
    throw lastError||Error('Mobile app did not mount.');
  }
  async function reload(){
    const token=randomUUID();await evaluate(`window.__qaPreviousDocument=${JSON.stringify(token)};setTimeout(()=>location.reload(),100);true`);
    const deadline=Date.now()+120000;
    while(Date.now()<deadline){await delay(300);try{if(await evaluate(`window.__qaPreviousDocument!==${JSON.stringify(token)}&&!!window.moyu&&document.readyState==='complete'&&!!document.querySelector('.mobile-file-list,.mobile-document')`))return;}catch{}}
    throw Error('Reloaded Gecko document did not become ready.');
  }
  const native=(method,...args)=>evaluate(`(async()=>{const reply=await window.moyu[${JSON.stringify(method)}](...${JSON.stringify(args)});if(!reply.ok)throw Error(reply.error?.message||'Native request failed');return reply.data;})()`);
  const keyboard=()=>/(?:mInputShown|inputShown|isInputViewShown)\s*=\s*true/.test(shell('shell','dumpsys','input_method'));
  async function point(selector,index=0,scroll=true){
    const location=await evaluate(`(async()=>{const element=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!element)throw Error('Missing '+${JSON.stringify(selector)});if(${JSON.stringify(scroll)})element.scrollIntoView({block:'center'});let previous='',stable=0;for(let frame=0;frame<90;frame++){await new Promise(resolve=>requestAnimationFrame(resolve));const box=element.getBoundingClientRect(),x=box.left+Math.min(box.width/2,24),y=box.top+Math.min(box.height/2,12),hit=document.elementFromPoint(x,y),key=[x,y,box.width,box.height].map(n=>Math.round(n*10)).join(',');stable=key===previous&&!!hit&&element.contains(hit)?stable+1:0;previous=key;if(stable>=5)return{x,y,width:innerWidth};}throw Error('Tap target is moving or covered: '+${JSON.stringify(selector)});})()`);
    if(!bounds?.width)throw Error('Missing native Gecko bounds');const scale=bounds.width/location.width;
    return[String(Math.round(bounds.x+location.x*scale)),String(Math.round(bounds.y+location.y*scale))];
  }
  const tap=async(selector,index=0,scroll=true)=>shell('shell','input','tap',...await point(selector,index,scroll));
  const tapAt=async(x,y)=>{const width=await evaluate('innerWidth');if(!bounds?.width)throw Error('Missing native Gecko bounds');const scale=bounds.width/width;shell('shell','input','tap',String(Math.round(bounds.x+x*scale)),String(Math.round(bounds.y+y*scale)));};
  const hold=async(selector,milliseconds,index=0)=>{const [x,y]=await point(selector,index);shell('shell','input','swipe',x,y,x,y,String(milliseconds));};
  const initialize=()=>evaluate(`(()=>{if(!window.moyu)throw Error('Native API not ready');return navigator.userAgent;})()`);
  const screenshot=()=>execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,timeout:30000,maxBuffer:10*1024*1024});
  const close=async()=>{clearInterval(awake);try{await fs.rm(temporary,{recursive:true});}catch(error){throw Error('Remove test directory manually: '+temporary+' ('+error.message+')');}};
  return{app,shell,evaluate,native,keyboard,tap,tapAt,hold,ready,reload,initialize,screenshot,close};
}
