import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='empty-code-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-empty-code/'+folder);
const auxiliary=!process.env.MOYU_EMPTY_CODE_CASE||process.env.MOYU_EMPTY_CODE_CASE==='auxiliary';
await fs.mkdir(output,{recursive:true});let previous,created=false;const results=[];
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-boundary-button]')?.removeAttribute('data-boundary-button');const b=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!b)throw Error('Missing '+${JSON.stringify(label)});b.dataset.boundaryButton='true';true`);await tap('[data-boundary-button]');
}
async function erase(){
  if(process.env.MOYU_SOFT_KEYBOARD_PROFILE==='gboard-720x1600'){
    assert.equal(await native('feature','mobile.keyboard-visible'),true);
    shell('shell','input','tap','665','1350');return;
  }
  shell('shell','uiautomator','dump','/sdcard/moyu-empty-code.xml');
  const xml=shell('shell','cat','/sdcard/moyu-empty-code.xml');
  const key=xml.match(/<node\b[^>]*content-desc="(?:Delete|Backspace|删除|退格)"[^>]*>/i)?.[0],bounds=key?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if(!bounds)throw Error('The real IME Backspace key was not found in the accessibility hierarchy.');
  shell('shell','input','tap',String(Math.round((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.round((Number(bounds[2])+Number(bounds[4]))/2)));
}
async function caret(){
  await until("document.activeElement===document.querySelector('.milkdown-code-block .cm-content')");
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').contains(getSelection()?.anchorNode)"),true);
}
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  if(process.env.MOYU_SOFT_KEYBOARD_PROFILE==='gboard-720x1600'){
    assert.match(shell('shell','settings','get','secure','default_input_method'),/^com\.google\.android\.inputmethod\.latin\//);
    assert.match(shell('shell','wm','size'),/720x1600/);
  }
  await native('create',folder,'folder','');created=true;const cases=[];
  for(const [kind,language] of [['ordered','text'],['root','text'],['nested','text'],['ordered','html'],['nested','tabs']]){
    if(process.env.MOYU_EMPTY_CODE_CASE&&process.env.MOYU_EMPTY_CODE_CASE!==kind+':'+language)continue;
    const fence='```'+language+'\n```\n\n<br />',content=kind==='root'?fence:kind==='ordered'?'1. sss\n2. 1\n3. <br />\n\n'+fence.split('\n').map(line=>'   '+line).join('\n')+'\n\n4. 3\n5. 3':'- 一级\n\n  - <br />\n\n'+fence.split('\n').map(line=>'    '+line).join('\n')+'\n\n  - 下一项';
    const note=folder+'/'+kind+'-'+language+'.md';await native('create',note,'file',content);cases.push({kind,language,note,content});
  }
  const inserted=folder+'/new-code.md';if(auxiliary)await native('create',inserted,'file','1. sss\n2. 1\n3. <br />\n4. 3\n5. 3');
  const legacy=folder+'/legacy.md',legacyBody='<br />\n\n```text {id=0003}\n```\n\n<br />'.replaceAll('<','\\<').replaceAll('`','\\`').split('\n');
  const legacySource='1. sss\n2. 1\n3. '+legacyBody[0]+'\n'+legacyBody.slice(1).map(row=>'   '+row).join('\n')+'\n4. 3';
  if(auxiliary)await native('create',legacy,'file',legacySource);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual'}});await device.reload();if(await evaluate("!!document.querySelector('.mobile-document')"))await button('返回笔记');
  for(const {kind,language,note,content} of cases){
    const selector='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')!=='true'`))await tap(selector+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(note)+'] .mobile-file-open');await button('编辑',"document.querySelector('.mobile-mode-tabs')");
    if(language==='tabs')await button('显示源码',"document.querySelector('.milkdown-code-block')");
    await until("document.querySelector('.milkdown-code-block')?.nextElementSibling?.tagName==='P'");
    const p=await evaluate("[...document.querySelectorAll('.ProseMirror p')].indexOf(document.querySelector('.milkdown-code-block').nextElementSibling)");assert.ok(p>=0);await tap('.ProseMirror p',p);
    await until("document.documentElement.dataset.mobileKeyboard==='true'");
    assert.equal(await evaluate("document.querySelector('.milkdown-code-block').nextElementSibling.contains(getSelection()?.anchorNode)"),true);
    const items=await evaluate("document.querySelectorAll('.ProseMirror .list-item').length");
    await evaluate("window.__boundaryEvents=[];const snapshot=()=>({active:document.activeElement?.className,anchor:getSelection()?.anchorNode?.parentElement?.className,code:document.querySelector('.milkdown-code-block .cm-content')?.textContent});for(const type of ['keydown','beforeinput','input','focusin','focusout'])document.addEventListener(type,event=>{const item={type,key:event.key,input:event.inputType,target:event.target.className};__boundaryEvents.push(item);queueMicrotask(()=>Object.assign(item,{cancelled:event.defaultPrevented,...snapshot()}));},true);true");
    await erase();assert.equal(await evaluate("document.querySelectorAll('.milkdown-code-block').length"),1);
    if(process.env.MOYU_EMPTY_CODE_DIAGNOSTIC==='1')console.log(JSON.stringify(await evaluate("(()=>{const root=document.querySelector('.ProseMirror'),found=[];const walk=d=>{if(!d)return;if(d.node?.type.name==='code_block')found.push({keys:Object.keys(d),spec:d.spec&&Object.keys(d.spec),node:d.node.toJSON(),selection:d.spec?.view?.state.selection.toJSON()});d.children?.forEach(walk);};walk(root.pmViewDesc);return{found,keyboard:document.documentElement.dataset.mobileKeyboard,input:document.documentElement.dataset.mobileInput,paragraphs:[...root.querySelectorAll('p')].map(p=>p.textContent),anchor:getSelection()?.anchorNode?.parentElement?.outerHTML,events:window.__boundaryEvents};})()"),null,2));
    await caret();
    assert.equal(await evaluate("document.querySelectorAll('.ProseMirror .list-item').length"),items);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.milkdown-code-block .language-button')).whiteSpace"),'nowrap');
    await button('阅读',"document.querySelector('.mobile-mode-tabs')");await until("document.querySelectorAll('.reading-view .code-block-shell').length===1");
    assert.equal(await evaluate("document.querySelector('.reading-view').textContent.includes('```')||document.querySelector('.reading-view').textContent.includes('<br />')"),false);
    await button('编辑',"document.querySelector('.mobile-mode-tabs')");await until("document.querySelectorAll('.milkdown-code-block').length===1");
    if(language==='tabs')await button('显示源码',"document.querySelector('.milkdown-code-block')");
    await tap('.milkdown-code-block .cm-content');await until("document.documentElement.dataset.mobileKeyboard==='true'");await caret();
    shell('shell','input','text','7');await until("document.querySelector('.milkdown-code-block .cm-content').textContent==='7'");
    await erase();await until("document.querySelector('.milkdown-code-block .cm-content').textContent===''");
    await erase();await until("!document.querySelector('.milkdown-code-block')");
    await button('撤销');await caret();await button('重做');await until("!document.querySelector('.milkdown-code-block')");await button('撤销');await caret();
    shell('shell','input','text','9');await until("document.querySelector('.milkdown-code-block .cm-content').textContent==='9'");
    assert.equal(await evaluate("document.querySelectorAll('.ProseMirror .list-item').length"),items);assert.equal((await native('read',note)).content,content);
    results.push({kind,language,items});console.log('PASS real soft-keyboard boundary deletion, deliberate block removal and history: '+kind+', '+language);await button('返回笔记');
  }
  if(auxiliary){
    const branch='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(branch)})?.getAttribute('aria-expanded')!=='true'`))await tap(branch+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(inserted)+'] .mobile-file-open');await button('编辑',"document.querySelector('.mobile-mode-tabs')");
    await until("document.querySelectorAll('.ProseMirror .list-item').length===5");await tap('.ProseMirror .list-item p',2);
    await button('全部格式');await until("!!document.querySelector('dialog[open],[role=dialog]')");await button('代码块',"document.querySelector('dialog[open],[role=dialog]')");await until("document.querySelectorAll('.milkdown-code-block').length===1");
    await button('阅读',"document.querySelector('.mobile-mode-tabs')");await until("document.querySelectorAll('.reading-view .code-block-shell').length===1");
    assert.equal(await evaluate("document.querySelector('.reading-view').textContent.includes('```')||document.querySelector('.reading-view').textContent.includes('<br />')"),false);
    await button('保存文档');const saved=(await native('read',inserted)).content;assert.match(saved,/```text/);assert.match(saved,/<br\s*\/>\s*\n\s*\n\s*```/);
    await device.reload();await until("document.querySelectorAll('.reading-view .code-block-shell').length===1");
    results.push({kind:'new-empty-code',language:'text',items:5});console.log('PASS newly inserted empty list code survives reading, manual save and reload.');
    await button('返回笔记');const selector='[data-path='+JSON.stringify(folder)+']';if(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')!=='true'`))await tap(selector+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(legacy)+'] .mobile-file-open');await until("document.querySelectorAll('.reading-view .code-block-shell').length===1");
    assert.equal(await evaluate("document.querySelector('.reading-view').textContent.includes('```')||document.querySelector('.reading-view').textContent.includes('<br />')"),false);
    await button('编辑',"document.querySelector('.mobile-mode-tabs')");await until("document.querySelectorAll('.milkdown-code-block').length===1");assert.equal((await native('read',legacy)).content,legacySource);
    results.push({kind:'legacy-empty-code',language:'text',items:4});console.log('PASS legacy empty list code renders as code without rewriting its file.');
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('Native empty code boundaries: '+results.length+' groups passed. '+output);
}catch(error){
  await fs.writeFile(path.join(output,'failure.png'),device.screenshot());let state;
  try{state=await evaluate("({active:document.activeElement?.className,text:document.querySelector('.ProseMirror')?.textContent,code:document.querySelector('.milkdown-code-block')?.textContent,events:window.__boundaryEvents})");}catch(snapshotError){state={unavailable:String(snapshotError)};}
  await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state},null,2));throw error;
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
