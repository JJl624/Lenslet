import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,shell,tap,keyboard}=device;
const folder='list-input-'+Date.now(),note=folder+'/note.md';let previous,created=false;
const content='- Original item\n\n  - Nested item\n\n    ```js\n    console.log(1);\n    ```\n';
async function until(check){const end=Date.now()+30000;while(Date.now()<end){if(await check())return;await delay(150);}throw Error('List input check timed out.');}
try{
  await device.ready();await device.initialize();assert.equal((await native('load')).root,'internal');
  previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await device.reload();await device.initialize();
  await evaluate("[...document.querySelectorAll('.mobile-mode-tabs button')].find(button=>button.textContent==='编辑').click();true");
  await until(()=>evaluate("!!document.querySelector('.ProseMirror')&&!document.querySelector('[data-editor-pending=true]')"));
  await tap('.milkdown-code-block .cm-content');await until(keyboard);
  const point=await evaluate("(()=>{const code=document.querySelector('.milkdown-code-block'),handle=code.querySelector('.code-resize');handle.scrollIntoView({block:'center'});const box=code.getBoundingClientRect(),bar=handle.getBoundingClientRect();return{x:box.left+12,y:bar.top+bar.height/2};})()");
  await device.tapAt(point.x,point.y);
  await until(()=>evaluate("document.activeElement?.classList.contains('ProseMirror')===true"));
  await until(()=>evaluate("(()=>{const node=getSelection()?.anchorNode;return !!(node?.nodeType===1?node:node?.parentElement)?.closest('.ProseMirror p');})()"));
  shell('shell','input','text',"'*'");
  console.log('Native first character:',JSON.stringify(await evaluate("({paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(node=>node.textContent),code:document.querySelector('.cm-content')?.textContent,active:document.activeElement?.className})")));
  await until(()=>evaluate("[...document.querySelectorAll('.ProseMirror .list-item p')].some(node=>node.textContent==='*')"));
  shell('shell','input','keyevent','KEYCODE_SPACE');shell('shell','input','text','NextItem');
  console.log('Native list conversion:',JSON.stringify(await evaluate("({paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(node=>node.textContent),code:document.querySelector('.cm-content')?.textContent,selection:getSelection()?.anchorNode?.textContent})")));
  await until(()=>evaluate("[...document.querySelectorAll('.ProseMirror .list-item p')].some(node=>node.textContent==='NextItem')"));
  assert.equal((await native('read',note)).content,content,'A manual document must stay unchanged on disk');
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),'console.log(1);');
  console.log('PASS: native Gecko code exit, literal star, list conversion and manual save boundary.');
}finally{
  try{if(previous)await native('feature','preferences.set-many',{values:previous});if(created)await native('trash',folder);}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
