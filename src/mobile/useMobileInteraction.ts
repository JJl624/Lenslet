import {useEffect} from 'react';
import {mobileFeature,nativeAvailable} from './native';
import {setTouchSettings,touchSettings} from '../touchSettings';

// Dialog focus restoration can inherit :focus-visible from its previous target.
// Keep focus for accessibility and keyboard navigation, but don't paint it after touch.
export function useMobileInteraction(){
  useEffect(()=>{
    const root=document.documentElement;
    let deletionHost:HTMLElement|null=null;
    const clearDeletion=()=>{if(deletionHost)delete deletionHost.dataset.mobileDeletion;deletionHost=null;};
    const markDeletion=(target:EventTarget|null)=>{
      const host=target instanceof Element?target.closest<HTMLElement>('.editor-host'):null;
      if(!host)return;clearDeletion();deletionHost=host;host.dataset.mobileDeletion='true';
    };
    const configure=()=>{if(nativeAvailable())void mobileFeature<ReturnType<typeof touchSettings>>('mobile.touch-settings').then(setTouchSettings).catch(()=>{});};
    configure();window.addEventListener('moyu-mobile-resume',configure);
    const pointer=(event:PointerEvent)=>{clearDeletion();root.dataset.mobileInput=event.pointerType==='mouse'?'pointer':'touch';};
    const key=(event:KeyboardEvent)=>{
      if(['Backspace','Delete'].includes(event.key))markDeletion(event.target);
      if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&['Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))root.dataset.mobileInput='keyboard';
    };
    // Soft keyboards can delete through beforeinput without a keydown. Keep
    // that editing intent separate from keyboard navigation and touch styles.
    const input=(event:InputEvent)=>{if(/^delete(?:Content|Word|SoftLine|HardLine|EntireSoftLine)/.test(event.inputType))markDeletion(event.target);};
    const keyboard=(event:Event)=>{if(!(event as CustomEvent<boolean>).detail)clearDeletion();};
    root.dataset.mobileInput='touch';
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',key,true);document.addEventListener('beforeinput',input as EventListener,true);
    window.addEventListener('moyu-mobile-keyboard',keyboard);
    return()=>{clearDeletion();window.removeEventListener('moyu-mobile-resume',configure);window.removeEventListener('moyu-mobile-keyboard',keyboard);document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',key,true);document.removeEventListener('beforeinput',input as EventListener,true);delete root.dataset.mobileInput;};
  },[]);
}
