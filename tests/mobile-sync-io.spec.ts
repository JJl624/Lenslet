import {test,expect} from './helpers/mobile-test';
import {mobileDavFixture,runMobileSync} from './helpers/mobile-dav-fixture';
import {davServer} from './helpers/dav-server.cjs';

test('Sync batches file checks, records deltas outside preferences, and an unchanged repeat only lists metadata',async({page})=>{
  const dav=await davServer(),files=Object.fromEntries(Array.from({length:32},(_,i)=>['note-'+i+'.md',{content:'body '+i}]));
  try{
    await mobileDavFixture(page,dav,{initial:{files}});
    const before=await page.evaluate(()=>(window as any).__mobileCalls['preferences.set-many']||0);
    expect((await runMobileSync(page)).uploaded).toBe(32);
    const result=await page.evaluate(()=>{const state=(window as any).__mobileState,calls=(window as any).__mobileCalls;return{records:calls['mobile.sync-baseline-record'],checkpoints:calls['mobile.sync-baseline-checkpoint'],preferences:calls['preferences.set-many']||0,prefKeys:Object.keys(state.settings),baselines:Object.values(state.syncBaselines).map((baseline:any)=>Object.keys(baseline).length)};});
    expect(result.records).toBe(32);expect(result.checkpoints).toBe(1);expect(result.preferences-before).toBeLessThan(6);expect(result.baselines).toEqual([32]);expect(result.prefKeys.filter(key=>/^moyu-mobile-sync-[a-f0-9]{64}$/.test(key))).toEqual([]);
    await page.evaluate(()=>{const bridge=window.MoyuNative!,post=bridge.postMessage.bind(bridge);(window as any).__hashBatches=[];bridge.postMessage=text=>{const request=JSON.parse(text);if(request.method==='feature'&&request.args[0]==='mobile.file-hashes')(window as any).__hashBatches.push(request.args[1].paths.length);post(text);};});
    const offset=dav.requests.length;const repeated=await runMobileSync(page);expect(repeated.uploaded+repeated.downloaded).toBe(0);expect(dav.requests.slice(offset).map((request:any)=>request.method)).toEqual(['PROPFIND']);
    expect(await page.evaluate(()=>(window as any).__hashBatches.every((size:number)=>size===32))).toBe(true);
    await page.reload();await expect(page.locator('.mobile-file-list,.mobile-mode-bar').first()).toBeVisible({timeout:30000});const reloaded=await runMobileSync(page);expect(reloaded.uploaded+reloaded.downloaded).toBe(0);
  }finally{await dav.close();}
});

test('An existing preference baseline migrates once without uploading or downloading unchanged files',async({page})=>{
  const dav=await davServer();dav.files.set('/a.md',Buffer.from('body'));
  try{
    await mobileDavFixture(page,dav,{initial:{files:{'a.md':{content:'body'}}}});
    await page.evaluate(async()=>{const {settingsStore}=await import('/src/settingsStore.ts'),{syncKey,hashBytes}=await import('/src/mobile/syncState.ts'),state=(window as any).__mobileState;const key=await syncKey(state.root,state.davConnections[state.root]),hash=await hashBytes(new TextEncoder().encode('body'));settingsStore.setItem(key,JSON.stringify({'a.md':{localHash:hash,remoteEtag:'"'+hash+'"'}}));await settingsStore.flush();});
    const before=dav.requests.length,result=await runMobileSync(page);expect(result.uploaded+result.downloaded).toBe(0);expect(dav.requests.slice(before).map((request:any)=>request.method)).toEqual(['PROPFIND']);
    expect(await page.evaluate(()=>Object.keys((window as any).__mobileState.settings).filter(key=>/^moyu-mobile-sync-[a-f0-9]{64}$/.test(key)))).toEqual([]);
    await page.reload();await expect(page.locator('.mobile-file-list,.mobile-mode-bar').first()).toBeVisible({timeout:30000});expect((await runMobileSync(page)).conflicts).toEqual([]);
  }finally{await dav.close();}
});
