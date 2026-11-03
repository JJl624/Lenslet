import {test,expect,type Page} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

const labels=(page:Page)=>page.locator('.ProseMirror .label-wrapper .ordered');
const context=(page:Page,name:string)=>page.getByRole('toolbar',{name:'文本格式'}).getByRole('button',{name,exact:true}).tap();
async function start(page:Page,source:string){
  await mockAndroid(page,{files:{'note.md':{content:source}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
}
const raw=(start=1,lower=1)=>`${start}. 上方甲\n${start+1}. 上方乙\n\n\`\`\`text\n11\n\`\`\`\n\n${lower}. 下方甲\n${lower+1}. 下方乙`;

for(const first of [0,1,5,99])for(const nested of first===1||first===5?[false,true]:[false])test(`Moving the intervening code joins list numbering immediately, before touching the lower list (${first}, ${nested?'nested':'root'})`,async({page})=>{
  const source=nested?'- 外层\n\n'+raw(first).split('\n').map(line=>'  '+line).join('\n'):raw(first);
  await start(page,source);const sequence=[first,first+1,first+2,first+3].map(n=>n+'.');
  const code=page.locator('.milkdown-code-block');await code.locator('.cm-content').tap();await context(page,'缩进至列表');
  await expect(labels(page)).toHaveText(sequence);await expect(page.locator('.ProseMirror ol')).toHaveCount(1);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(labels(page)).toHaveText([first+'.',first+1+'.','1.','2.']);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(labels(page)).toHaveText(sequence);
  await context(page,'脱离列表');await expect(labels(page)).toHaveText([first+'.',first+1+'.','1.','2.']);await expect(page.locator('.ProseMirror ol').last()).not.toHaveAttribute('start');
  await context(page,'缩进至列表');await expect(labels(page)).toHaveText(sequence);await expect(page.locator('.ProseMirror ol')).toHaveCount(1);
  const lower=page.locator('.ProseMirror p').filter({hasText:/^下方甲$/});await lower.tap();await page.keyboard.press('End');await page.keyboard.press('Backspace');await expect(labels(page)).toHaveText(sequence);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(labels(page)).toHaveText(sequence);
  await page.getByRole('button',{name:'保存文档',exact:true}).tap();await page.reload();await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(labels(page)).toHaveText(sequence);
});

test('A lower list keeps its custom start until the intervening block is moved into the upper list',async({page})=>{
  await start(page,raw(5,20));await page.locator('.milkdown-code-block .cm-content').tap();await context(page,'缩进至列表');
  await expect(labels(page)).toHaveText(['5.','6.','7.','8.']);await expect(page.locator('.ProseMirror ol')).toHaveCount(1);
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(labels(page)).toHaveText(['5.','6.','20.','21.']);
});

test('Bullet lists join around code while task states and marker types survive history',async({page})=>{
  await start(page,'- 上方甲\n- 上方乙\n\n```text\n11\n```\n\n- [x] 完成\n- [ ] 未完成');
  await page.locator('.milkdown-code-block .cm-content').tap();await context(page,'缩进至列表');
  await expect(page.locator('.ProseMirror > ul')).toHaveCount(1);await expect(labels(page)).toHaveCount(0);
  await expect(page.getByRole('checkbox',{name:'完成列表任务'})).toHaveCount(2);await expect(page.getByRole('checkbox',{name:'完成列表任务'}).first()).toHaveAttribute('aria-checked','true');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(page.locator('.ProseMirror > ul')).toHaveCount(2);
  await page.getByRole('button',{name:'重做',exact:true}).tap();await expect(page.locator('.ProseMirror > ul')).toHaveCount(1);await expect(page.getByRole('checkbox',{name:'完成列表任务'}).last()).toHaveAttribute('aria-checked','false');
});

test('Splitting a list renumbers its right-hand fragment without waiting for another edit',async({page})=>{
  await start(page,'1. 上方甲\n2. 上方乙\n\n   ```text\n   11\n   ```\n\n3. 下方甲\n4. 下方乙');
  const code=page.locator('.milkdown-code-block');await code.locator('.cm-content').tap();
  for(let repeat=0;repeat<2;repeat++){
    await context(page,'脱离列表');await expect(labels(page)).toHaveText(['1.','2.','1.','2.']);
    await context(page,'缩进至列表');await expect(labels(page)).toHaveText(['1.','2.','3.','4.']);
  }
});
