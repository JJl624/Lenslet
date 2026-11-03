import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

// Runs unchanged on Gecko emulators and explicitly opted-in physical devices.
// Only com.lrj.moyu.gecko.debug and its temporary internal files are modified.
const device=await androidGeckoDevice(),{evaluate,native,tap,keyboard}=device;
const folder='editing-matrix-'+Date.now(),note=folder+'/note.md';
const output=path.resolve(import.meta.dirname,'../../../work/gecko-editing-matrix/'+folder);
await fs.mkdir(output,{recursive:true});
const content='- 一级\n\n  - 二级\n\n    ```text\n    11\n    ```\n\n    继续文字\n\n    | 名称 | 值 |\n    | --- | --- |\n    | 数据 | 1 |\n\n    ![示意图](image.svg)\n\n    > [+] 引用标题\n    > 引用内容\n\n    ```tabs\n    :::js 第一页\n    console.log(1);\n    :::py 第二页\n    print(2)\n    ```\n\n- 末项\n';
let previous,created=false;const results=[];
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await until(`!![...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)})`);
  await evaluate(`document.querySelector('[data-device-click]')?.removeAttribute('data-device-click');[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)}).setAttribute('data-device-click','true');true`);
  await tap('[data-device-click]');await delay(200);
}
const mode=label=>button(label,"document.querySelector('.mobile-mode-tabs')");
const context=label=>button(label,"document.querySelector('.mobile-formatbar')");
const depth=selector=>evaluate(`(()=>{let d=0;for(let e=document.querySelector(${JSON.stringify(selector)})?.parentElement;e;e=e.parentElement)if(e.classList.contains('list-item'))d++;return d;})()`);
const cursor=()=>evaluate(`(()=>{const s=getSelection(),a=s?.anchorNode,e=a?.nodeType===1?a:a?.parentElement;let depth=0;for(let n=e;n;n=n.parentElement)if(n.classList.contains('list-item'))depth++;return{collapsed:s?.isCollapsed,text:s?.toString(),anchor:e?.tagName,code:!!e?.closest('.cm-content'),table:!!e?.closest('td,th'),depth,active:document.activeElement?.className};})()`);
// Structural cases use Android key events. Real Baidu candidate/punctuation
// sequences are exercised separately; creating a second InputConnection while
// Baidu owns one does not model its connection lifecycle on physical devices.
async function input(text){device.shell('shell','input','text',text);await delay(250);}
async function check(name,run){
  if(process.env.MOYU_DEVICE_CASE_LIMIT&&results.length>=Number(process.env.MOYU_DEVICE_CASE_LIMIT))return;
  try{await run();results.push({name,ok:true,cursor:await cursor(),keyboard:keyboard()});console.log('PASS '+name);}
  catch(error){results.push({name,ok:false,error:error.stack,cursor:await cursor(),dom:await evaluate("({paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(p=>p.textContent),code:[...document.querySelectorAll('.cm-content')].map(p=>p.textContent)})")});await fs.writeFile(path.join(output,'failure-'+results.length+'.png'),device.screenshot());console.error('FAIL '+name+'\n'+error.stack);}
}
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;
  await native('create',folder+'/image.svg','file','<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="teal"/></svg>');
  await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await device.reload();
  await until("document.querySelector('.mobile-document-title')?.textContent.includes('note')===true");await mode('编辑');await until("document.querySelectorAll('.milkdown-code-block').length===2");
  await check('代码块退一级、重新入列表，深度和内容保持一致',async()=>{
    await tap('.milkdown-code-block .cm-content',0);await until("!!document.querySelector('.mobile-formatbar [aria-label=脱离列表]')");assert.equal(await depth('.milkdown-code-block'),2);
    await context('脱离列表');assert.equal(await depth('.milkdown-code-block'),1);await context('缩进至列表');assert.equal(await depth('.milkdown-code-block'),2);
    await until("document.activeElement===document.querySelector('.milkdown-code-block .cm-content')");
    await input('7');await until("document.querySelector('.milkdown-code-block .cm-content').textContent.includes('7')");device.shell('shell','input','keyevent','KEYCODE_DEL');await until("document.querySelector('.milkdown-code-block .cm-content').textContent==='11'");
    assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),'11');
  });
  await check('代码块后换行及后续输入落在同级段落',async()=>{
    await tap('.milkdown-code-block .cm-content',0);await context('换行');await input('10101');
    await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='10101继续文字'||p.textContent.includes('10101'))");
    const state=await cursor();assert.equal(state.code,false);assert.equal(state.depth,2);
    const geometry=await evaluate("(()=>{const c=document.querySelector('.milkdown-code-block'),p=c.nextElementSibling;return{top:p.getBoundingClientRect().top,bottom:c.getBoundingClientRect().bottom};})()");assert.ok(geometry.top>=geometry.bottom);
  });
  await check('表格添加行和删除行保留列数与列表缩进',async()=>{
    await tap('.ProseMirror table.children td p',0);await until("!!document.querySelector('.mobile-formatbar [aria-label=添加行]')");
    await context('添加行');assert.equal(await evaluate("document.querySelectorAll('.ProseMirror table.children tr').length"),3);
    await tap('.ProseMirror table.children tr:last-child td p',0);await context('删除行');assert.equal(await evaluate("document.querySelectorAll('.ProseMirror table.children tr').length"),2);assert.equal(await depth('.ProseMirror table.children'),2);
  });
  await check('表格添加列和删除列、单元格继续输入',async()=>{
    await tap('.ProseMirror table.children td p',0);await context('添加列');assert.equal(await evaluate("document.querySelectorAll('.ProseMirror table.children tr:first-child>*').length"),3);
    await tap('.ProseMirror table.children td p',1);await context('删除列');assert.equal(await evaluate("document.querySelectorAll('.ProseMirror table.children tr:first-child>*').length"),2);
    await tap('.ProseMirror table.children td p',0);await input('20202');assert.equal((await cursor()).table,true);await until("document.querySelector('.ProseMirror table.children').textContent.includes('20202')");
  });
  await check('表格后换行不编辑原单元格',async()=>{
    const before=await evaluate("document.querySelector('.ProseMirror table.children').textContent");await tap('.ProseMirror table.children td p',0);await context('换行');await input('30303');
    assert.equal((await cursor()).table,false);assert.equal((await cursor()).depth,2);assert.equal(await evaluate("document.querySelector('.ProseMirror table.children').textContent"),before);
  });
  await check('图片点击转源码，块后输入保留列表层级',async()=>{
    await tap('.attachment-overlay img');await until("document.querySelector('.visual-attachment .syntax-raw')?.contains(getSelection()?.anchorNode)===true");
    await until("!!document.querySelector('.mobile-formatbar [aria-label=换行]')");await context('换行');await input('40404');assert.equal((await cursor()).depth,2);
    assert.equal(await evaluate("document.querySelector('.visual-attachment')?.dataset.resourceLink"),'image.svg');
  });
  await check('折叠引用开关保留页面位置和代码数据',async()=>{
    await tap('.folding-quote > p',1);await until("!!document.querySelector('.mobile-formatbar [aria-label=默认折叠]')");await context('默认折叠');
    await until("!!document.querySelector('.mobile-formatbar [aria-label=默认展开]')");await context('默认展开');assert.equal(await depth('.folding-quote'),2);
    assert.equal(await evaluate("document.querySelector('.milkdown-code-block .cm-content').textContent"),'11');
  });
  await check('去除一层引用、撤销和重做保留引用内容',async()=>{
    await tap('.folding-quote p',1);await context('去除一层引用');await button('撤销');await until("document.querySelector('.folding-quote')?.textContent.includes('引用内容')===true");
    await button('重做');await button('撤销');await until("document.querySelector('.folding-quote')?.textContent.includes('引用内容')===true");
  });
  await check('标签切换与管理按钮保持键盘关闭',async()=>{
    if(await native('feature','mobile.keyboard-visible')){await native('feature','mobile.keyboard-hide');await until("document.documentElement.dataset.mobileKeyboard==='false'");}
    await button('第二页',"document.querySelector('.tabbed-code .tabs-bar')");await until("document.querySelector('.tabbed-code [role=tab][aria-selected=true]')?.textContent==='第二页'");assert.equal(keyboard(),false);
    await button('管理代码标签页',"document.querySelector('.tabbed-code')");await until("document.querySelector('.tabs-management')!==null");assert.equal(keyboard(),false);await button('管理代码标签页',"document.querySelector('.tabbed-code')");
  });
  await check('模式切换、未保存内容、代码内容和光标上下文一致',async()=>{
    await mode('源码');await until("!!document.querySelector('.source-editor .cm-content')");assert.equal(keyboard(),false);
    for(const text of ['10101','30303','40404','20202',':::py 第二页'])assert.equal(await evaluate(`document.querySelector('.source-editor').textContent.includes(${JSON.stringify(text)})`),true);
    await mode('阅读');await until("!!document.querySelector('.reading-view')");await mode('编辑');await until("!!document.querySelector('.ProseMirror')");assert.equal(keyboard(),false);
    assert.equal((await native('read',note)).content,content,'All edits must remain unsaved until Save');
    await button('保存文档');await delay(300);const disk=(await native('read',note)).content;for(const text of ['10101','30303','40404','20202'])assert.ok(disk.includes(text));
  });
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({serial:process.env.ANDROID_SERIAL,ime:device.shell('shell','settings','get','secure','default_input_method'),results},null,2));
  assert.equal(results.filter(item=>!item.ok).length,0,'Native editing matrix failures; see '+output);
  console.log('Native editing matrix: '+results.length+' passed. Results: '+output);
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
