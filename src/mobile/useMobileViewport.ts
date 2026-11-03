import {useEffect} from 'react';
import {mobileFeature,nativeAvailable} from './native';
import {NativeViewport} from './nativeViewport';
import {viewportTarget,caretClearance} from './viewportTarget';

// Native IME geometry owns modern Android layout. Older Android and browser
// previews use visualViewport instead; never combine the two height sources.
export function useMobileViewport() {
  useEffect(() => {
    const root=document.documentElement, viewport=window.visualViewport;
    let live=true;
    let frame=0,lastHeight=viewport?.height||innerHeight;
    let scrolling:{element:Element;top:number;frame:number}|undefined;
    const stopScroll=()=>{
      if(scrolling)cancelAnimationFrame(scrolling.frame);scrolling=undefined;
    };
    const scrollTo=(element:Element,top:number)=>{
      top=Math.min(top,Math.max(0,element.scrollHeight-element.clientHeight));
      if(scrolling?.element===element&&Math.abs(scrolling.top-top)<1)return;
      stopScroll();
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){element.scrollTop=top;return;}
      const from=element.scrollTop,start=performance.now(),duration=Math.min(280,180+Math.abs(top-from)*.25),job={element,top,frame:0};scrolling=job;
      const step=(now:number)=>{
        if(scrolling!==job)return;
        if(!element.isConnected){stopScroll();return;}
        const progress=Math.max(0,Math.min(1,(now-start)/duration)),ease=progress*progress*(3-2*progress);
        element.scrollTop=from+(top-from)*ease;
        if(progress<1)job.frame=requestAnimationFrame(step);else scrolling=undefined;
      };
      job.frame=requestAnimationFrame(step);
    };
    const revealNow=()=>{
      if(native.state?.animating){native.avoid();return;}
      if(root.dataset.mobileKeyboard!=='true'||viewport&&viewport.scale!==1)return;
      const target=viewportTarget(!!native.state);if(!target)return;
      const {scroller,rect}=target,box=target.documentView.getBoundingClientRect(),bottom=Math.min(box.bottom,scroller.getBoundingClientRect().bottom,native.height??(viewport?viewport.offsetTop+viewport.height:innerHeight));
      // The IME covers the bottom only. Do not reposition visible content or
      // restore an old selection above the screen when focus changes.
      if(bottom>box.top&&rect.height<bottom-box.top&&rect.bottom>bottom+1)scrollTo(scroller,scroller.scrollTop+rect.bottom-bottom+Math.min(caretClearance(target),Math.max(0,bottom-box.top-rect.height-2))+2);
      else if(scrolling?.element===scroller)stopScroll();
    };
    const reveal=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(revealNow);};
    const native=new NativeViewport(root,reveal,()=>{cancelAnimationFrame(frame);stopScroll();});
    const nativeChanged=(event:Event)=>native.receive((event as CustomEvent).detail);
    const interrupt=()=>{cancelAnimationFrame(frame);stopScroll();native.interrupt();};
    const focus=(event:FocusEvent)=>{stopScroll();if(event.target instanceof HTMLElement&&event.target.matches('input,textarea'))reveal();};
    const keyboard=(event:Event)=>{if(native.state)return;if((event as CustomEvent<boolean>).detail)reveal();else interrupt();};
    const resize=()=>{
      if(native.state){native.refresh();return;}
      // A pinch-zoomed page must remain zoomable; resizing its layout fights the gesture.
      const height=viewport?.height||innerHeight;
      if(!viewport||viewport.scale===1){
        const value=height+'px';if(root.style.getPropertyValue('--mobile-viewport-height')!==value)root.style.setProperty('--mobile-viewport-height',value);
        // Start a minimal, frame-aligned scroll as soon as the IME resizes
        // the viewport. Repeated resize/input events share the same target.
        if(height<lastHeight-1){cancelAnimationFrame(frame);revealNow();}
        else if(height>lastHeight+1)interrupt();
      }
      lastHeight=height;
    };
    window.addEventListener('moyu-mobile-viewport',nativeChanged);
    if(window.__moyuNativeViewport)native.receive(window.__moyuNativeViewport);
    if(nativeAvailable())void mobileFeature('mobile.viewport').then(state=>{if(live)native.receive(state);}).catch(()=>{});
    resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);
    document.addEventListener('input',reveal);document.addEventListener('compositionend',reveal);
    window.addEventListener('moyu-mobile-caret-tap',reveal);
    document.addEventListener('focusin',focus);window.addEventListener('moyu-mobile-keyboard',keyboard);
    document.addEventListener('pointerdown',interrupt,true);document.addEventListener('wheel',interrupt,{passive:true});
    return()=>{live=false;interrupt();native.close();window.removeEventListener('moyu-mobile-viewport',nativeChanged);window.removeEventListener('moyu-mobile-caret-tap',reveal);viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);document.removeEventListener('input',reveal);document.removeEventListener('compositionend',reveal);document.removeEventListener('focusin',focus);window.removeEventListener('moyu-mobile-keyboard',keyboard);document.removeEventListener('pointerdown',interrupt,true);document.removeEventListener('wheel',interrupt);root.style.removeProperty('--mobile-viewport-height');};
  },[]);
}
