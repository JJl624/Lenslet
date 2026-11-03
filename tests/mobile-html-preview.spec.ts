import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
import fs from 'node:fs';
import path from 'node:path';

const counter='<button id="count">0</button><script>document.querySelector("button").onclick=e=>e.target.textContent=Number(e.target.textContent)+1;</script>';
async function start(page:any,content:string,extra:Record<string,{content:string}>={}){
  await mockAndroid(page,{engine:'gecko',files:{'note.md':{content},...extra}});
  await page.addInitScript(()=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-save-policy']='manual';});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view')).toBeVisible();
}
test('Inline HTML is interactive in an isolated frame; preview itself does not edit or save the note',async({page})=>{
  await start(page,'```html\n'+counter+'\n```');await page.getByRole('tab',{name:'预览 HTML',exact:true}).click();
  const frame=page.frameLocator('.html-note-window iframe');await frame.locator('#count').click();await expect(frame.locator('#count')).toHaveText('1');
  expect(await frame.locator('body').evaluate(()=>({native:typeof (window as any).MoyuNative,parent:(()=>{try{return !!parent.document;}catch{return false;}})()}))).toEqual({native:'undefined',parent:false});
  await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);
  await page.getByRole('tab',{name:'HTML 源码',exact:true}).click();await expect(page.locator('.html-note-window iframe')).toHaveCount(0);
});
test('Pinning and changing height obey manual save and survive reopening without a sidecar',async({page})=>{
  await start(page,'```html\n'+counter+'\n```');await page.getByRole('tab',{name:'预览 HTML',exact:true}).click();await expect(page.frameLocator('.html-note-window iframe').locator('#count')).toBeVisible();
  await page.frameLocator('.html-note-window iframe').locator('#count').click();await page.getByRole('button',{name:'钉住 HTML 预览',exact:true}).click();await expect(page.getByRole('button',{name:'保存文档',exact:true})).toBeVisible();await expect(page.frameLocator('.html-note-window iframe').locator('#count')).toHaveText('1');
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).not.toContain('preview=pin');
  const handle=page.getByRole('separator',{name:'调整 HTML 预览高度',exact:true});await handle.focus();await page.keyboard.press('ArrowDown');await expect(handle).toHaveAttribute('aria-valuenow','290');
  await page.getByRole('button',{name:'保存文档',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toContain('previewHeight=290');
  expect(await page.evaluate(()=>Object.keys((window as any).__mobileState.files))).toEqual(['note.md']);
  await page.reload();await expect(page.getByRole('button',{name:'取消钉住 HTML 预览',exact:true})).toBeVisible();await expect(page.locator('.html-note-window')).toHaveCSS('height','290px');await expect(page.frameLocator('.html-note-window iframe').locator('#count')).toHaveText('0');
});
test('An HTML block can reference a file and its local script and stylesheet; an ordinary link stays a link',async({page})=>{
  await start(page,'[页面](widgets/demo.html)\n\n```html {preview=pin previewHeight=220}\nsrc="./widgets/demo.html"\n```',{
    'widgets/demo.html':{content:'<link rel="stylesheet" href="style.css"><button id="local">开始</button><script src="action.js"></script>'},
    'widgets/style.css':{content:'button{color:rgb(12,34,56)}'},'widgets/action.js':{content:'document.querySelector("button").onclick=e=>e.target.textContent="本地脚本";'},
  });
  const frame=page.frameLocator('.html-note-window iframe');await frame.locator('#local').click();await expect(frame.locator('#local')).toHaveText('本地脚本');await expect(frame.locator('#local')).toHaveCSS('color','rgb(12, 34, 56)');
  await expect(page.locator('.reading-view > p a')).toHaveAttribute('href','widgets/demo.html');await expect(page.locator('.html-note-window iframe')).toHaveCount(1);
});
test('Escaping the vault is rejected and refresh reads only the referenced files',async({page})=>{
  await start(page,'```html {preview=pin}\nsrc="../outside.html"\n```');await expect(page.locator('.html-note-error')).toContainText('知识库');
  expect(await page.evaluate(()=>(window as any).__mobileCalls.read||0)).toBe(1);
});
test('HTML preprocessing and its sandbox do not send remote asset or fetch requests',async({page})=>{
  const requests:string[]=[];await page.route('https://html-boundary.example/**',route=>{requests.push(route.request().url());return route.fulfill({body:'unexpected'});});
  await start(page,'```html {preview=pin}\n<p id="status">等待</p><script>fetch("https://html-boundary.example/data").catch(()=>document.querySelector("#status").textContent="已阻止");</script>\n```');
  await expect(page.frameLocator('.html-note-window iframe').locator('#status')).toHaveText('已阻止');expect(requests).toEqual([]);
  await page.evaluate(async()=>{const {htmlPreviewSource}=await import('/src/htmlPreviewSource.ts');await htmlPreviewSource('note.md','<img src="https://html-boundary.example/image.png">').catch(()=>{});});await page.waitForTimeout(200);expect(requests).toEqual([]);
});
test('Rich-edit pin controls preserve the input state and write actual Markdown attributes',async({page})=>{
  await start(page,'```html\n'+counter+'\n```');await page.getByRole('tab',{name:'编辑',exact:true}).click();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  await page.getByRole('tab',{name:'预览 HTML',exact:true}).click();await page.getByRole('button',{name:'钉住 HTML 预览',exact:true}).click();await expect(page.getByRole('button',{name:'取消钉住 HTML 预览',exact:true})).toBeVisible();
  await expect(page.locator('.milkdown-code-block .cm-editor')).toBeHidden();
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await page.getByRole('tab',{name:'源码',exact:true}).click();await expect(page.locator('.source-editor .cm-content')).toContainText('preview=pin');
});

test('HTML remains a reversible code language; its controls never start phone input',async({page})=>{
  const original='```text {id=00ab preview=pin previewHeight=220}\n'+counter+'\n```';
  await start(page,original);await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const block=page.locator('.milkdown-code-block'),language=block.locator('button.language-button');
  await language.tap();
  const menu=block.locator('.code-language-menu');await expect(menu).toBeVisible();
  await expect(menu.locator('input')).not.toBeFocused();
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await page.evaluate(()=>window.dispatchEvent(new Event('moyu-mobile-back')));await expect(menu).toHaveCount(0);await expect(page.getByRole('tab',{name:'编辑',exact:true})).toHaveAttribute('aria-selected','true');await language.tap();
  await menu.getByRole('option',{name:'HTML',exact:true}).tap();
  await expect(block).toHaveAttribute('data-html-code','true');await expect(language).toContainText('HTML');
  await expect(block.frameLocator('iframe').locator('#count')).toBeVisible();
  await expect(language).toBeHidden();await expect(block.locator('.code-attributes-input')).toBeHidden();await expect(block.locator('.copy-button')).toBeHidden();
  await expect(block.locator('.html-note-tools button')).toHaveCount(4);
  await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/v1039-html-controls.png')});
  for(const label of ['HTML 源码','预览 HTML','HTML 源码']){
    await block.getByRole('tab',{name:label,exact:true}).tap();
    expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  }
  await expect(language).toBeVisible();await expect(block.locator('.code-attributes-input')).toBeVisible();await expect(block.locator('.copy-button')).toBeVisible();await expect(block.getByRole('button',{name:'复制 HTML 源码',exact:true})).toHaveCount(0);
  await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/v1039-html-source.png')});
  await block.locator('.cm-content').tap();
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(true);
  await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();});
  await block.getByRole('tab',{name:'预览 HTML',exact:true}).tap();
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await block.getByRole('tab',{name:'HTML 源码',exact:true}).tap();
  await language.tap();await expect(menu).toBeVisible();await expect(menu.locator('input')).not.toBeFocused();
  await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/v1039-html-language-menu.png')});
  await menu.getByRole('option',{name:'JavaScript',exact:true}).tap();
  await expect(block).not.toHaveAttribute('data-html-source');await expect(block.locator('.html-preview-ui')).toHaveCount(0);
  await expect(block.locator('.cm-content')).toHaveText(counter);await expect(language).toContainText('JavaScript');
  await expect(block.locator('.code-id')).toHaveText('00ab');
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(original);
  await page.getByRole('tab',{name:'源码',exact:true}).tap();
  await expect(page.locator('.source-editor .cm-content')).toContainText('JavaScript');await expect(page.locator('.source-editor .cm-content')).toContainText('preview=pin');
});

