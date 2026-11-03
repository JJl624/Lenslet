import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';
import {openMobileSettings} from './helpers/mobile-controls.mjs';

test('Attachments share standalone/inline rules on phone, including nested lists and display-only captions',async({page})=>{
  const raw='![图片](a.svg)',content='前 '+raw+' 后\n\n1. 项目\n\n   '+raw+'\n\n结束';
  await mockAndroid(page,{files:{'note.md':{content},'a.svg':{content:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="teal"/></svg>'}}});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view p').first().locator('a')).toHaveText('图片');
  await expect(page.locator('.reading-view [data-preview-kind=image]')).toHaveCount(1);await expect(page.locator('.reading-view li .attachment-preview-caption')).toHaveText('图片');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  await expect(page.locator('.attachment-overlay [data-preview-kind=image] img')).toBeVisible();
  await page.locator('.ProseMirror > p').last().tap();
  const inline=page.locator('.ProseMirror > p').first().locator('a');await inline.tap();await expect(page.locator('.ProseMirror > p').first().locator('.attachment-raw')).toHaveText(raw);
  await page.locator('.ProseMirror > p').last().tap();await expect(page.locator('.attachment-overlay .attachment-preview-caption')).toHaveText('图片');
  await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await openMobileSettings(page);await page.getByRole('switch',{name:'显示附件预览名称',exact:true}).uncheck();
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
  await page.getByRole('button',{name:'返回笔记',exact:true}).tap();await page.locator('[data-path="note.md"] .mobile-file-open').tap();
  await expect(page.locator('.attachment-preview-caption').first()).toHaveCSS('opacity','0');
});
