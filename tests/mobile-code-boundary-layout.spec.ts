import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Narrow code headers keep language and controls readable without overlap',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'```tabs {id=0001}\n:::text 第一页\n1\n```\n\n```javascript\n1\n```\n\n```html\n<p>1</p>\n```'}},engine:'gecko'});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  for(const code of await page.locator('.milkdown-code-block').all())for(const width of [284,220,160]){
    await code.evaluate((el,width)=>{el.style.width=width+'px';el.style.boxSizing='border-box';},width);
    if(await code.locator('.tabs-frame').count())await code.getByRole('button',{name:'显示源码',exact:true}).tap();
    if(await code.getByRole('tab',{name:'HTML 源码',exact:true}).count())await code.getByRole('tab',{name:'HTML 源码',exact:true}).tap();
    await code.locator('.cm-content').tap();
    const tools=code.locator('.tools');
    expect(await tools.locator('.language-button').evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');
    const bounds=await tools.boundingBox();
    const boxes=await tools.evaluate(el=>[...el.children].filter(child=>getComputedStyle(child).display!=='none'&&!child.classList.contains('language-picker')).map(child=>{const b=child.getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
    for(let a=0;a<boxes.length;a++){
      expect(boxes[a].x).toBeGreaterThanOrEqual(bounds!.x-1);expect(boxes[a].right).toBeLessThanOrEqual(bounds!.x+bounds!.width+1);
      for(let b=a+1;b<boxes.length;b++)expect(Math.min(boxes[a].right,boxes[b].right)-Math.max(boxes[a].x,boxes[b].x)>1&&Math.min(boxes[a].bottom,boxes[b].bottom)-Math.max(boxes[a].y,boxes[b].y)>1).toBe(false);
    }
    if(width===284)await code.screenshot({path:'../../work/v1047-narrow-'+(await code.getAttribute('data-tabbed-code')?'tabs':'code')+'.png'});
    if(await code.locator('.tabs-frame').count())await code.getByRole('button',{name:'显示标签页',exact:true}).tap();
  }
});

for(const language of ['text','html','tabs'])test(`Empty code fences remain code across editing, reading, saving and reloading (${language})`,async({page})=>{
  const source='1. sss\n2. 1\n3. <br />\n\n   ```'+language+' {id=0003}\n   ```\n\n   <br />\n\n4. 3';
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await expect(page.locator('.reading-view')).not.toContainText('<br />');await expect(page.locator('.reading-view')).not.toContainText('```');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.milkdown-code-block')).toHaveCount(1);
  const first=page.locator('.ProseMirror .list-item p').first();await first.tap();await page.keyboard.press('End');await page.keyboard.insertText('7');
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();
  await page.getByRole('tab',{name:'阅读',exact:true}).tap();await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await expect(page.locator('.reading-view')).not.toContainText('<br />');await expect(page.locator('.reading-view')).not.toContainText('```');
  await page.reload();await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.milkdown-code-block')).toHaveCount(1);
});

for(const action of ['删除撤销','入列表','脱离列表'])for(const language of ['text','html','tabs'])test(`Empty fences survive structural changes without becoming literal Markdown (${action}, ${language})`,async({page})=>{
  const fence='```'+language+' {id=0003}\n```',nested=action!=='入列表';
  const source='1. 项目\n\n'+(nested?fence.split('\n').map(line=>'   '+line).join('\n'):fence)+'\n\n尾文';
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const code=page.locator('.milkdown-code-block');await expect(code).toHaveCount(1);
  if(language==='tabs')await code.getByRole('button',{name:'显示源码',exact:true}).tap();
  await code.locator('.cm-content').tap();
  if(action==='删除撤销'){
    await page.keyboard.press('Backspace');await expect(code).toHaveCount(0);
    await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(code).toHaveCount(1);
    await page.keyboard.insertText('7');await page.keyboard.press('Backspace');
  }else await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:action==='入列表'?'缩进至列表':'脱离列表',exact:true}).tap();
  await page.getByRole('tab',{name:'阅读',exact:true}).tap();await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await expect(page.locator('.reading-view')).not.toContainText('<br />');await expect(page.locator('.reading-view')).not.toContainText('```');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(code).toHaveCount(1);
  const tail=page.locator('.ProseMirror > p').filter({hasText:/^尾文$/});await tail.tap();await page.keyboard.press('End');await page.keyboard.insertText('7');
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();
  await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);await expect(page.locator('.reading-view')).not.toContainText('```');
});

for(const label of ['代码块','标签页'])test(`Creating empty ${label} in an empty ordered item retains its block structure`,async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'1. sss\n2. 1\n3. <br />\n4. 3\n5. 3'}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await page.locator('.ProseMirror .list-item').nth(2).locator('p').tap();
  await page.getByRole('button',{name:'全部格式',exact:true}).tap();await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).tap();
  const code=page.locator('.milkdown-code-block');await expect(code).toHaveCount(1);
  await page.getByRole('tab',{name:'阅读',exact:true}).tap();await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await expect(page.locator('.reading-view')).not.toContainText('```');await expect(page.locator('.reading-view')).not.toContainText('<br />');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(code).toHaveCount(1);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();
  await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
});

for(const kind of ['html','escaped','split-escaped'])test(`Previously generated empty code is readable without exposing its fence as text (${kind})`,async({page})=>{
  const body=kind==='split-escaped'?'<br />\n\n```text {id=0003}\n```\n\n<br />':'<br />\n```text {id=0003}\n```\n<br />';
  const marker=(kind==='html'?body:body.replaceAll('<','\\<').replaceAll('`','\\`')).split('\n');
  const source='1. sss\n2. 1\n3. '+marker[0]+'\n'+marker.slice(1).map(row=>'   '+row).join('\n')+'\n4. 3';
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view .code-block-shell')).toHaveCount(1);
  await expect(page.locator('.reading-view')).not.toContainText('<br />');await expect(page.locator('.reading-view')).not.toContainText('```');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.milkdown-code-block')).toHaveCount(1);
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(source);
});
