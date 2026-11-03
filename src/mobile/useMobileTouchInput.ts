import {useEffect,type RefObject} from 'react';
import {touchSettings} from '../touchSettings';
import {mobileFeature,nativeAvailable} from './native';

// Keep Android text selection available during a hold. Only a completed tap
// enables the IME; long holds and scrolling must not turn into keyboard input.
export function useMobileTouchInput(scope:RefObject<HTMLElement|null>,enabled:boolean,identity:string){
  useEffect(()=>{
    const root=scope.current;if(!enabled||!root)return;
    const suppressed=new Map<HTMLElement,string|null>();
    let press:{at:number;x:number;y:number;moved:boolean;editable:HTMLElement}|undefined;
    let holdTimer=0,openTimer=0,openFrame=0,opening=false;
    const cancelHold=()=>{clearTimeout(holdTimer);holdTimer=0;};
    const restore=(element:HTMLElement)=>{if(!suppressed.has(element))return;const previous=suppressed.get(element);if(previous===null)element.removeAttribute('inputmode');else element.setAttribute('inputmode',previous!);suppressed.delete(element);};
    const restoreInactive=()=>{for(const element of suppressed.keys())if(element!==document.activeElement)restore(element);};
    const down=(event:PointerEvent)=>{
      cancelHold();press=undefined;restoreInactive();if(event.pointerType!=='touch')return;
      if(opening||document.documentElement.dataset.mobileKeyboard!=='false')return;
      const target=event.target as HTMLElement;if(target.closest('button,input,textarea,[role=separator],.tools,.html-note-tools,.code-language-menu'))return;
      const editable=target.closest<HTMLElement>('.cm-content,.ProseMirror')
        ||(target.closest('.attachment-overlay')?target.closest('.editor-host')?.querySelector<HTMLElement>('.ProseMirror'):null);if(!editable)return;
      press={at:performance.now(),x:event.clientX,y:event.clientY,moved:false,editable};
      // Ordinary taps never alter the input connection. Suppress the IME just
      // before Android recognizes a long hold, allowing for one rendering frame.
      holdTimer=window.setTimeout(()=>{
        if(!press||press.moved||document.documentElement.dataset.mobileKeyboard!=='false')return;
        if(!suppressed.has(editable)){suppressed.set(editable,editable.getAttribute('inputmode'));editable.setAttribute('inputmode','none');}
      },Math.max(0,touchSettings().longPressTimeout-32));
    };
    const move=(event:PointerEvent)=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>touchSettings().touchSlop){press.moved=true;cancelHold();}};
    const up=(event:Event)=>{
      cancelHold();
      if(press){
        const tap=event.type==='pointerup'&&!press.moved&&performance.now()-press.at<touchSettings().longPressTimeout;
        if(tap){
          const editable=press.editable,needsKeyboard=suppressed.has(editable);restore(editable);opening=document.documentElement.dataset.mobileKeyboard!=='true';
          clearTimeout(openTimer);if(opening)openTimer=window.setTimeout(()=>opening=false,1000);
          cancelAnimationFrame(openFrame);openFrame=requestAnimationFrame(()=>{
            if(!editable.isConnected||document.activeElement!==editable)return;
            if((opening||needsKeyboard)&&nativeAvailable()&&document.documentElement.dataset.mobileKeyboard!=='true')void mobileFeature('mobile.keyboard-show').catch(()=>{});
            else if(needsKeyboard&&!nativeAvailable())editable.focus({preventScroll:true});
            window.dispatchEvent(new Event('moyu-mobile-caret-tap'));
          });
        }
      }
      press=undefined;
    };
    const keyboard=(event:Event)=>{if((event as CustomEvent<boolean>).detail){opening=false;clearTimeout(openTimer);}};
    root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',up,true);
    root.addEventListener('focusin',restoreInactive,true);
    window.addEventListener('moyu-mobile-keyboard',keyboard);
    return()=>{cancelHold();clearTimeout(openTimer);cancelAnimationFrame(openFrame);for(const element of suppressed.keys())restore(element);root.removeEventListener('focusin',restoreInactive,true);window.removeEventListener('moyu-mobile-keyboard',keyboard);root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',up,true);};
  },[enabled,scope,identity]);
}
