import {useEffect,useRef,type RefObject} from 'react';
import type {EditorHandle} from '../editorTypes';
import {revealReadingLocation} from '../documents/readingLocation';
import {caretRangeAt} from '../domCaret';

export function readingOffset(scope:HTMLElement,source:string){
  const box=scope.getBoundingClientRect(),y=box.top+24;
  const blocks=[...scope.querySelectorAll<HTMLElement>('[data-source-from]')].filter(node=>{const rect=node.getBoundingClientRect();return rect.height&&rect.bottom>y&&rect.top<box.bottom;});
  blocks.sort((a,b)=>Math.max(0,a.getBoundingClientRect().top-y)-Math.max(0,b.getBoundingClientRect().top-y)
    ||Number(a.dataset.sourceTo)-Number(a.dataset.sourceFrom)-(Number(b.dataset.sourceTo)-Number(b.dataset.sourceFrom)));
  const block=blocks[0];if(!block)return 0;
  const from=Number(block.dataset.sourceFrom),to=Number(block.dataset.sourceTo),rect=block.getBoundingClientRect();
  const range=caretRangeAt(scope.ownerDocument,rect.left+Math.min(36,rect.width/2),Math.max(y,rect.top+2));
  if(!range||!block.contains(range.startContainer))return from;
  const prefix=range.cloneRange();prefix.selectNodeContents(block);prefix.setEnd(range.startContainer,range.startOffset);
  let offset=from;
  if(block.matches('pre')||block.querySelector('pre code'))offset=source.indexOf('\n',from)+1;
  for(const char of prefix.toString()){const at=source.indexOf(char,offset);if(at<0||at>=to)break;offset=at+char.length;}
  return offset;
}

export function useMobileDocumentPosition(scope:RefObject<HTMLDivElement|null>,editor:RefObject<EditorHandle|null>,root:string,path:string,mode:string,enabled:boolean,tabs:string[],source:string,epoch:number){
  const positions=useRef(new Map<string,{offset:number;search?:boolean}>()),state=useRef({path,mode,source});state.current={path,mode,source};
  const remember=(target?:{path:string;offset:number})=>{
    if(target){positions.current.set(target.path,{offset:target.offset,search:true});return;}
    const current=state.current;if(!scope.current||!current.path)return;
    const offset=current.mode==='read'?readingOffset(scope.current,current.source):editor.current?.visibleOffset?.();
    if(offset!==undefined)positions.current.set(current.path,{offset});
  };
  useEffect(()=>{positions.current.clear();},[root]);
  useEffect(()=>{for(const file of positions.current.keys())if(!tabs.includes(file))positions.current.delete(file);},[tabs]);
  useEffect(()=>{
    const node=scope.current,position=positions.current.get(path);if(!enabled||!node||!position)return;
    const {offset,search}=position;
    let done=false,frame=0;
    const cancel=()=>{done=true;cancelAnimationFrame(frame);};
    const restore=()=>{
      if(done)return;const view=node.querySelector<HTMLElement>('.reading-view,.source-editor,.editor-host');
      if(!view||view.hasAttribute('data-editor-pending'))return;
      if(mode!=='read'&&editor.current?.visibleOffset?.()===undefined){cancelAnimationFrame(frame);frame=requestAnimationFrame(restore);return;}
      done=true;frame=requestAnimationFrame(()=>{
        if(mode==='read'){
          const blocks=[...view.querySelectorAll<HTMLElement>('[data-source-from]')];
          blocks.sort((a,b)=>{const distance=(n:HTMLElement)=>Math.max(Number(n.dataset.sourceFrom)-offset,offset-Number(n.dataset.sourceTo),0);return distance(a)-distance(b)||(Number(a.dataset.sourceTo)-Number(a.dataset.sourceFrom))-(Number(b.dataset.sourceTo)-Number(b.dataset.sourceFrom));});
          if(blocks[0]){
            const closed=blocks[0].closest<HTMLDetailsElement>('details:not([open])');
            if(closed&&!search){node.scrollTop+=closed.getBoundingClientRect().top-node.getBoundingClientRect().top-24;}
            else revealReadingLocation(blocks[0],source,offset,{top:24,focus:false});
          }
        }else editor.current?.scrollToOffset?.(offset,{focus:false,top:24});
      });
    };
    const observer=new MutationObserver(restore);observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['data-editor-pending']});
    const inputEvents=['keydown','beforeinput','compositionstart'] as const;
    node.addEventListener('pointerdown',cancel,{once:true});node.addEventListener('wheel',cancel,{once:true,passive:true});
    for(const event of inputEvents)node.addEventListener(event,cancel,{once:true,capture:true});
    restore();
    return()=>{cancel();observer.disconnect();node.removeEventListener('pointerdown',cancel);node.removeEventListener('wheel',cancel);for(const event of inputEvents)node.removeEventListener(event,cancel,true);};
  },[path,mode,enabled,epoch]);
  return remember;
}
