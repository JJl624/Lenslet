import {createHash} from 'node:crypto';
import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

for(const conflict of [false,true])test(`Restoring another document draft preserves the active document and open stack (${conflict?'conflict':'same disk version'})`,async({page})=>{
  await mockAndroid(page,{files:{'a.md':{content:'原文 A'},'b.md':{content:'原文 B'}},engine:'gecko'});
  await page.addInitScript(({version})=>{if(window!==window.top)return;
    const state=(window as any).__mobileState;state.settings['moyu-save-policy']='manual';state.settings['moyu-session-internal']=JSON.stringify({tabs:['a.md','b.md'],active:'b.md'});
    state.drafts['a.md']={root:'internal',path:'a.md',content:'草稿 A',version};
  },{version:conflict?'old':createHash('sha256').update('原文 A').digest('hex')});
  await page.goto('/mobile.html');await expect(page.locator('.mobile-notice')).toContainText(/恢复|冲突/);
  await expect(page.locator('.mobile-document-title strong')).toHaveText('b');await expect(page.locator('.reading-view')).toContainText('原文 B');
  await page.locator('.mobile-document-title').tap();await expect(page.locator('.mobile-opened-row')).toHaveCount(2);await expect(page.locator('.mobile-opened-row > button:first-child span')).toHaveText(['b','a · 未保存']);
  await page.getByRole('button',{name:'关闭已打开的文档',exact:true}).tap();await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await page.locator('[data-path="a.md"] .mobile-file-open').tap();
  await expect(page.locator('.reading-view')).toContainText('草稿 A');
  expect(await page.evaluate(()=>(window as any).__mobileState.files['a.md'].content)).toBe('原文 A');expect(await page.evaluate(()=>(window as any).__mobileState.files['b.md'].content)).toBe('原文 B');
});
