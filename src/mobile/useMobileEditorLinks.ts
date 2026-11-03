import {useEffect,useRef,type RefObject} from 'react';
import {touchSettings} from '../touchSettings';
import {keepClosedKeyboard} from '../editor/controlFocus';

export function useMobileEditorLinks(scope:RefObject<HTMLElement|null>,enabled:boolean,visit:(href:string)=>void,resolve:(target:HTMLElement,x:number,y:number)=>string|undefined){
  const callback=useRef(visit);callback.current=visit;
  const resolver=useRef(resolve);resolver.current=resolve;
  useEffect(()=>{
    const root=scope.current;if(!enabled||!root)return;
    let press:{x:number;y:number;href:string;timer:number;opened:boolean}|undefined,suppressUntil=0;
    const cancel=()=>{if(press)clearTimeout(press.timer);press=undefined;};
    const open=()=>{if(!press||press.opened)return;press.opened=true;suppressUntil=performance.now()+700;keepClosedKeyboard(root);callback.current(press.href);};
    const down=(event:PointerEvent)=>{
      cancel();if(event.pointerType!=='touch')return;
      const target=event.target as HTMLElement,anchor=target.closest<HTMLAnchorElement>('a[href]');
      const href=anchor?.getAttribute('href')||(target.closest('.inline-syntax')?resolver.current(target,event.clientX,event.clientY):undefined);if(!href)return;
      // A short tap must reach the inline editor's compatibility mouse event.
      // Only a completed long press suppresses editing and follows the link.
      keepClosedKeyboard(root);
      press={x:event.clientX,y:event.clientY,href,timer:window.setTimeout(open,touchSettings().longPressTimeout),opened:false};
    };
    const move=(event:PointerEvent)=>{if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>touchSettings().touchSlop)cancel();};
    const up=(event:Event)=>{if(press?.opened)event.preventDefault();cancel();};
    const click=(event:Event)=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}};
    const menu=(event:Event)=>{if(press){event.preventDefault();event.stopImmediatePropagation();open();}};
    root.addEventListener('pointerdown',down,true);root.addEventListener('pointermove',move,true);root.addEventListener('pointerup',up,true);root.addEventListener('pointercancel',cancel,true);root.addEventListener('click',click,true);root.addEventListener('contextmenu',menu,true);
    return()=>{cancel();root.removeEventListener('pointerdown',down,true);root.removeEventListener('pointermove',move,true);root.removeEventListener('pointerup',up,true);root.removeEventListener('pointercancel',cancel,true);root.removeEventListener('click',click,true);root.removeEventListener('contextmenu',menu,true);};
  },[enabled,scope]);
}
