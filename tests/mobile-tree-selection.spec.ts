import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Opening a file clears the previous folder selection without collapsing directories',async({page})=>{
  await mockAndroid(page,{files:{'start.md':{content:'开始'},'A/a.md':{content:'A'},'B/b.md':{content:'B'}},folders:['A','B']});await page.goto('/mobile.html');
  await page.getByRole('button',{name:'返回笔记',exact:true}).tap();
  const row=(path:string)=>page.locator('.mobile-file-tree [data-path="'+path+'"]');
  await row('B').locator('.mobile-file-open').tap();await row('A').locator('.mobile-file-open').tap();
  await expect(row('A')).toHaveClass(/selected-folder/);
  await row('B/b.md').locator('.mobile-file-open').tap();await page.getByRole('button',{name:'返回笔记',exact:true}).tap();
  await expect(row('A')).not.toHaveClass(/selected-folder/);await expect(row('A')).toHaveAttribute('aria-expanded','true');
  await expect(row('B/b.md')).toHaveAttribute('aria-selected','true');await expect(page.locator('.mobile-file-tree [aria-selected=true]')).toHaveCount(1);
  await row('A').locator('.mobile-file-open').tap();await expect(row('A')).toHaveAttribute('aria-selected','true');await expect(row('B/b.md')).toHaveAttribute('aria-selected','false');
});

test('Phone interface and prose leave the generic font to the engine while code remains monospace',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'普通文字\n\n```js\nconsole.log(1);\n```'}}});await page.goto('/mobile.html');
  for(const selector of ['.mobile-app','.reading-view p'])expect(await page.locator(selector).evaluate(element=>getComputedStyle(element).fontFamily.split(',')[0].trim())).toBe('sans-serif');
  expect(await page.locator('.reading-view pre code').evaluate(element=>getComputedStyle(element).fontFamily)).toContain('monospace');
  await page.getByRole('tab',{name:'编辑',exact:true}).tap();expect(await page.locator('.ProseMirror').evaluate(element=>getComputedStyle(element).fontFamily.split(',')[0].trim())).toBe('sans-serif');
});
