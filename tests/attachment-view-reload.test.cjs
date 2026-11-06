const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('esbuild'),{Module}=require('node:module');

test('A delayed attachment reload cannot replace a newer locally edited and flushed view',async t=>{
  const previous=global.window;global.window=new EventTarget();t.after(()=>{global.window=previous;delete global.__attachmentReloadApi;});
  let release,delayed=false;
  global.__attachmentReloadApi={desktop:true,platform:'win32',feature:async action=>{
    if(action==='attachment.views-update')return;
    if(delayed)return new Promise(resolve=>{release=resolve;});
    return {views:{'a.pdf':{pdfPage:1}},directory:'note.assets'};
  }};
  const result=await build({entryPoints:['src/attachments/viewState.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock-platform',setup(builder){
    builder.onResolve({filter:/^(\.\.\/bridge|\.\/preferences)$/},args=>({path:args.path,namespace:'mock'}));
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='../bridge'?'export const api=globalThis.__attachmentReloadApi;':'export const attachmentViewKey=path=>JSON.stringify(["vault",path]);'}));
  }}]});
  const module=new Module('attachment-reload-test');module._compile(result.outputFiles[0].text,'attachment-reload-test.cjs');
  const {attachmentState,reloadAttachmentViews}=module.exports,state=await attachmentState('note.md','a.pdf');
  delayed=true;const reloading=reloadAttachmentViews(['note.md']);
  await new Promise(resolve=>setImmediate(resolve));state.update({pdfPage:8});await state.flush();
  release({views:{'a.pdf':{pdfPage:1}},directory:'note.assets'});await reloading;
  assert.equal(state.get().pdfPage,8);
});
