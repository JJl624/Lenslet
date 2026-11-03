import {expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {androidDevice} from './helpers/android-device.mjs';
const device=await androidDevice(),{page,native,tap,hold,keyboard,shell}=device;
const folder='navigation-qa-'+Date.now(),a=folder+'/a.md',b=folder+'/b.md',c=folder+'/c.md';
const content=Array.from({length:50},(_,i)=>'段落标记'+String(i).padStart(3,'0')+'，检查视图位置。').join('\n\n')+'\n\n```js {id=0001 height=160}\n'+Array.from({length:30},(_,i)=>'console.log('+i+');').join('\n')+'\n```\n\n[打开 B](b.md)\n\n结束';
let previous;
try{
  if((await native('load')).root!=='internal')throw Error('Use the debug internal vault.');previous=await native('feature','preferences.get');
  await native('create',folder,'folder','');for(const [file,text] of [[a,content],[b,'文档 B'],[c,'文档 C']])await native('create',file,'file',text);
  await native('feature','preferences.set-many',{values:{'moyu-save-policy':'manual','moyu-mobile-size':'17','moyu-session-internal':JSON.stringify({tabs:[a,b,c],active:a})}});
  await page.reload();await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');
  const config=await native('feature','mobile.touch-settings');expect(config.longPressTimeout).toBeGreaterThan(0);console.log('System touch settings:',JSON.stringify(config));
  await page.locator('.reading-view p').filter({hasText:'段落标记030'}).evaluate(element=>element.scrollIntoView({block:'start'}));
  for(const name of ['编辑','源码','阅读']){
    await tap(page.getByRole('tab',{name,exact:true}));await expect(page.locator('.mobile-document [data-editor-pending=true]')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>{const scope=document.querySelector('.mobile-document'),box=scope.getBoundingClientRect();return[...scope.querySelectorAll('.ProseMirror p,.reading-view p,.cm-line')].some(node=>node.textContent?.includes('段落标记030')&&node.getBoundingClientRect().top>box.top-45&&node.getBoundingClientRect().top<box.top+100);})).toBe(true);expect(keyboard()).toBe(false);
  }
  console.log('PASS: mode switching preserves visible content with closed IME.');
  await tap(page.getByRole('tab',{name:'编辑',exact:true}));const code=page.locator('.milkdown-code-block'),handle=code.getByRole('separator',{name:'拖动调整代码块高度'});
  await handle.evaluate(element=>element.scrollIntoView({block:'center'}));const top=await page.locator('.mobile-document').evaluate(element=>element.scrollTop);
  await hold(handle,config.longPressTimeout+150);await expect(handle).not.toHaveClass(/resize-ready/);expect(keyboard()).toBe(false);expect(Math.abs(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)-top)).toBeLessThan(3);
  await hold(code.locator('.cm-line').nth(2),config.longPressTimeout+200,{x:85,y:10});await page.waitForTimeout(250);
  expect(Math.abs(await page.locator('.mobile-document').evaluate(element=>element.scrollTop)-top)).toBeLessThan(40);expect(keyboard()).toBe(false);
  console.log('PASS: native long holds on the resize grip and code keep the viewport and closed IME.');
  await tap(code.locator('.cm-content'),{x:100,y:20});await expect.poll(keyboard).toBe(true);const undo=page.getByRole('button',{name:'撤销',exact:true}),before=(await undo.boundingBox()).x;
  await page.keyboard.insertText('/* QA */');await expect(page.getByRole('button',{name:'保存文档',exact:true})).toBeVisible();expect((await undo.boundingBox()).x).toBe(before);await tap(page.getByRole('button',{name:'撤销',exact:true}));await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);expect((await undo.boundingBox()).x).toBe(before);
  shell('shell','input','keyevent','KEYCODE_BACK');await expect.poll(keyboard).toBe(false);
  const link=page.locator('.editor-host a[href="b.md"]');await hold(link,config.longPressTimeout+200);await expect(page.locator('.mobile-document-title strong')).toHaveText('b');expect(keyboard()).toBe(false);
  await tap(page.getByRole('button',{name:'文档操作',exact:true}));await tap(page.getByRole('button',{name:'关闭文档',exact:true}));await expect(page.locator('.mobile-document-title strong')).toHaveText('a');
  await tap(page.getByRole('button',{name:'文档操作',exact:true}));await tap(page.getByRole('button',{name:'关闭文档',exact:true}));await expect(page.locator('.mobile-document-title strong')).toHaveText('c');
  expect((await native('read',a)).content).toBe(content);console.log('PASS: fixed save slot, native link hold, stack close order and unchanged manual files.');
  await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/android-navigation-v1024.png'),device.screenshot());
}finally{
  if(previous)await native('feature','preferences.set-many',{values:{'moyu-save-policy':previous['moyu-save-policy']||'realtime','moyu-mobile-size':previous['moyu-mobile-size']||'17','moyu-session-internal':previous['moyu-session-internal']||'null'}}).catch(()=>{});
  for(const file of [a,b,c])await native('feature','mobile.draft-clear',{path:file}).catch(()=>{});await native('trash',folder).catch(()=>{});await device.close();
}
