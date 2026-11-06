const fs = require('node:fs');

// Retry a failed watcher and invalidate the gap before trusting events again.
function watchWithRecovery(root, { changed, failed, watch = fs.watch, retryDelay = 10000 }) {
  let watcher, timer, closed = false;
  const retry = error => {
    watcher?.close();watcher = null;
    if(closed)return;
    failed(error);
    clearTimeout(timer);
    timer=setTimeout(()=>{if(closed)return;changed(null);attach();},retryDelay);
    timer.unref?.();
  };
  const attach = () => {
    if(closed)return;
    try {
      const next=watch(root,{recursive:true},(_event,file)=>changed(file));
      watcher=next;
      next.on('error',error=>{if(watcher===next)retry(error);});
    } catch(error) {retry(error);}
  };
  attach();
  return {close(){closed=true;clearTimeout(timer);watcher?.close();watcher=null;}};
}
module.exports={watchWithRecovery};
