import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Saving an emptied separator retains two independent ordered lists',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'1. alpha\n2. beta\n\n分隔段落\n\n1. gamma\n2. delta'}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  const p=page.locator('.ProseMirror > p').filter({hasText:/^分隔段落$/});await p.tap();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
  await expect(page.locator('.ProseMirror > p')).toHaveText('');await page.getByRole('button',{name:'保存文档',exact:true}).tap();
  await expect.poll(()=>page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toContain('<br />');
  await page.reload();await expect(page.locator('.reading-view ol')).toHaveCount(2);
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.ProseMirror .label-wrapper .ordered')).toHaveText(['1.','2.','1.','2.']);await expect(page.locator('.ProseMirror > p')).toHaveCount(1);
});
