import {useLayoutEffect,useRef,useState} from 'react';

export type MobileDocumentMode='edit'|'read'|'source';

/** View choices belong to open documents, never to persisted workspace data. */
export function useMobileDocumentMode(root:string,active:string,tabs:string[]){
  const [mode,setMode]=useState<MobileDocumentMode>('read');
  const choices=useRef(new Map<string,MobileDocumentMode>()),workspace=useRef(root);
  useLayoutEffect(()=>{
    if(workspace.current!==root){choices.current.clear();workspace.current=root;}
    for(const path of choices.current.keys())if(!tabs.includes(path))choices.current.delete(path);
    setMode(choices.current.get(active)||'read');
  },[root,active,tabs]);
  const select=(value:MobileDocumentMode)=>{if(active)choices.current.set(active,value);setMode(value);};
  const rename=(from:string,to:string)=>{
    choices.current=new Map([...choices.current].map(([path,value])=>[
      path===from||path.startsWith(from+'/')?to+path.slice(from.length):path,value
    ]));
  };
  return{mode,select,rename};
}