for(const mode of ['阅读','编辑'])test(`HTML source and preview replace each other with one aligned toolbar (${mode})`,async({page})=>{
  await start(page,'```html {preview=pin previewHeight=220}\n'+counter+'\n```');
  if(mode==='编辑')await page.getByRole('tab',{name:mode,exact:true}).tap();
  const panel=page.locator('.html-note-preview'),block=panel.locator('xpath=../..');
  await expect(panel.frameLocator('iframe').locator('#count')).toBeVisible();
  const before=await block.boundingBox(),bar=await panel.locator('.html-note-tools').boundingBox();
  expect(Math.abs(bar!.y-before!.y)).toBeLessThanOrEqual(2);
  const code=mode==='阅读'?block.locator('pre'):block.locator('.cm-editor');
  await expect(code).toBeHidden();
  await panel.getByRole('tab',{name:'HTML 源码',exact:true}).tap();
  await expect(code).toBeVisible();await expect(panel.locator('iframe')).toHaveCount(0);
  await panel.getByRole('tab',{name:'预览 HTML',exact:true}).tap();
  await expect(code).toBeHidden();await expect(panel.frameLocator('iframe').locator('#count')).toBeVisible();
  const refresh=panel.getByRole('button',{name:'刷新 HTML 预览',exact:true});
  await refresh.tap();await expect(refresh).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await expect(panel.getByRole('button',{name:'取消钉住 HTML 预览',exact:true})).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);
});

