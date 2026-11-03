import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

const leading=Array.from({length:25},(_,i)=>`前文 ${i}，保留当前页面位置。`).join('\n\n');
const trailing=Array.from({length:25},(_,i)=>`后文 ${i}，保留当前页面位置。`).join('\n\n');
const code=Array.from({length:16},(_,i)=>`console.log(${i});`).join('\n');
async function start(page:Page,language:string,inside:boolean){
  await page.setViewportSize({width:393,height:480});
  const body=language==='tabs'?':::javascript 第一页\n'+code+'\n:::text 第二页\nsecond':code;
  const fence='```'+language+' {height=260}\n'+body+'\n```';
  const middle=inside?'1. 列表内容\n\n'+fence.split('\n').map(row=>'   '+row).join('\n'):'1. 列表内容\n\n'+fence;
  await mockAndroid(page,{files:{'note.md':{content:leading+'\n\n'+middle+'\n\n'+trailing}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-save-policy']='manual';});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const content=page.locator('.milkdown-code-block .cm-content');await content.tap();await page.keyboard.press('ControlOrMeta+End');
  await page.locator('.milkdown-code-block').evaluate(element=>{
    const scroll=element.closest('.document-scroll')!;
    scroll.scrollTop+=element.getBoundingClientRect().top-scroll.getBoundingClientRect().top-140;
  });
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
const position=(page:Page)=>page.locator('.milkdown-code-block').evaluate(element=>{
  const scroll=element.closest('.document-scroll')!;
  return {top:element.getBoundingClientRect().top-scroll.getBoundingClientRect().top,scroll:scroll.scrollTop,height:scroll.scrollHeight,client:scroll.clientHeight};
});

for(const language of ['javascript','html','tabs'])for(const inside of [false,true])test(`List movement preserves the visible code block position (${language}, ${inside?'outdent':'indent'})`,async({page})=>{
  await start(page,language,inside);
  const before=await position(page),action=inside?'脱离列表':'缩进至列表';
  await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:action,exact:true}).tap();
  await page.waitForTimeout(400);
  const after=await position(page);
  expect(Math.abs(after.top-before.top),JSON.stringify({before,after})).toBeLessThanOrEqual(2);
  await expect(page.locator('.milkdown-code-block .cm-content')).toBeFocused();
  await page.keyboard.insertText('7');await expect(page.locator('.milkdown-code-block .cm-content')).toContainText('console.log(15);7');
});

for(const language of ['text','html','tabs'])for(const nested of [false,true])for(const inside of [false,true])test(`Moving empty code at the document bottom keeps its position (${language}, ${nested?'nested':'root'}, ${inside?'outdent':'indent'})`,async({page})=>{
  await page.setViewportSize({width:393,height:480});
  const fence='```'+language+' {id=0003}\n```';
  const body='1. sss\n2. 1\n3. <br />\n\n'+(inside?fence.split('\n').map(row=>'   '+row).join('\n'):fence)+'\n\n1. <br />\n2. 3\n3. <br />\n4. <br />';
  const source=leading+'\n\n'+(nested?'- 外层\n\n'+body.split('\n').map(row=>'  '+row).join('\n'):body);
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-save-policy']='manual';});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  if(language==='tabs')await page.locator('.milkdown-code-block').getByRole('button',{name:'显示源码',exact:true}).tap();
  await page.locator('.milkdown-code-block .cm-content').tap();
  await page.locator('.mobile-document').evaluate(element=>element.scrollTop=element.scrollHeight);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const before=await position(page);
  for(const action of [inside?'脱离列表':'缩进至列表',inside?'缩进至列表':'脱离列表',inside?'脱离列表':'缩进至列表']){
    await page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name:action,exact:true}).tap();await page.waitForTimeout(400);
    const after=await position(page);expect(Math.abs(after.top-before.top),JSON.stringify({action,before,after})).toBeLessThanOrEqual(2);
    await expect(page.locator('.milkdown-code-block .cm-content')).toBeFocused();
  }
  for(const action of ['撤销','重做']){
    await page.getByRole('button',{name:action,exact:true}).tap();await page.waitForTimeout(400);
    const after=await position(page);expect(Math.abs(after.top-before.top),JSON.stringify({action,before,after})).toBeLessThanOrEqual(2);
  }
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(source);
});

for(const theme of ['light','dark'])test(`Reading resize handles stay visible and consistent (${theme})`,async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'```text\nordinary\n```\n\n```html\n<p>HTML</p>\n```\n\n```tabs\n:::text 第一页\nfirst\n:::text 第二页\nsecond\n```'}},engine:'gecko'});
  await page.addInitScript(theme=>{if(window!==window.top)return;(window as any).__mobileState.settings['moyu-mobile-theme']=theme;},theme);
  await page.goto('/mobile.html');
  const html=page.locator('.code-block-shell[data-html-source]');
  await expect(html).toHaveCount(1);await html.getByRole('tab',{name:'HTML 源码',exact:true}).tap();
  const handles=page.locator('.reading-code-resize');await expect(handles).toHaveCount(3);
  const styles=await handles.evaluateAll(handles=>handles.map(handle=>({bar:getComputedStyle(handle,'::after').backgroundColor,background:getComputedStyle(handle).backgroundColor,height:handle.getBoundingClientRect().height,position:getComputedStyle(handle).position})));
  const backgrounds=await handles.evaluateAll(handles=>handles.map(handle=>getComputedStyle(handle.closest('.code-block-shell')!).backgroundColor));
  for(const [index,style] of styles.entries()){
    expect(style.bar).not.toBe('rgba(0, 0, 0, 0)');expect(style.height).toBe(28);expect(style.position).toBe('relative');
    expect(backgrounds[index]).toBe(backgrounds[0]);expect(backgrounds[index]).not.toBe('rgba(0, 0, 0, 0)');
  }
  await page.screenshot({path:'../../work/v1049-reading-handles-'+theme+'.png',fullPage:true});
});
