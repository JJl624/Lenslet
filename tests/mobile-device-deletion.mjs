import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='deletion-'+Date.now(),note=folder+'/note.md';let previous,created=false;
const output=path.resolve(import.meta.dirname,'../../../work/gecko-deletion/'+folder);await fs.mkdir(output,{recursive:true});
const baidu=process.env.MOYU_SOFT_KEYBOARD_PROFILE==='baidu-mi-1080x2400';
const content='```text\n11\n```\n\n1. 项目\n\n   ```text\n   11\n   ```\n\n- 一级\n\n  - 二级\n\n    ```text\n    11\n    ```\n\n| 列 | 值 |\n| --- | --- |\n| 数据 | 1 |\n\n末尾文字';
const results=[];
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-delete-button]')?.removeAttribute('data-delete-button');const node=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!node)throw Error('Missing '+${JSON.stringify(label)});node.dataset.deleteButton='true';true`);
  await tap('[data-delete-button]');await delay(200);
}
const context=label=>button(label,"document.querySelector('.mobile-formatbar')");
async function erase(){if(baidu)shell('shell','input','tap','990','2100');else shell('shell','input','keyevent','KEYCODE_DEL');await delay(200);}
const snapshot=()=>evaluate("(()=>{const s=getSelection(),a=s?.anchorNode,e=a?.nodeType===1?a:a?.parentElement;return{anchor:e?.tagName,classes:e?.className,active:document.activeElement?.className,paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(p=>p.textContent),code:[...document.querySelectorAll('.milkdown-code-block .cm-content')].map(c=>c.textContent),items:document.querySelectorAll('.ProseMirror .list-item').length};})()");
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  if(baidu){assert.match(shell('shell','settings','get','secure','default_input_method'),/com\.baidu\.input_mi/);assert.match(shell('shell','wm','size'),/1080x2400/);}
  await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await device.reload();
  await button('编辑',"document.querySelector('.mobile-mode-tabs')");await until("document.querySelectorAll('.milkdown-code-block').length===3");
  await evaluate("window.__deletionEvents=[];for(const type of ['keydown','beforeinput','input'])document.addEventListener(type,e=>__deletionEvents.push({type,key:e.key,input:e.inputType,target:e.target.className}),true);true");
  for(const index of [0,1,2]){
    await tap('.milkdown-code-block .cm-content',index);await until("document.documentElement.dataset.mobileKeyboard==='true'");await context('换行');
    await until(`document.querySelectorAll('.milkdown-code-block')[${index}].nextElementSibling?.matches('p')===true`);
    const point=await evaluate(`(async()=>{const p=document.querySelectorAll('.milkdown-code-block')[${index}].nextElementSibling;p.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const box=p.getBoundingClientRect();return{x:box.left+10,y:box.top+box.height/2};})()`);
    await device.tapAt(point.x,point.y);
    const before=await snapshot();await erase();
    await until(`document.activeElement===document.querySelectorAll('.milkdown-code-block .cm-content')[${index}]`);
    let state=await snapshot();assert.equal(state.code[index],'11');assert.equal(state.items,before.items);
    await erase();await until(`document.querySelectorAll('.milkdown-code-block .cm-content')[${index}].textContent==='1'`);
    state=await snapshot();assert.equal(state.items,before.items,'The second Backspace must not create a list item');
    await erase();await until(`document.querySelectorAll('.milkdown-code-block .cm-content')[${index}].textContent===''`);
    await erase();await until("document.querySelectorAll('.milkdown-code-block').length===2");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.ProseMirror')"),true);
    shell('shell','input','text','9');await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='9')");
    assert.equal((await snapshot()).items,before.items,'Removing empty code must preserve its list level');
    await button('撤销');await button('撤销');await until("document.querySelectorAll('.milkdown-code-block').length===3");
    await until(`document.activeElement===document.querySelectorAll('.milkdown-code-block .cm-content')[${index}]`);
    assert.equal(await evaluate(`document.querySelectorAll('.milkdown-code-block .cm-content')[${index}].contains(getSelection()?.anchorNode)`),true);
    await button('重做');await until("document.querySelectorAll('.milkdown-code-block').length===2");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.ProseMirror')"),true);
    await button('撤销');await until(`document.activeElement===document.querySelectorAll('.milkdown-code-block .cm-content')[${index}]`);
    shell('shell','input','text','11');await until(`document.querySelectorAll('.milkdown-code-block .cm-content')[${index}].textContent==='11'`);
    results.push({kind:['root','ordered','nested'][index],state:await snapshot()});console.log('PASS consecutive delete '+results.at(-1).kind);
    await fs.writeFile(path.join(output,'code-'+index+'.png'),device.screenshot());
  }
  await tap('.milkdown-code-block .cm-content',0);await context('换行');
  await button('撤销');await until("document.activeElement===document.querySelector('.milkdown-code-block .cm-content')");
  await button('重做');assert.equal(await evaluate("document.activeElement===document.querySelector('.ProseMirror')"),true);
  assert.equal(await evaluate("document.querySelector('.milkdown-code-block').nextElementSibling.contains(getSelection()?.anchorNode)"),true);
  await native('feature','mobile.keyboard-hide');await until("document.documentElement.dataset.mobileKeyboard==='false'");
  await button('撤销');assert.equal(await native('feature','mobile.keyboard-visible'),false);
  await button('重做');assert.equal(await native('feature','mobile.keyboard-visible'),false);
  results.push({kind:'history between code and paragraph, preserving closed IME'});console.log('PASS history moves the caret without reopening a closed keyboard');
  await tap('.ProseMirror table.children td p',0);await context('换行');await erase();
  await until("document.querySelector('.ProseMirror').classList.contains('ProseMirror-hideselection')");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.ProseMirror')).caretColor"),'rgba(0, 0, 0, 0)');
  await erase();await until("!document.querySelector('.milkdown-table-block')");await button('撤销');await until("!!document.querySelector('.milkdown-table-block table.children')");
  results.push({kind:'table delete and undo',state:await snapshot()});console.log('PASS selected table deletion and undo');
  const lastIndex=await evaluate("document.querySelectorAll('.ProseMirror > p').length-1");await tap('.ProseMirror > p',lastIndex);
  shell('shell','input','keyevent','KEYCODE_MOVE_END');shell('shell','input','keyevent','KEYCODE_ENTER');
  await until("[...document.querySelectorAll('.ProseMirror > p')].at(-1)?.textContent===''");
  if(await native('feature','mobile.keyboard-visible')){await native('feature','mobile.keyboard-hide');await until("document.documentElement.dataset.mobileKeyboard==='false'");}
  const point=await evaluate("(async()=>{const p=[...document.querySelectorAll('.ProseMirror > p')].at(-1),scope=p.closest('.mobile-document');scope.scrollTop=scope.scrollHeight;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const b=p.getBoundingClientRect();return{x:b.left+10,y:b.top+b.height/2};})()");
  await device.tapAt(point.x,point.y);await until("document.documentElement.dataset.mobileKeyboard==='true'");await delay(700);
  const geometry=await evaluate("(()=>{const p=[...document.querySelectorAll('.ProseMirror > p')].at(-1),scope=p.closest('.mobile-document'),line=parseFloat(getComputedStyle(p).lineHeight);return{bottom:p.getBoundingClientRect().bottom,boundary:scope.getBoundingClientRect().bottom,line,active:document.activeElement?.className,anchor:p.contains(getSelection()?.anchorNode)};})()");
  assert.equal(geometry.anchor,true);assert.ok(geometry.bottom<=geometry.boundary-geometry.line*2+4,JSON.stringify(geometry));
  results.push({kind:'last empty line above real IME',geometry});console.log('PASS last empty line with keyboard clearance');
  assert.equal((await native('read',note)).content,content,'Testing must not save the temporary document');
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({baidu,results,events:await evaluate('__deletionEvents')},null,2));console.log('Native deletion: '+results.length+' groups passed. '+output);
}catch(error){await fs.writeFile(path.join(output,'failure.png'),device.screenshot());await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state:await snapshot(),events:await evaluate('window.__deletionEvents||[]')},null,2));throw error;}
finally{try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}finally{await device.close();}}
