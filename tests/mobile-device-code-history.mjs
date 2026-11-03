import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='code-history-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-code-history/'+folder);await fs.mkdir(output,{recursive:true});
let previous,created=false;const results=[],baidu=process.env.MOYU_SOFT_KEYBOARD_PROFILE==='baidu-mi-1080x2400';
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-history-button]')?.removeAttribute('data-history-button');const b=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.historyButton='true';true`);await tap('[data-history-button]');
}
async function caret(){
  await until("document.activeElement===document.querySelector('.milkdown-code-block .cm-content')");
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').contains(getSelection()?.anchorNode)"),true);
  assert.equal(await native('feature','mobile.keyboard-visible'),true);
}
async function erase(){if(baidu)shell('shell','input','tap','990','2100');else shell('shell','input','keyevent','KEYCODE_DEL');await delay(200);}
const depth=()=>evaluate("(()=>{let count=0;for(let n=document.querySelector('.milkdown-code-block').parentElement;n;n=n.parentElement)if(n.matches('.list-item'))count++;return count;})()");
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  if(baidu){assert.match(shell('shell','settings','get','secure','default_input_method'),/com\.baidu\.input_mi/);assert.match(shell('shell','wm','size'),/1080x2400/);}
  await native('create',folder,'folder','');created=true;const cases=[];
  for(const language of ['html','tabs']){
    const body=language==='tabs'?':::text 第一页\n11\n:::text 第二页\n22':'11',note=folder+'/'+language+'.md';
    const content='- 一级\n\n  - 二级\n\n'+('```'+language+'\n'+body+'\n```').split('\n').map(line=>'    '+line).join('\n');
    await native('create',note,'file',content);cases.push({language,note,content});
  }
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual'}});await device.reload();if(await evaluate("!!document.querySelector('.mobile-document')"))await button('返回笔记');
  for(const {language,note,content} of cases){
    const folderSelector='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(folderSelector)})?.getAttribute('aria-expanded')!=='true'`))await tap(folderSelector+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(note)+'] .mobile-file-open');await button('编辑',"document.querySelector('.mobile-mode-tabs')");await until("!!document.querySelector('.milkdown-code-block .cm-content')");await tap('.milkdown-code-block .cm-content');
    assert.equal(await depth(),2);await button('脱离列表',"document.querySelector('.mobile-formatbar')");assert.equal(await depth(),1);
    await button('撤销');await caret();assert.equal(await depth(),2);await button('重做');await caret();assert.equal(await depth(),1);await button('撤销');await caret();
    // Do not tap or reposition the caret after history: input must go to the
    // code selection that history just restored.
    shell('shell','input','text','7');await until("document.querySelector('.milkdown-code-block .cm-content').textContent.includes('7')");await button('撤销');await caret();assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),'11');
    if(language==='tabs')await button('显示源码',"document.querySelector('.milkdown-code-block')");
    await tap('.milkdown-code-block .cm-content');shell('shell','input','keycombination','KEYCODE_CTRL_LEFT','KEYCODE_A');await erase();await until("document.querySelector('.milkdown-code-block .cm-content').textContent===''");await erase();await until("!document.querySelector('.milkdown-code-block')");
    await button('撤销');await caret();await button('重做');await until("!document.querySelector('.milkdown-code-block')");assert.equal(await evaluate("document.activeElement===document.querySelector('.ProseMirror')"),true);
    await button('撤销');await caret();shell('shell','input','text','8');await until("document.querySelector('.milkdown-code-block .cm-content').textContent.includes('8')");
    assert.equal(await depth(),2);assert.equal(await evaluate("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='8')"),false);assert.equal((await native('read',note)).content,content);
    results.push({language,depth:await depth()});console.log('PASS '+language+' history restores the code caret after movement and deletion, without tapping again');await button('返回笔记');
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('Native code history: '+results.length+' groups passed. '+output);
}catch(error){
  await fs.writeFile(path.join(output,'failure.png'),device.screenshot());let state;
  try{state=await evaluate("({active:document.activeElement?.className,paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(p=>p.textContent),code:document.querySelector('.milkdown-code-block')?.textContent})");}catch(snapshotError){state={unavailable:String(snapshotError)};}
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state},null,2));throw error;
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
