import {type AttachmentViewState,reportAttachmentViewError} from './viewState';
import {bindHeightResize} from '../heightResizeGesture';

/** A height-only resize control. Browser resize grips can retain a pixel width
 * and cannot distinguish user changes from responsive layout restoration. */
export function resizeAttachmentViewport(viewport:HTMLElement,label:string,signal:AbortSignal,state?:AttachmentViewState,defaultHeight:()=>number=()=>400){
  const handle=document.createElement('div');handle.className='attachment-viewport-resize';handle.dataset.attachmentControl='true';handle.tabIndex=0;
  handle.setAttribute('aria-label',label);
  viewport.after(handle);
  let resizing=false;
  const show=(height:number|null)=>{const value=height===null?defaultHeight():Math.max(120,Math.min(4000,Math.round(height)));if(viewport.style.height!==value+'px')viewport.style.height=value+'px';handle.setAttribute('aria-valuenow',String(Math.round(value)));};
  const restore=()=>{if(resizing)return;const saved=state?.get().height;if(saved!==undefined)show(saved||null);};
  restore();
  const unsubscribe=state?.subscribe(restore);
  const dispose=bindHeightResize(handle,{
    mobile:!!viewport.closest('.mobile-app'),minHeight:120,maxHeight:4000,defaultHeight,measure:()=>viewport.getBoundingClientRect().height,
    value:()=>{const saved=state?.get().height;return saved?Math.max(120,Math.min(4000,Math.round(saved))):null;},
    preview:show,commit:height=>state?.update({height:height??0}),active:value=>{resizing=value;},
  });
  const cleanup=()=>{dispose();unsubscribe?.();void state?.flush().catch(reportAttachmentViewError);};
  if(signal.aborted)cleanup();else signal.addEventListener('abort',cleanup,{once:true});
  return handle;
}
