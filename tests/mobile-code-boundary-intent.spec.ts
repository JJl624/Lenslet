import {test,expect} from './helpers/mobile-test';
import {mockAndroid} from './helpers/mobile-native-mock';

test('Crossing into empty code preserves outside text and permits deliberate deletion inside code',async({page})=>{
  await mockAndroid(page,{files:{'note.md':{content:'1. 项目\n\n   ```text\n   ```\n\n   外部文字'}},engine:'gecko'});
  await page.addInitScript(()=>{if(window!==window.top)return;return ((window as any).__mobileState.settings['moyu-save-policy']='manual');});
  await page.goto('/mobile.html');await page.getByRole('tab',{name:'编辑',exact:true}).tap();
  await expect(page.locator('.editor-host')).not.toHaveAttribute('data-editor-pending','true');
  const code=page.locator('.milkdown-code-block'),p=code.locator('xpath=following-sibling::p[1]');
  await p.tap();await page.keyboard.press('Home');
  // Some input connections send Process before their cancellable deletion.
  await p.dispatchEvent('keydown',{key:'Process',keyCode:229,bubbles:true});
  await p.evaluate(el=>el.dispatchEvent(new InputEvent('beforeinput',{inputType:'deleteContentBackward',bubbles:true,cancelable:true})));
  await expect(code.locator('.cm-content')).toBeFocused();await expect(p).toHaveText('外部文字');
  await page.keyboard.press('Backspace');await expect(code).toHaveCount(0);
  await expect(page.locator('.ProseMirror')).toContainText('外部文字');
  await page.getByRole('button',{name:'撤销',exact:true}).tap();await expect(code.locator('.cm-content')).toBeFocused();
  await page.keyboard.insertText('7');await expect(code.locator('.cm-content')).toHaveText('7');
});
