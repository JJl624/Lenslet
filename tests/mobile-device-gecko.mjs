import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {androidGeckoDevice} from './helpers/android-gecko-device.mjs';

const device=await androidGeckoDevice(),{evaluate,native,shell,tap,keyboard}=device;
const folder='gecko-qa-'+Date.now(),note=folder+'/note.md';let previous,created=false;
async function until(check,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await check())return;await delay(150);}throw Error('Condition did not become true.');}
const content='开头文字，用于输入测试。\n\n![图片|140](image.svg)\n\n普通 **粗体** 与 __下划线__。\n\n> [+] 折叠标题\n> 折叠内容。\n\n- 列表项\n  - 子列表\n\n| 第一列 | 第二列 |\n| --- | --- |\n| 单元格文字 | 另一个单元格 |\n\n```js {id=0001 height=160}\nconsole.log(1);\n```\n\n'+Array.from({length:35},(_,i)=>'末尾段落 '+i+'，验证长文的点击位置和输入法。').join('\n\n');
try{
  await device.ready();const ua=await device.initialize();assert.match(ua,/Gecko\//);assert.match(ua,/Firefox\//);assert.doesNotMatch(ua,/Chrome\//);
  assert.equal((await native('load')).root,'internal');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');created=true;
  await native('create',folder+'/image.svg','file','<svg xmlns="http://www.w3.org/2000/svg" width="180" height="100"><rect width="180" height="100" fill="orange"/></svg>');
  await native('create',note,'file',content);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-session-internal':JSON.stringify({tabs:[note],active:note})}});
  await device.reload();await device.initialize();
  await until(()=>evaluate("document.querySelector('[role=tab][aria-selected=true]')?.textContent==='阅读'"));assert.equal(keyboard(),false);
  await until(()=>evaluate("[...document.querySelectorAll('.reading-view img')].some(img=>img.complete&&img.naturalWidth>0)"));
  assert.equal(await evaluate("!!document.querySelector('.reading-view table')"),true);
  console.log('Gecko reading, image and table checks passed');
  await evaluate("[...document.querySelectorAll('[role=tab]')].find(button=>button.textContent==='编辑').click();true");
  await until(()=>evaluate("!!document.querySelector('.ProseMirror')&&!document.querySelector('[data-editor-pending=true]')"));assert.equal(keyboard(),false);
  console.log('Tapping text');
  await tap('.ProseMirror > p',0);await until(keyboard);
  assert.equal(await evaluate("!!document.activeElement.closest('.ProseMirror')"),true);
  shell('shell','input','text','GeckoInput');await delay(250);
  assert.equal((await native('read',note)).content,content,'Manual editing must not write the saved file');
  await until(()=>evaluate("document.querySelector('.ProseMirror').textContent.includes('GeckoInput')"));
  shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>!keyboard());
  console.log('Tapping image');
  await tap('.attachment-overlay img');await until(()=>evaluate("[...document.querySelectorAll('.visual-attachment .syntax-raw')].some(node=>node.contains(getSelection()?.anchorNode))"));
  await tap('.ProseMirror > p',0);await until(keyboard);shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>!keyboard());
  console.log('Tapping code');
  await tap('.milkdown-code-block .cm-content');await until(keyboard);await until(()=>evaluate("!!document.activeElement?.closest('.milkdown-code-block .cm-content')"));shell('shell','input','text','GeckoCode');await until(()=>evaluate("[...document.querySelectorAll('.cm-content')].some(node=>node.textContent.includes('GeckoCode'))"));
  shell('shell','input','keyevent','KEYCODE_BACK');await until(()=>!keyboard());
  console.log('Long selection');
  await device.hold('.milkdown-code-block .cm-line',650);await delay(250);assert.equal(keyboard(),false,'Long selection must not open the keyboard');
  await evaluate('getSelection()?.removeAllRanges();true');
  await evaluate("document.querySelector('[aria-label=保存文档]').click();true");
  await until(async()=>{const disk=await native('read',note);return disk.content.includes('GeckoInput')&&disk.content.includes('GeckoCode');});
  const disk=await native('read',note);assert.match(disk.content,/下划线/);assert.match(disk.content,/折叠标题/);assert.match(disk.content,/\| 第一列/);
  assert.equal(await evaluate("document.documentElement.dataset.mobileViewport==='native'"),true,'Both engines must use the shared native viewport');
  console.log('Gecko input, long selection and manual save checks passed');
  await tap('[aria-label="返回笔记"]');await until(()=>evaluate("!!document.querySelector('.mobile-vault-heading')"));
  assert.equal(await evaluate("!!document.querySelector('.mobile-bottom-nav')"),false);
  await tap('[aria-label="选择知识库"]');await until(()=>evaluate("!!document.querySelector('.mobile-vault-settings')"));
  assert.equal(await evaluate("document.querySelector('.mobile-actions > button:last-child').textContent"),'设置');
  await tap('.mobile-vault-settings');await until(()=>evaluate("!!document.querySelector('.mobile-settings')"));
  assert.equal(await evaluate("!!document.querySelector('[aria-label=显示动态图标文字]')"),true);assert.equal(keyboard(),false);
  await tap('[aria-label="返回笔记"]');await until(()=>evaluate("!!document.querySelector('.mobile-vault-heading')"));
  console.log('Gecko home, vault settings entry and back navigation checks passed');
  console.log(JSON.stringify({engine:ua,readImages:true,table:true,manualSave:true,keyboard:true,imageTap:true,codeEditing:true,sharedNativeViewport:true}));
}catch(error){console.error('Gecko device check failed:',error);throw error;}finally{
  try{if(previous)await native('feature','preferences.set-many',{values:previous});if(created)await native('trash',folder);}catch(error){console.error('Device fixture cleanup failed: /data/user/0/'+device.app+'/files/vault/'+folder,error.message);}finally{await device.close();}
}
