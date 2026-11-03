import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft,X } from 'lucide-react';

const openSheets=new Set<symbol>();
export function useMobileSheetOpen(){
  const [open,setOpen]=useState(openSheets.size>0);
  useEffect(()=>{const update=()=>setOpen(openSheets.size>0);window.addEventListener('moyu-mobile-sheet',update);update();return()=>window.removeEventListener('moyu-mobile-sheet',update);},[]);
  return open;
}

export function MobileSheet({ title, close, back, children }: { title: string; close(): void; back?:()=>void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(()=>{
    if(document.documentElement.dataset.mobileViewport!=='native')return;
    const height=Number.parseFloat(document.querySelector<HTMLElement>('.mobile-app')?.style.height||'');
    if(!Number.isFinite(height)||height<=0||!dialog.current)return;
    dialog.current.parentElement!.style.height=height+'px';dialog.current.style.maxHeight=Math.max(0,height-24)+'px';
  },[]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const token=Symbol();openSheets.add(token);window.dispatchEvent(new Event('moyu-mobile-sheet'));
    // Native showModal makes the entire, potentially very large document inert.
    // The opaque hit layer, aria-modal and the small focus trap provide modal
    // behavior without restyling every Markdown/code node on each opening.
    dialog.current?.show();
    const trap=(event:FocusEvent)=>{
      const node=dialog.current;if(!node||[...openSheets].at(-1)!==token||node.contains(event.target as Node))return;
      node.querySelector<HTMLElement>('button,input,[tabindex]')?.focus({preventScroll:true});
    };
    document.addEventListener('focusin',trap);
    return () => {
      document.removeEventListener('focusin',trap);
      openSheets.delete(token);window.dispatchEvent(new Event('moyu-mobile-sheet'));
      // Closing a menu must not reopen the IME. Formatting explicitly restores
      // the captured editor selection only when an action is chosen.
      if(previous?.isConnected&&!previous.closest('[contenteditable],input,textarea'))previous.focus({preventScroll:true});
    };
  }, []);
  return <div className='mobile-sheet-layer'>
    <div className='mobile-sheet-backdrop' aria-hidden='true' onPointerDown={event=>event.preventDefault()} onClick={close}/>
    <dialog ref={dialog} className='mobile-sheet' aria-label={title} aria-modal='true'
    onCancel={event => { event.preventDefault(); (back||close)(); }}
    onKeyDown={event=>{
      if(event.nativeEvent.isComposing||event.keyCode===229)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();(back||close)();return;}
      if(event.key!=='Tab')return;
      const items=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length);
      const index=items.indexOf(document.activeElement as HTMLElement);
      if(event.shiftKey&&index<=0||!event.shiftKey&&index===items.length-1){event.preventDefault();items[event.shiftKey?items.length-1:0]?.focus({preventScroll:true});}
    }}
    onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientY < box.top) close(); } }}>
    <header>{back&&<button aria-label='返回上一级面板' onClick={back}><ArrowLeft size={20}/></button>}<h2>{title}</h2><button aria-label={'关闭' + title} onClick={close}><X size={20} /></button></header>
    <div className='mobile-sheet-content'>{children}</div>
  </dialog></div>;
}
