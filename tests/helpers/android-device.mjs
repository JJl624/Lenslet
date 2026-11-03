import {chromium,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

export async function androidDevice(){
  const sdk=process.env.ANDROID_HOME,serial=process.env.ANDROID_SERIAL||'emulator-5580',app='com.lrj.moyu.webview.debug';
  if(!sdk||!serial.startsWith('emulator-'))throw Error('Use a test emulator and set ANDROID_HOME.');
  const adb=path.join(sdk,'platform-tools',process.platform==='win32'?'adb.exe':'adb'),shell=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true}).trim();
  shell('shell','input','keyevent','KEYCODE_WAKEUP');shell('shell','wm','dismiss-keyguard');
  shell('shell','am','force-stop',app);shell('shell','am','start','-n',app+'/app.moyu.notes.MainActivity');let pid='';
  await expect.poll(()=>{try{return pid=shell('shell','pidof',app);}catch{return'';}},{timeout:30000}).not.toBe('');shell('forward','tcp:9222',`localabstract:webview_devtools_remote_${pid}`);
  await expect.poll(async()=>{try{return(await(await fetch('http://127.0.0.1:9222/json')).json()).some(page=>page.url?.includes('/mobile.html'));}catch{return false;}},{timeout:30000}).toBe(true);
  const browser=await chromium.connectOverCDP('http://127.0.0.1:9222',{noDefaults:true}),page=browser.contexts()[0].pages().find(page=>page.url().includes('/mobile.html'));page.setDefaultTimeout(30000);
  await expect(page.locator('.mobile-mode-tabs,.mobile-file-list').first()).toBeVisible({timeout:30000});
  const native=(method,...args)=>page.evaluate(async({method,args})=>{const reply=await window.moyu[method](...args);if(!reply.ok)throw Error(reply.error?.message||'Native request failed');return reply.data;},{method,args});
  const keyboard=()=>/(?:mInputShown|inputShown|isInputViewShown)\s*=\s*true/.test(shell('shell','dumpsys','input_method'));
  const coordinates=async(locator,point)=>{
    if(point?.scroll!==false)await locator.scrollIntoViewIfNeeded();
    try{shell('shell','uiautomator','dump','/sdcard/moyu-device-qa.xml');}catch(error){if(error.status!==137||!String(error.stdout).includes('UI hierchary dumped to: /sdcard/moyu-device-qa.xml'))throw error;}
    const xml=shell('shell','cat','/sdcard/moyu-device-qa.xml'),bounds=xml.match(/class="android\.webkit\.WebView"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/),box=await locator.boundingBox();if(!bounds||!box)throw Error('Missing native WebView bounds');
    const scale=(Number(bounds[3])-Number(bounds[1]))/await page.evaluate(()=>innerWidth);return[String(Math.round(Number(bounds[1])+(box.x+Math.min(point?.x??16,box.width-2))*scale)),String(Math.round(Number(bounds[2])+(box.y+Math.min(point?.y??12,box.height-2))*scale))];
  };
  const tap=async(locator,point)=>{shell('shell','input','tap',...await coordinates(locator,point));};
  const hold=async(locator,milliseconds,point)=>{const [x,y]=await coordinates(locator,point);shell('shell','input','swipe',x,y,x,y,String(milliseconds));};
  const screenshot=()=>execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,maxBuffer:10*1024*1024});
  const close=async()=>{await browser.close();shell('forward','--remove','tcp:9222');};
  return{app,page,native,shell,keyboard,tap,hold,screenshot,close};
}
