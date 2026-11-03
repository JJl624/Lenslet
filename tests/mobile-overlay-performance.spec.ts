import {test,expect} from './helpers/mobile-test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {mockAndroid} from './helpers/mobile-native-mock';
import {performanceDocuments} from './fixtures/performance-documents.mjs';

test('Document menus keep a large reading view intact and composite the dim layer independently',async({page,context})=>{
  await mockAndroid(page,{files:{'note.md':{content:performanceDocuments[1].markdown}}});await page.goto('/mobile.html');await expect(page.locator('.reading-view')).not.toHaveAttribute('data-editor-pending','true',{timeout:30000});
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  try{
    const result=await page.evaluate(async()=>{
      const reading=document.querySelector('.reading-view')!,original=reading.firstChild;let mutations=0;
      const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(reading,{childList:true,subtree:true,characterData:true});
      const samples:number[]=[],frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      for(let i=0;i<8;i++){
        const button=document.querySelector<HTMLButtonElement>(i%2?'.mobile-document-title':'button[aria-label="文档操作"]')!,start=performance.now();button.click();await frame();
        const dialog=document.querySelector<HTMLDialogElement>('.mobile-sheet[open]');if(!dialog)throw Error('Menu did not open');samples.push(performance.now()-start);
        dialog.querySelector<HTMLButtonElement>('header > button:last-child')!.click();await frame();
      }
      observer.disconnect();return{samples,mutations,nodes:reading.querySelectorAll('*').length,sameDocument:reading.firstChild===original};
    });
    await fs.writeFile(path.resolve(import.meta.dirname,'../../../work/overlay-performance-'+(process.env.MOYU_PERF_LABEL||'current')+'.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));expect(result.sameDocument).toBe(true);expect(result.mutations).toBe(0);
  }finally{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});await cdp.detach();}
});
