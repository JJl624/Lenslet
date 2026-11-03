import {test,expect} from './helpers/mobile-test';
import path from 'node:path';
import {mockAndroid} from './helpers/mobile-native-mock';
import {expectFoldAligned} from './helpers/fold-layout';

const content='> [+] 标题与正文保持同样的字号，长标题换行时箭头始终对齐第一行，手机和电脑上保持相同的引用样式\n> 正文内容\n>\n> > [+] 嵌套折叠标题\n> > 嵌套内容\n\n> [-] 收起的标题\n> 隐藏内容\n\n> [+]\n> 空标题内容\n';
test('Fold icons align with the first title line in reading and editing at every mobile text size',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content}}});
  await page.addInitScript(()=>{if(window!==window.top)return;const settings=(window as any).__mobileState.settings;settings['moyu-mobile-size']='10';settings['moyu-mobile-ui-size']='14';settings['moyu-save-policy']='manual';});
  await page.goto('/mobile.html');await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true');
  for(const size of [10,14,17,24]){
    const grow=page.getByRole('button',{name:'放大字号',exact:true});
    while(await page.getByRole('group',{name:'页面字号 '+size+' px',exact:true}).count()===0)await grow.tap();
    const reading=page.locator('.reading-view details.folding-quote > summary');
    const geometry=await expectFoldAligned(reading.nth(0),size);await expectFoldAligned(reading.nth(1),size);await expectFoldAligned(reading.nth(2),size);
    expect(geometry.height).toBeGreaterThanOrEqual(44);if(size===24)expect(geometry.lines).toBeGreaterThan(1);
    await reading.nth(2).tap();await expectFoldAligned(reading.nth(2),size);
    if(size===10||size===24)await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/fold-reading-'+size+'.png')});
    await page.getByRole('tab',{name:'编辑',exact:true}).tap();await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
    const titles=page.locator('.ProseMirror .folding-quote > p:first-child');
    const edit=await expectFoldAligned(titles.nth(0),size);await expectFoldAligned(titles.nth(1),size);await expectFoldAligned(titles.nth(2),size);
    for(const key of ['font','line','padding','iconTop','iconSize','iconX','textX','height'] as const)expect(edit[key],key).toBeCloseTo(geometry[key],0);
    for(const button of await page.locator('.folding-quote-toggle').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const first=page.locator('.ProseMirror > .folding-quote').first();await first.getByRole('button').first().tap();await expect(first).toHaveAttribute('data-fold-open','false');await expectFoldAligned(titles.first(),size);
    if(size===10||size===24)await page.screenshot({path:path.resolve(import.meta.dirname,'../../../work/fold-editing-'+size+'.png')});
    await page.getByRole('tab',{name:'阅读',exact:true}).tap();
  }
  expect(await page.evaluate(()=>(window as any).__mobileState.files['note.md'].content)).toBe(content);
});
