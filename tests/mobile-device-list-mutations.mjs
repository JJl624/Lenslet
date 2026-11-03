import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='list-mutations-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-list-mutations/'+folder);
await fs.mkdir(output,{recursive:true});let previous,created=false;const results=[];
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-mutation-button]')?.removeAttribute('data-mutation-button');const b=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.mutationButton='true';true`);await tap('[data-mutation-button]');
}
const mode=label=>button(label,"document.querySelector('.mobile-mode-tabs')");
async function labels(expected){await until(`JSON.stringify([...document.querySelectorAll('.ProseMirror .label-wrapper .ordered')].map(n=>n.textContent))===${JSON.stringify(JSON.stringify(expected))}`);}
async function open(note){
  const selector='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')!=='true'`))await tap(selector+' .mobile-file-open');
  await tap('[data-path='+JSON.stringify(note)+'] .mobile-file-open');
}
async function textTap(text){const index=await evaluate(`[...document.querySelectorAll('.ProseMirror p')].findIndex(p=>p.textContent===${JSON.stringify(text)})`);assert.ok(index>=0);await tap('.ProseMirror p',index);}
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;
  const sample=folder+'/mixed.md',source='1. 33\n\n3) <br />\n\n   <br />';await native('create',sample,'file',source);
  const blockNote=folder+'/blocks.md',blockSource='5. alpha\n6. beta\n\n   ```text\n   11\n   ```\n\n7. gamma\n8. delta';await native('create',blockNote,'file',blockSource);
  const gapNote=folder+'/gap.md';await native('create',gapNote,'file','1. alpha\n2. beta\n\nseparator\n\n1. gamma\n2. delta');
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual'}});await device.reload();if(await evaluate("!!document.querySelector('.mobile-document')"))await button('返回笔记');
  await open(sample);assert.equal(await evaluate("document.querySelectorAll('.reading-view ol').length"),1);await mode('编辑');await labels(['1.','2.']);
  assert.equal(await evaluate("document.querySelectorAll('.ProseMirror .list-item').length"),2);
  // Delete in the second empty paragraph before touching any marker: it must
  // already say 2, and history must retain the two-paragraph empty item.
  await tap('.ProseMirror p',2);shell('shell','input','keyevent','KEYCODE_DEL');await labels(['1.','2.']);
  await button('撤销');await labels(['1.','2.']);assert.equal(await evaluate("document.querySelectorAll('.ProseMirror p').length"),3);
  await textTap('33');shell('shell','input','keyevent','KEYCODE_MOVE_END');shell('shell','input','text','4');await until("document.querySelector('.ProseMirror p')?.textContent==='334'");await labels(['1.','2.']);
  await button('保存文档');await device.reload();await mode('编辑');await labels(['1.','2.']);results.push({case:'original mixed delimiter and empty paragraphs',saved:(await native('read',sample)).content});console.log('PASS original mixed delimiters, empty paragraph deletion, history and saved reload');await button('返回笔记');
  await open(blockNote);await mode('编辑');await tap('.milkdown-code-block .cm-content');
  await button('脱离列表',"document.querySelector('.mobile-formatbar')");await labels(['5.','6.','1.','2.']);await button('保存文档');await device.reload();await mode('编辑');await labels(['5.','6.','1.','2.']);
  await tap('.milkdown-code-block .cm-content');await button('缩进至列表',"document.querySelector('.mobile-formatbar')");await labels(['5.','6.','7.','8.']);
  await textTap('gamma');shell('shell','input','keyevent','KEYCODE_MOVE_END');shell('shell','input','keyevent','KEYCODE_ENTER');shell('shell','input','text','new');await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='new')");await labels(['5.','6.','7.','8.','9.']);
  await delay(600);for(let i=0;i<3;i++)shell('shell','input','keyevent','KEYCODE_DEL');shell('shell','input','keyevent','KEYCODE_DEL');await labels(['5.','6.','7.','8.']);
  await button('撤销');await labels(['5.','6.','7.','8.','9.']);await button('重做');await labels(['5.','6.','7.','8.']);
  await button('保存文档');await device.reload();await mode('编辑');await labels(['5.','6.','7.','8.']);assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),'11');
  results.push({case:'split, join, insert, delete, history and saved reload',saved:(await native('read',blockNote)).content});console.log('PASS block outdent restart, rejoin, item insertion/deletion, history and saved reload');
  await button('返回笔记');await open(gapNote);await mode('编辑');await textTap('separator');
  await evaluate("const p=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent==='separator');document.querySelector('.ProseMirror').focus();const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);true");
  shell('shell','input','keyevent','KEYCODE_DEL');await until("![...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='separator')");await labels(['1.','2.','1.','2.']);
  await button('保存文档');await device.reload();await mode('编辑');await labels(['1.','2.','1.','2.']);assert.equal(await evaluate("document.querySelectorAll('.ProseMirror > p').length"),1);
  results.push({case:'intentional empty list separator survives saved reload',saved:(await native('read',gapNote)).content});console.log('PASS intentionally empty paragraph remains a list boundary after saved reload');
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('Native list mutations: '+results.length+' groups passed. '+output);
}catch(error){
  await fs.writeFile(path.join(output,'failure.png'),device.screenshot());let state;
  try{state=await evaluate("({active:document.activeElement?.className,labels:[...document.querySelectorAll('.ordered')].map(n=>n.textContent),text:document.querySelector('.ProseMirror')?.textContent})");}catch(snapshotError){state={unavailable:String(snapshotError)};}
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state},null,2));throw error;
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
