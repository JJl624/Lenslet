import {useEffect} from 'react';
import {paletteStyle} from '../themes';
import {mobileFeature,nativeAvailable} from './native';
import {useMobileSheetOpen} from './MobileSheet';
import {systemBarColors} from './systemBars';

export function MobileSystemBars({theme,preset,documentView}:{theme:'light'|'dark';preset:string;documentView:boolean}){
  const modal=useMobileSheetOpen();
  useEffect(()=>{if(nativeAvailable())void mobileFeature('mobile.theme',{theme,...systemBarColors(paletteStyle(preset,theme) as Record<string,string>,documentView,modal)}).catch(()=>{});},[theme,preset,documentView,modal]);
  return null;
}
