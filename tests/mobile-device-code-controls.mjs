import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';
import {androidDevice} from './helpers/android-device.mjs';

const webview=process.argv.includes('--webview'),device=webview?await androidDevice():await androidGeckoDevice();
const evaluate=webview?expression=>device.page.evaluate(expression):device.evaluate;
const tap=webview?selector=>device.tap(device.page.locator(selector)):device.tap;
const reload=webview?async()=>{await device.page.reload();await device.page.locator('.mobile-mode-tabs').waitFor();}:device.reload;
const {native,keyboard,shell}=device,folder='code-controls-'+Date.now(),note=folder+'/note.md';
const code='<button id="demo">HTML preview</button>',content='```text {id=00ab preview=pin previewHeight=220}\n'+code+'\n```';
let previous,created=false;
async function until(check){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await check())return;await delay(150);}throw Error('Code-control check timed out.');}
async function noInput(message){assert.equal(keyboard(),false,message);assert.equal(await evaluate('window.__controlKeyboardOpens'),0,message+' must not briefly show the keyboard');}
try{
  if(!webview)await device.ready();assert.equal((await native('load')).root,'internal');
  previous=await native('feature','preferences.get');await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await reload();
  await evaluate("[...document.querySelectorAll('.mobile-mode-tabs button')].find(button=>button.textContent==='编辑').click();true");
  await until(()=>evaluate("!!document.querySelector('.milkdown-code-block .cm-content')"));
  await evaluate("window.__controlKeyboardOpens=0;window.addEventListener('moyu-mobile-keyboard',event=>{if(event.detail===true)window.__controlKeyboardOpens++;});true");
  await tap('button.language-button');await until(()=>evaluate("!!document.querySelector('.code-language-menu')"));
  assert.equal(await evaluate("document.activeElement===document.querySelector('.code-language-menu input')"),false);await noInput('Opening the language menu');
  shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>evaluate("!document.querySelector('.code-language-menu')&&!!document.querySelector('.mobile-mode-tabs')"));await noInput('Closing a language menu with Back');
  await tap('button.language-button');await until(()=>evaluate("!!document.querySelector('.code-language-menu')"));
  await tap('.code-language-menu [data-language="HTML"]');await until(()=>evaluate("!!document.querySelector('.html-note-window iframe')"));await noInput('Switching a normal fence to HTML');
  await tap('[aria-label="HTML 源码"]');await until(()=>evaluate("document.querySelector('.milkdown-code-block')?.dataset.htmlSource==='true'"));await noInput('Showing HTML source');
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .code-attributes-input').getBoundingClientRect().height>0&&document.querySelector('.milkdown-code-block .copy-button').getBoundingClientRect().height>0"),true,'Source retains the ordinary code toolbar');
  await tap('.milkdown-code-block .cm-content');await until(keyboard);
  shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>!keyboard());await evaluate('window.__controlKeyboardOpens=0;true');
  await tap('[aria-label="预览 HTML"]');await until(()=>evaluate("!!document.querySelector('.html-note-window iframe')"));await noInput('Previewing after dismissing code input');
  await tap('[aria-label="HTML 源码"]');await noInput('Returning to source without typing');
  await tap('button.language-button');await until(()=>evaluate("!!document.querySelector('.code-language-menu')"));await noInput('Opening the HTML language menu');
  await tap('.code-language-menu [data-language="JavaScript"]');await until(()=>evaluate("!document.querySelector('.html-preview-ui')"));
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),code);
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .code-id').textContent"),'00ab');
  await noInput('Changing HTML back to an ordinary fence');assert.equal((await native('read',note)).content,content);
  console.log('PASS '+(webview?'WebView':'Gecko')+': reversible HTML language selection, source/preview controls, dismissed IME, stable code and ID, manual save.');
}finally{
  try{if(previous)await native('feature','preferences.set-many',{values:previous});if(created)await native('trash',folder);}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
