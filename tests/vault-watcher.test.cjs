const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {watchWithRecovery}=require('../electron/vault-watcher.cjs');

test('Watch errors invalidate the missed interval, retry, and stop retrying after close',t=>{
  t.mock.timers.enable({apis:['setTimeout']});const events=[],failures=[],handles=[];let attempts=0;
  const watcher=watchWithRecovery('vault',{retryDelay:100,changed:file=>events.push(file),failed:error=>failures.push(error.message),watch:()=>{
    attempts++;if(attempts===1)throw Error('unavailable');
    const handle=new EventEmitter();handle.close=()=>{};handles.push(handle);return handle;
  }});
  assert.deepEqual(failures,['unavailable']);t.mock.timers.tick(100);assert.equal(attempts,2);assert.deepEqual(events,[null]);
  handles[0].emit('error',Error('disconnected'));t.mock.timers.tick(100);assert.equal(attempts,3);assert.deepEqual(events,[null,null]);
  handles[1].emit('error',Error('closed'));watcher.close();t.mock.timers.tick(1000);assert.equal(attempts,3);
});
