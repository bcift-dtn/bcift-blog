// Toolbar focus must not move formatting commands to a different paragraph.
export function initEditorToolbar(body,buttons,onChange){
 const doc=body.ownerDocument,win=doc.defaultView;
 let savedRange=null;
 function capture(){
  const selection=win.getSelection();if(!selection?.rangeCount)return false;
  const range=selection.getRangeAt(0);
  if(!body.contains(range.startContainer)||!body.contains(range.endContainer))return false;
  savedRange=range.cloneRange();return true;
 }
 doc.addEventListener('selectionchange',capture);
 for(const event of ['keyup','mouseup','input'])body.addEventListener(event,capture);
 for(const button of buttons){
  const preserve=event=>{capture();event.preventDefault();};
  button.addEventListener('mousedown',preserve);
  button.addEventListener('pointerdown',preserve);
  button.addEventListener('click',()=>{
   capture();
   if(!savedRange||!body.contains(savedRange.startContainer)||!body.contains(savedRange.endContainer)||body.closest('form')?.inert)return;
   body.focus();const selection=win.getSelection();selection.removeAllRanges();selection.addRange(savedRange);
   doc.execCommand(button.dataset.command||'formatBlock',false,button.dataset.block);
   capture();onChange();
  });
 }
 return {reset(){savedRange=null;}};
}
