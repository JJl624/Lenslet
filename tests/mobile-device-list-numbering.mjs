import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='list-numbering-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-list-numbering/'+folder);
await fs.mkdir(output,{recursive:true});let previous,created=false;const results=[];
const baidu=process.env.MOYU_SOFT_KEYBOARD_PROFILE==='baidu-mi-1080x2400';
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-numbering-button]')?.removeAttribute('data-numbering-button');const b=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.numberingButton='true';true`);await tap('[data-numbering-button]');
}
const mode=label=>button(label,"document.querySelector('.mobile-mode-tabs')");
const move=label=>button(label,"document.querySelector('.mobile-formatbar')");
async function labels(expected){
  await until(`JSON.stringify([...document.querySelectorAll('.ProseMirror .label-wrapper .ordered')].map(n=>n.textContent))===${JSON.stringify(JSON.stringify(expected))}`);
}
async function caret(){
  await until("document.activeElement===document.querySelector('.milkdown-code-block .cm-content')");
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').contains(getSelection()?.anchorNode)"),true);
  assert.equal(await native('feature','mobile.keyboard-visible'),true);
}
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  if(baidu){assert.match(shell('shell','settings','get','secure','default_input_method'),/com\.baidu\.input_mi/);assert.match(shell('shell','wm','size'),/1080x2400/);}
  await native('create',folder,'folder','');created=true;const cases=[];
  for(const [first,nested] of [[1,false],[1,true],[5,false]]){
    const note=folder+'/'+first+'-'+nested+'.md',raw=`${first}. upper A\n${first+1}. upper B\n\n\`\`\`text\n11\n\`\`\`\n\n1. lower A\n2. lower B`;
    await native('create',note,'file',nested?'- outer\n\n'+raw.split('\n').map(line=>'  '+line).join('\n'):raw);cases.push({note,first,nested});
  }
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual'}});await device.reload();if(await evaluate("!!document.querySelector('.mobile-document')"))await button('返回笔记');
  for(const {note,first,nested} of cases){
    const folderSelector='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(folderSelector)})?.getAttribute('aria-expanded')!=='true'`))await tap(folderSelector+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(note)+'] .mobile-file-open');await mode('编辑');await until("!!document.querySelector('.milkdown-code-block .cm-content')");await tap('.milkdown-code-block .cm-content');
    const sequence=[first,first+1,first+2,first+3].map(n=>n+'.');
    await move('缩进至列表');await labels(sequence);assert.equal(await evaluate("document.querySelectorAll('.ProseMirror ol').length"),1);await caret();
    await button('撤销');await labels([first+'.',first+1+'.','1.','2.']);await caret();
    await button('重做');await labels(sequence);await caret();
    await move('脱离列表');await labels([first+'.',first+1+'.','1.','2.']);assert.equal(await evaluate("[...document.querySelectorAll('.ProseMirror ol')].at(-1).getAttribute('start')"),null);
    await move('缩进至列表');await labels(sequence);assert.equal(await evaluate("document.querySelectorAll('.ProseMirror ol').length"),1);await caret();
    const index=await evaluate("[...document.querySelectorAll('.ProseMirror p')].findIndex(p=>p.textContent==='lower A')");await tap('.ProseMirror p',index);shell('shell','input','keyevent','KEYCODE_MOVE_END');
    if(baidu)shell('shell','input','tap','990','2100');else shell('shell','input','keyevent','KEYCODE_DEL');
    await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='lower ')");await labels(sequence);await button('撤销');await labels(sequence);
    await button('保存文档');const saved=(await native('read',note)).content;await device.reload();await mode('编辑');await labels(sequence);
    results.push({first,nested,saved});console.log('PASS immediate numbering, history, splitting, deletion and saved reload: '+first+', nested='+nested);await button('返回笔记');
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('Native numbering: '+results.length+' groups passed. '+output);
}catch(error){
  await fs.writeFile(path.join(output,'failure.png'),device.screenshot());let state;
  try{state=await evaluate("({active:document.activeElement?.className,labels:[...document.querySelectorAll('.ordered')].map(n=>n.textContent),text:document.querySelector('.ProseMirror')?.textContent})");}catch(snapshotError){state={unavailable:String(snapshotError)};}
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state},null,2));throw error;
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
