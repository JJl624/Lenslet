import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';
const device=await androidGeckoDevice(),{evaluate,native,tap,keyboard}=device;
const folder='html-qa-'+Date.now(),note=folder+'/note.md';let previous,created=false;
async function until(check){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await check())return;await delay(150);}throw Error('HTML device check timed out.');}
const html='<button style="width:130px;height:36px" onclick="parent.postMessage({type:\'html-qa\',value:++count},\'*\')">建立节点</button><script>let count=0;</script>';
const content='```html\n'+html+'\n```';
try{
  await device.ready();await device.initialize();const workspace=await native('load');assert.equal(workspace.root,'internal');assert.match(JSON.stringify(workspace.tree),/二叉树遍历\.md/);previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await device.reload();await device.initialize();
  await until(()=>evaluate("!!document.querySelector('[aria-label=\"预览 HTML\"]')"));await tap('[aria-label="预览 HTML"]');
  await until(()=>evaluate("!!document.querySelector('.html-note-window iframe')?.srcdoc.includes('建立节点')"));
  await evaluate("window.addEventListener('message',event=>{if(event.data?.type==='html-qa')window.__htmlCount=event.data.value;});true");
  await tap('.html-note-window iframe');await until(()=>evaluate('window.__htmlCount===1'));assert.equal(keyboard(),false);
  await tap('[aria-label="钉住 HTML 预览"]');await until(()=>evaluate("!!document.querySelector('[aria-label=保存文档]')"));assert.equal((await native('read',note)).content,content);
  await tap('[aria-label="保存文档"]');await until(async()=>/preview=pin/.test((await native('read',note)).content));
  assert.ok(await evaluate("Math.abs(document.querySelector('.html-note-tools').getBoundingClientRect().top-document.querySelector('.code-block-shell').getBoundingClientRect().top)<=2"));
  await tap('[aria-label="HTML 源码"]');await until(()=>evaluate("!document.querySelector('.html-note-window iframe')&&document.querySelector('.code-block-shell > pre').getBoundingClientRect().height>0"));
  await tap('[aria-label="预览 HTML"]');await until(()=>evaluate("!!document.querySelector('.html-note-window iframe')&&document.querySelector('.code-block-shell > pre').getBoundingClientRect().height===0"));
  console.log('Gecko HTML frame interaction, manual pin save and bundled binary-tree guide passed');
  for(const name of ['note.assets','note.assets/results','note.assets/results/0002'])await native('create',folder+'/'+name,'folder','');
  const metadata=folder+'/note.assets/results/0002/results.json',result=folder+'/note.assets/results/0002/0.html';
  await native('create',result,'file',html);await native('create',metadata,'file',JSON.stringify({items:[{index:0,file:'0.html',height:220,language:'js',code:'original'}]}));
  const updated=await native('feature','mobile.html-result-update',{root:'internal',metadata,index:0,height:270});assert.deepEqual(updated,{pinned:true,height:270});
  const record=JSON.parse((await native('read',metadata)).content);assert.equal(record.items[0].code,'original');assert.equal(record.items[0].height,270);
  await assert.rejects(()=>native('feature','mobile.html-result-update',{root:'internal',metadata,index:20,height:270}));
  await native('feature','mobile.html-result-update',{root:'internal',metadata,index:0,pinned:false});assert.equal(await native('feature','file.exists',{path:metadata}),false);assert.equal(await native('feature','file.exists',{path:result}),false);
  console.log('Native desktop-result height persistence, invalid index rejection and unpin cleanup passed');
}catch(error){console.error('HTML device check failed:',error);throw error;}finally{
  try{if(previous)await native('feature','preferences.set-many',{values:previous});if(created)await native('trash',folder);}catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}finally{await device.close();}
}
