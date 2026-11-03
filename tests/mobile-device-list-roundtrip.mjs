import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap,shell}=device;
const folder='list-roundtrip-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-list-roundtrip/'+folder);
await fs.mkdir(output,{recursive:true});let previous,created=false;const results=[];
const baidu=process.env.MOYU_SOFT_KEYBOARD_PROFILE==='baidu-mi-1080x2400';
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
async function button(label,scope='document'){
  await evaluate(`document.querySelector('[data-roundtrip-button]')?.removeAttribute('data-roundtrip-button');const button=[...${scope}.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing '+${JSON.stringify(label)});button.dataset.roundtripButton='true';true`);
  await tap('[data-roundtrip-button]');
}
const mode=label=>button(label,"document.querySelector('.mobile-mode-tabs')");
async function erase(){if(baidu)shell('shell','input','tap','990','2100');else shell('shell','input','keyevent','KEYCODE_DEL');await delay(200);}
async function paragraphs(text){return evaluate(`(()=>{const p=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent===${JSON.stringify(text)}),item=p?.closest('.list-item');return item?[...item.querySelector(':scope > .children > .content-dom').children].filter(p=>p.tagName==='P').map(p=>p.textContent):null;})()`);}
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  if(baidu){assert.match(shell('shell','settings','get','secure','default_input_method'),/com\.baidu\.input_mi/);assert.match(shell('shell','wm','size'),/1080x2400/);}
  await native('create',folder,'folder','');created=true;
  const cases=[];
  for(const [index,kind] of ['ordered','bullet','task','nested'].entries()){
    const note=folder+'/'+kind+'.md',list=kind==='ordered'?'1. first\n2. middle\n3. last':kind==='task'?'- [ ] first\n- [ ] middle\n- [ ] last':'- first\n- middle\n- last';
    const language=['text','html','tabs','text'][index],body=language==='tabs'?':::text 第一页\n11':'11';
    const content=(kind==='nested'?'- outer\n\n'+list.split('\n').map(line=>'  '+line).join('\n'):list)+'\n\n```'+language+'\n'+body+'\n```';
    await native('create',note,'file',content);cases.push({note,kind,language});
  }
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual'}});await device.reload();
  if(await evaluate("!!document.querySelector('.mobile-document')"))await button('返回笔记');
  for(const {note,kind,language} of cases){
    const folderSelector='[data-path='+JSON.stringify(folder)+']';
    if(await evaluate(`document.querySelector(${JSON.stringify(folderSelector)})?.getAttribute('aria-expanded')!=='true'`))await tap(folderSelector+' .mobile-file-open');
    await tap('[data-path='+JSON.stringify(note)+'] .mobile-file-open');await mode('编辑');
    await until("!![...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent==='middle')");
    const pIndex=await evaluate("[...document.querySelectorAll('.ProseMirror p')].findIndex(p=>p.textContent==='middle')");await tap('.ProseMirror p',pIndex);
    await evaluate("const p=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent==='middle');document.querySelector('.ProseMirror').focus();const range=document.createRange();range.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(range);true");await erase();
    await button('全部格式');await button('换行',"document.querySelector('dialog[aria-label=全部格式]')");shell('shell','input','text','1');
    await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='1')");assert.deepEqual(await paragraphs('1'),['','1']);
    for(let round=0;round<2;round++){await mode('阅读');await until("!!document.querySelector('.reading-view li')");await mode('编辑');await until("!!document.querySelector('.ProseMirror')");assert.deepEqual(await paragraphs('1'),['','1']);}
    const textIndex=await evaluate("[...document.querySelectorAll('.ProseMirror p')].findIndex(p=>p.textContent==='1')");await tap('.ProseMirror p',textIndex);shell('shell','input','keyevent','KEYCODE_MOVE_END');shell('shell','input','text','2');await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='12')");assert.deepEqual(await paragraphs('12'),['','12']);
    await button('保存文档');const saved=(await native('read',note)).content;assert.ok(saved.includes('<br'));await device.reload();await mode('编辑');await until("!!document.querySelector('.ProseMirror')");assert.deepEqual(await paragraphs('12'),['','12']);
    assert.equal(await evaluate("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='last')"),true);
    if(language==='tabs')await button('显示源码',"document.querySelector('.milkdown-code-block')");
    await tap('.milkdown-code-block .cm-content');shell('shell','input','keycombination','KEYCODE_CTRL_LEFT','KEYCODE_A');await erase();await until("document.querySelector('.milkdown-code-block .cm-content')?.textContent===''");await erase();await until("!document.querySelector('.milkdown-code-block')");
    shell('shell','input','text','9');await until("[...document.querySelectorAll('.ProseMirror p')].some(p=>p.textContent==='9')");
    assert.equal(await evaluate("document.activeElement===document.querySelector('.ProseMirror')"),true);
    assert.equal(await evaluate("document.querySelector('.mobile-app').style.getPropertyValue('--font-ui')"),'sans-serif');
    assert.equal((await native('read',note)).content,saved,'Deletion must remain unsaved');
    results.push({kind,language,saved});console.log('PASS list round trip, saved reload and empty '+language+' deletion: '+kind);
    await button('返回笔记');
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));console.log('Native list round trip: '+results.length+' groups passed. '+output);
}catch(error){await fs.writeFile(path.join(output,'failure.png'),device.screenshot());await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,state:await evaluate("({active:document.activeElement?.className,paragraphs:[...document.querySelectorAll('.ProseMirror p')].map(p=>p.textContent),code:document.querySelector('.milkdown-code-block')?.textContent})")},null,2));throw error;}
finally{try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}finally{await device.close();}}
