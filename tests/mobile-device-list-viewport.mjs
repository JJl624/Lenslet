import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,tap}=device;
const folder='list-viewport-'+Date.now(),output=path.resolve(import.meta.dirname,'../../../work/gecko-list-viewport/'+folder);
await fs.mkdir(output,{recursive:true});let previous,created=false;const results=[];
async function until(expression){const end=Date.now()+20000;while(Date.now()<end){if(await evaluate(expression))return;await delay(150);}throw Error('Timed out: '+expression);}
const position=()=>evaluate(`(()=>{const block=document.querySelector('.milkdown-code-block'),scroll=block.closest('.document-scroll'),inner=block.querySelector('.tabs-editor,.cm-scroller');return {top:block.getBoundingClientRect().top-scroll.getBoundingClientRect().top,scroll:scroll.scrollTop,inner:inner.scrollTop,keyboard:document.documentElement.dataset.mobileKeyboard,active:document.activeElement?.className};})()`);
try{
  await device.ready();assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;
  const leading=Array.from({length:25},(_,i)=>'前文 '+i+'，保留当前页面位置。').join('\n\n');
  const trailing=Array.from({length:25},(_,i)=>'后文 '+i+'，保留当前页面位置。').join('\n\n');
  const code=Array.from({length:16},(_,i)=>'console.log('+i+');').join('\n');
  const scenarios=process.env.MOYU_LIST_VIEWPORT_CASE?[process.env.MOYU_LIST_VIEWPORT_CASE]:['middle','bottom'];
  const languages=process.env.MOYU_LIST_VIEWPORT_LANGUAGE?[process.env.MOYU_LIST_VIEWPORT_LANGUAGE]:['javascript','html','tabs'];
  for(const scenario of scenarios)for(const language of languages)for(const inside of [false,true]){
    const body=scenario==='bottom'?'':language==='tabs'?':::javascript 第一页\n'+code+'\n:::text 第二页\nsecond':code;
    const fence='```'+language+(scenario==='bottom'?' {id=0003}':' {height=260}')+'\n'+body+'\n```';
    const prefix=scenario==='bottom'?'1. sss\n2. 1\n3. <br />':'1. 列表内容';
    const middle=prefix+'\n\n'+(inside?fence.split('\n').map(row=>'   '+row).join('\n'):fence);
    const suffix=scenario==='bottom'?'1. <br />\n2. 3\n3. <br />\n4. <br />':trailing;
    const note=folder+'/'+scenario+'-'+language+'-'+inside+'.md',source=leading+'\n\n'+middle+'\n\n'+suffix;await native('create',note,'file',source);
    await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});await device.reload();
    await until("!!document.querySelector('.mobile-mode-tabs [role=tab]')");await tap('.mobile-mode-tabs [role=tab]',0,false);
    await until("!!document.querySelector('.milkdown-code-block')");
    if(language==='tabs'&&await evaluate("!!document.querySelector('.milkdown-code-block button[aria-label=显示源码]')"))await tap('.milkdown-code-block button[aria-label=显示源码]');
    await until("!!document.querySelector('.milkdown-code-block .cm-content')");await tap('.milkdown-code-block .cm-content');
    await until("document.documentElement.dataset.mobileKeyboard==='true'");await delay(500);
    if(scenario==='bottom')await evaluate("(()=>{const s=document.querySelector('.mobile-document');s.scrollTop=s.scrollHeight;return true;})()");
    else await evaluate("(()=>{const b=document.querySelector('.milkdown-code-block'),s=b.closest('.document-scroll');s.scrollTop+=b.getBoundingClientRect().top-s.getBoundingClientRect().top-100;return true;})()");await delay(300);
    const before=await position();const action=inside?'outdentBlock':'indentBlock';
    await tap('.mobile-formatbar [data-format-action='+action+']',0,false);await delay(700);
    const after=await position(),delta=after.top-before.top;results.push({scenario,language,inside,before,after,delta});console.log(JSON.stringify(results.at(-1)));
    assert.equal(after.keyboard,before.keyboard,'Moving code must preserve keyboard visibility');
    assert.equal((await native('read',note)).content,source,'Moving blocks must not bypass manual save');
    await fs.writeFile(path.join(output,scenario+'-'+language+'-'+inside+'.png'),device.screenshot());
  }
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2));
  assert.ok(results.every(result=>Math.abs(result.delta)<=2),'List movement changed visible position: '+output);
  console.log('Native list viewport: '+results.length+' passed. '+output);
}finally{
  try{if(created)await native('trash',folder);if(previous)await native('feature','preferences.set-many',{values:previous});}
  catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
