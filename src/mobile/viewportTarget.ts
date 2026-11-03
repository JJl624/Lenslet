export function viewportTarget(nativeMode=false){
  const active=document.activeElement;
  if(!(active instanceof HTMLElement)||active.closest('.excalidraw'))return;
  if(active.classList.contains('ProseMirror-hideselection'))return;
  const documentView=active.closest<HTMLElement>('.mobile-document')
    ||(nativeMode?active.closest<HTMLElement>('.mobile-sheet-content,.mobile-home-content'):null);if(!documentView)return;
  let rect:DOMRect;
  if(active.matches('input,textarea'))rect=active.getBoundingClientRect();
  else{
    const selection=document.getSelection();
    if(!active.isContentEditable||!selection?.isCollapsed||!selection.rangeCount||!active.contains(selection.anchorNode))return;
    if(!nativeMode&&active.closest('.source-editor,.milkdown-code-block'))return;
    rect=selection.getRangeAt(0).getBoundingClientRect();
    // Gecko reports a zero rectangle for a caret at <p><br></p>, including
    // the last empty line. Measure that one empty line without inserting DOM.
    if(!rect.height){
      const anchor=selection.anchorNode,element=anchor instanceof Element?anchor:anchor?.parentElement;
      const line=element?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,.cm-line');
      if(line&&active.contains(line)&&!line.textContent){const box=line.getBoundingClientRect();if(box.height)rect=box;}
    }
  }
  if(!rect.height)return;
  const scroller=nativeMode&&active.closest('.source-editor')?active.closest<HTMLElement>('.cm-scroller')||documentView:documentView;
  return{active,documentView,scroller,rect};
}

/** Keep two lines of context above the IME, using the current text's metrics. */
export function caretClearance(target:NonNullable<ReturnType<typeof viewportTarget>>){
  const selection=document.getSelection(),anchor=selection?.anchorNode;
  const element=target.active.matches('input,textarea')?target.active:anchor instanceof Element?anchor:anchor?.parentElement||target.active;
  const style=getComputedStyle(element),line=Number.parseFloat(style.lineHeight)||Number.parseFloat(style.fontSize)*1.5||24;
  return line*2;
}
