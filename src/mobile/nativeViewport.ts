import {viewportTarget,caretClearance} from './viewportTarget';

export type NativeViewportState={sequence:number;animation:number;phase:string;width:number;height:number;bottom:number;startBottom:number;targetBottom:number;visible:boolean;animating:boolean;progress:number};
declare global{interface Window{__moyuNativeViewport?:NativeViewportState}}
function valid(value:unknown):value is NativeViewportState{
  if(!value||typeof value!=='object')return false;const state=value as NativeViewportState;
  return ['sequence','animation','width','height','bottom','startBottom','targetBottom','progress'].every(key=>Number.isFinite(state[key as keyof NativeViewportState]))
    &&state.width>0&&state.height>0&&state.bottom>=0&&state.bottom<=state.height&&state.targetBottom>=0&&state.targetBottom<=state.height
    &&state.startBottom>=0&&state.startBottom<=state.height&&state.progress>=0&&state.progress<=1&&typeof state.visible==='boolean'&&typeof state.animating==='boolean';
}

/** Map Android pixels through the actual browser view width, not a guessed density,
 * keyboard percentage or the possibly stale visualViewport height. */
export class NativeViewport{
  state?:NativeViewportState;
  private blocked=-1;
  private revealPlan?:{animation:number;scroller:HTMLElement;clearance:number};
  private sized=new Set<HTMLElement>();
  constructor(private root:HTMLElement,private fallback:()=>void,private stopFallback:()=>void){}
  get height(){const state=this.state;return state?state.bottom*(document.documentElement.clientWidth/state.width):undefined;}
  receive(value:unknown){
    if(!valid(value)||this.state&&value.sequence<=this.state.sequence)return;
    this.stopFallback();
    this.state=value;this.refresh();
    if(value.animating||value.phase==='end')this.avoid();
    else if(value.visible&&this.blocked!==value.animation)this.fallback();
  }
  refresh(){
    if(!this.state||window.visualViewport&&window.visualViewport.scale!==1)return;
    const height=this.height!;if(height<=0)return;
    // Avoid changing an inherited custom property for the entire article on
    // every animation frame. Resize only viewport containers during motion.
    const value=height+'px';
    for(const element of this.sized)if(!element.isConnected)this.sized.delete(element);
    for(const name of ['mobile-app','mobile-sheet-layer','mobile-media-viewer'])for(const node of document.getElementsByClassName(name)){
      const element=node as HTMLElement;if(element.style.height!==value)element.style.height=value;this.sized.add(element);
    }
    for(const node of document.getElementsByClassName('mobile-sheet')){
      const element=node as HTMLElement;if(element.classList.contains('mobile-media-viewer'))continue;
      const max=Math.max(0,height-24)+'px';if(element.style.maxHeight!==max)element.style.maxHeight=max;this.sized.add(element);
    }
    // Newly opened panels inherit the settled height before the next event.
    if(!this.state.animating&&this.root.style.getPropertyValue('--mobile-viewport-height')!==value)this.root.style.setProperty('--mobile-viewport-height',value);
    if(this.root.dataset.mobileViewport!=='native')this.root.dataset.mobileViewport='native';
  }
  interrupt(){if(this.state?.animating)this.blocked=this.state.animation;this.revealPlan=undefined;}
  avoid(){
    const state=this.state;
    if(!state||!state.visible||state.targetBottom>=state.startBottom||this.blocked===state.animation||window.visualViewport&&window.visualViewport.scale!==1)return;
    const target=viewportTarget(true);if(!target)return;
    const {scroller,documentView,rect}=target,box=scroller.getBoundingClientRect(),documentBox=documentView.getBoundingClientRect();
    const bottom=Math.min(box.bottom,documentBox.bottom,this.height!),top=Math.max(box.top,documentBox.top);
    const finalBottom=Math.min(box.bottom,documentBox.bottom,state.targetBottom*(document.documentElement.clientWidth/state.width));
    if(this.revealPlan?.animation!==state.animation||this.revealPlan.scroller!==scroller){
      this.revealPlan=undefined;
      if(rect.bottom>finalBottom+1)this.revealPlan={animation:state.animation,scroller,clearance:caretClearance(target)};
    }
    // The boundary already follows the system's interpolated IME insets.
    // Compensate only what this frame actually covers, never a future position
    // or a second independently timed animation.
    const clearance=this.revealPlan?Math.min(this.revealPlan.clearance,Math.max(0,finalBottom-top-rect.height-2))*state.progress:0;
    const boundary=bottom-clearance;
    if(bottom>top&&rect.height<bottom-top&&rect.bottom>boundary+1)scroller.scrollTop+=rect.bottom-boundary+2;
  }
  close(){for(const element of this.sized){element.style.removeProperty('height');element.style.removeProperty('max-height');}this.sized.clear();delete this.root.dataset.mobileViewport;}
}
