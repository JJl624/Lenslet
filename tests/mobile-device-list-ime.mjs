import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,shell,tap,keyboard}=device;
// Opt in only after inspecting this Baidu layout on a 1080×2400 handset.
// No IME is replaced and no second InputConnection is created by this test.
const baidu=process.env.MOYU_SOFT_KEYBOARD_PROFILE==='baidu-mi-1080x2400';
const press=(x,y)=>shell('shell','input','tap',String(x),String(y));
function star(){if(baidu)shell('shell','input','swipe','750','1930','750','1930','650');else shell('shell','input','keyevent','KEYCODE_STAR');}
const folder='list-ime-'+Date.now(),note=folder+'/note.md';let previous,created=false;
const content=Array.from({length:3},(_,i)=>`${i+1}. Item ${i+1}\n\n   \`\`\`text\n   11\n   \`\`\``).join('\n\n')+'\n\n```html\n<p>HTML source</p>\n```';
async function until(check){const end=Date.now()+30000;while(Date.now()<end){if(await check())return;await delay(150);}throw Error('Native list/IME check timed out.');}
async function frame(){await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');}
async function afterCode(index){
  await evaluate(`document.querySelector('button[aria-label="全部格式"]').click();true`);
  await until(()=>evaluate("!!document.querySelector('dialog[aria-label=全部格式]')"));
  await evaluate("[...document.querySelector('dialog[aria-label=全部格式]').querySelectorAll('button')].find(button=>button.textContent.trim()==='换行').click();true");
  await until(()=>evaluate(`document.querySelectorAll('.milkdown-code-block')[${index}].nextElementSibling?.matches('p')===true`));
}
try{
  await device.ready();previous=await native('feature','preferences.get');await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  if(baidu){assert.match(shell('shell','settings','get','secure','default_input_method'),/com\.baidu\.input_mi/);assert.match(shell('shell','wm','size'),/1080x2400/);}
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-mobile-theme':'light','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await device.reload();await evaluate("[...document.querySelectorAll('.mobile-mode-tabs button')].find(button=>button.textContent==='编辑').click();true");
  await until(()=>evaluate("document.querySelectorAll('.milkdown-code-block').length===4"));await frame();
  await until(()=>evaluate("[...document.querySelectorAll('.milkdown-code-block')].every(block=>block.querySelector('.code-resize'))"));
  const resize=await evaluate("[...document.querySelectorAll('.milkdown-code-block')].map(block=>{const bar=block.querySelector('.code-resize');if(!bar)return null;const thumb=getComputedStyle(bar,'::after');return{width:bar.getBoundingClientRect().width,height:bar.getBoundingClientRect().height,color:thumb.backgroundColor,thumbHeight:thumb.height,background:getComputedStyle(bar).backgroundColor};})");
  console.log('Gecko resize bars:',JSON.stringify(resize));assert.ok(resize[0]&&resize[3]);assert.deepEqual(resize[3],resize[0]);
  await fs.writeFile(path.resolve('../../work/v1041-gecko-resize-light.png'),device.screenshot());
  for(const index of [0,1,2]){
    const code='.milkdown-code-block .cm-content';await tap(code,index);await until(keyboard);
    if(index>0){await afterCode(index);await tap(code,index);}
    if(index===2&&baidu){press(225,1930);press(645,1930);press(815,1765);await frame();}
    const point=await evaluate(`(async()=>{const code=document.querySelectorAll('.milkdown-code-block')[${index}],target=${index>0?"code.nextElementSibling":"code.querySelector('.code-resize')"};target.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const box=code.getBoundingClientRect(),rect=target.getBoundingClientRect();return{x:${index>0?'rect.left+12':'box.left+12'},y:rect.top+rect.height/2};})()`);
    await device.tapAt(point.x,point.y);await frame();
    console.log('Before IME '+index,JSON.stringify(await evaluate(`(()=>{const code=document.querySelectorAll('.milkdown-code-block')[${index}],p=code.nextElementSibling,n=getSelection()?.anchorNode;return{code:code.getBoundingClientRect().toJSON(),paragraph:p?.getBoundingClientRect().toJSON(),active:document.activeElement?.className,anchor:n?.nodeName,parent:n?.parentElement?.className};})()`)));
    const before=await evaluate(`document.querySelectorAll('.milkdown-code-block')[${index}].querySelector('.cm-content').textContent`);
    star();await frame();
    await until(()=>evaluate(`(()=>{const code=document.querySelectorAll('.milkdown-code-block')[${index}];return code.nextElementSibling?.textContent.includes('*')||code.querySelector('.cm-content').textContent.includes('*');})()`));
    const state=await evaluate(`(()=>{const code=document.querySelectorAll('.milkdown-code-block')[${index}],p=code.nextElementSibling,anchor=getSelection()?.anchorNode;return{code:code.querySelector('.cm-content').textContent,paragraph:p?.textContent,codeBottom:code.getBoundingClientRect().bottom,paragraphTop:p?.getBoundingClientRect().top,caretInParagraph:!!anchor&&p?.contains(anchor),active:document.activeElement?.className};})()`);
    console.log('After IME '+index,JSON.stringify(state));
    await fs.writeFile(path.resolve('../../work/v1041-gecko-list-ime-'+index+'.png'),device.screenshot());
    assert.equal(state.paragraph,'*','The first star belongs to the paragraph below the code');assert.equal(state.code,before,'Paragraph input must not edit the code');assert.ok(state.paragraphTop>=state.codeBottom-1,'The paragraph overlaps the code');assert.equal(state.caretInParagraph,true,'The native caret must stay in the visible paragraph');
    if(index===0&&baidu){press(540,2260);press(225,1930);press(645,1930);press(815,1765);press(75,1615);await until(()=>evaluate("[...document.querySelectorAll('.list-item p')].some(p=>p.textContent==='是')"));}
  }
  assert.equal((await native('read',note)).content,content);console.log('PASS: '+(baidu?'Baidu soft keyboard punctuation, pending pinyin, candidate selection':'Android key input')+' after gap and existing list paragraphs, without overlapping code or saving.');
}finally{
  try{if(previous)await native('feature','preferences.set-many',{values:previous});if(created)await native('trash',folder);}catch(error){console.error('Device cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}
  finally{await device.close();}
}