for(const mode of ['阅读','编辑'])test(`The HTML view switch keeps its position and size across views at phone widths (${mode})`,async({page})=>{
  await start(page,'```html {preview=pin previewHeight=220}\n'+counter+'\n```');
  if(mode==='编辑')await page.getByRole('tab',{name:mode,exact:true}).tap();
  const block=page.locator(mode==='编辑'?'.milkdown-code-block':'.code-block-shell'),tabs=block.getByRole('tablist',{name:'HTML 视图',exact:true});
  const geometry=()=>tabs.evaluate(element=>{const owner=element.closest('.milkdown-code-block,.code-block-shell')!.getBoundingClientRect(),box=element.getBoundingClientRect();return{x:box.x-owner.x,y:box.y-owner.y,width:box.width,height:box.height,right:owner.right-box.right};});
  for(const width of [320,393,740]){
    await page.setViewportSize({width,height:851});
    const reference=await geometry();
    for(const label of ['HTML 源码','预览 HTML','HTML 源码','预览 HTML']){
      await block.getByRole('tab',{name:label,exact:true}).tap();
      await expect.poll(async()=>{const current=await geometry();return Math.max(...(['x','y','width','height','right'] as const).map(key=>Math.abs(current[key]-reference[key])));}).toBeLessThanOrEqual(.75);
      expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
    }
    expect(await block.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  }
});
test('Desktop-pinned HTML results open on Android without a code runtime and retain the desktop result record',async({page})=>{
  const metadata='note.assets/results/001a/results.json';
  await start(page,'```js {id=001a}\nconsole.log("original code");\n```',{
    [metadata]:{content:JSON.stringify({items:[{index:0,file:'0.html',height:220,language:'js',code:'console.log("original code");'}]})},
    'note.assets/results/001a/0.html':{content:counter},
  });
  const frame=page.frameLocator('.html-note-window iframe');await frame.locator('#count').click();await expect(frame.locator('#count')).toHaveText('1');
  expect(await page.evaluate(()=>(window as any).__mobileCalls['code.run']||0)).toBe(0);
  await page.getByRole('separator',{name:'调整 HTML 预览高度',exact:true}).focus();await page.keyboard.press('ArrowDown');
  await expect.poll(()=>page.evaluate(metadata=>JSON.parse((window as any).__mobileState.files[metadata].content).items[0].height,metadata)).toBe(230);
  await page.getByRole('button',{name:'取消钉住 HTML 预览',exact:true}).click();await expect(page.locator('.html-note-window')).toHaveCount(0);
  expect(await page.evaluate(metadata=>!!(window as any).__mobileState.files[metadata],metadata)).toBe(false);await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);
});
test('Consolidated desktop results override legacy records; Android resize and unpin preserve ownership, counters and other blocks',async({page})=>{
  const metadata='note.assets/document.json',pin={index:0,file:'0.html',height:220,language:'js',code:'old'},owner={version:2,document:'note.md',nextId:40,blocks:['001a','001b'],results:{'001a':{items:[pin]},'001b':{items:[{...pin,height:330}]}}};
  await start(page,'```js {id=001a}\noriginal\n```',{
    [metadata]:{content:JSON.stringify(owner)},
    'note.assets/results/001a/results.json':{content:JSON.stringify({items:[{...pin,height:500}]})},
    'note.assets/results/001a/0.html':{content:counter},'note.assets/results/001b/0.html':{content:counter},
  });
  await expect(page.locator('.html-note-window')).toHaveCount(1);await expect(page.locator('.html-note-window')).toHaveCSS('height','220px');
  await page.getByRole('separator',{name:'调整 HTML 预览高度',exact:true}).focus();await page.keyboard.press('ArrowDown');
  await expect.poll(()=>page.evaluate(metadata=>JSON.parse((window as any).__mobileState.files[metadata].content).results['001a'].items[0].height,metadata)).toBe(230);
  await page.getByRole('button',{name:'取消钉住 HTML 预览',exact:true}).click();await expect(page.locator('.html-note-window')).toHaveCount(0);
  const saved=await page.evaluate(metadata=>JSON.parse((window as any).__mobileState.files[metadata].content),metadata);
  expect(saved).toEqual({...owner,results:{...owner.results,'001a':{items:[]}}});
  expect(await page.evaluate(()=>!!(window as any).__mobileState.files['note.assets/results/001a/0.html'])).toBe(false);
  expect(await page.evaluate(()=>!!(window as any).__mobileState.files['note.assets/results/001b/0.html'])).toBe(true);
  await page.reload();await expect(page.locator('.reading-view')).toBeVisible();await expect(page.locator('.html-note-window')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'保存文档',exact:true})).toHaveCount(0);
});
test('HTML height requires a held touch; ordinary scrolling cannot resize or save it',async({page,context})=>{
  await start(page,'```html {preview=pin previewHeight=180}\n'+counter+'\n```\n\n'+Array.from({length:30},(_,index)=>'段落 '+index).join('\n\n'));
  const handle=page.getByRole('separator',{name:'调整 HTML 预览高度',exact:true}),cdp=await context.newCDPSession(page);
  try{
    await handle.scrollIntoViewIfNeeded();let box=(await handle.boundingBox())!;const x=box.x+box.width/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:box.y+5}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:box.y+35}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(handle).toHaveAttribute('aria-valuenow','180');
    await handle.scrollIntoViewIfNeeded();box=(await handle.boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:box.y+5}]});await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:box.y+45}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(handle).toHaveAttribute('aria-valuenow','220');
    expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toContain('previewHeight=180');expect(await page.evaluate(()=>(window as any).__mobileState.keyboardVisible)).toBe(false);
  }finally{await cdp.detach();}
});
test('The binary-tree chapter demonstrates all four correct traversal orders on a narrow phone',async({page})=>{
  const root=path.resolve(import.meta.dirname,'../resources/workspace-guide/数据结构'),base='二叉树遍历.assets/attachments/tree';
  const files=Object.fromEntries(fs.readdirSync(path.join(root,base)).map(name=>[base+'/'+name,{content:fs.readFileSync(path.join(root,base,name),'utf8')}]));
  await page.setViewportSize({width:320,height:720});await start(page,fs.readFileSync(path.join(root,'二叉树遍历.md'),'utf8'),files);
  await expect(page.locator('.html-note-preview')).toHaveCount(4);
  for(let index=0;index<4;index++){
    const panel=page.locator('.html-note-preview').nth(index);await panel.scrollIntoViewIfNeeded();const frame=panel.frameLocator('iframe');
    await expect(frame.locator('#next')).toBeVisible();const first=await frame.locator('#explanation').textContent();await frame.locator('#next').click();await expect(frame.locator('#explanation')).not.toHaveText(first!);
    expect(await frame.locator('html').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    expect(await frame.locator('.controls').evaluate(element=>element.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
    while(!await frame.locator('#next').isDisabled())await frame.locator('#next').click();
    expect(await frame.locator('#output').textContent()).toBe(['ABDECFG','DBEAFCG','DEBFGCA','ABCDEFG'][index]);
    await expect(frame.locator('.node.visited')).toHaveCount(7);
    await frame.locator('#reset').click();await expect(frame.locator('#progress')).toHaveText(/^1 \/ /);
    expect(await panel.evaluate(element=>element.getBoundingClientRect().height)).toBeLessThanOrEqual(400);
  }
  await page.locator('.html-note-preview').first().scrollIntoViewIfNeeded();await expect(page.locator('.html-note-preview').first().frameLocator('iframe').locator('#progress')).toHaveText(/^1 \/ /);await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/android-binary-tree.png')});
});
