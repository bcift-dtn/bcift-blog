// Contextual link controls preserve the editor selection while the URL field has focus.
export function initLinkEditor(body, toolbarButton, onChange) {
 const doc=body.ownerDocument, win=doc.defaultView;
 const panel=doc.createElement('section');panel.id='article-link-editor';panel.className='link-editor';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Edit tautan artikel');
 panel.innerHTML='<form novalidate><div class="link-editor-heading"><strong>Tautan artikel</strong><button type="button" data-close aria-label="Tutup pengaturan tautan">×</button></div><p data-selected></p><label>Alamat tautan<input type="url" data-url placeholder="https://…" autocomplete="off" spellcheck="false" aria-describedby="article-link-error"/></label><p id="article-link-error" role="alert" hidden></p><div class="link-editor-actions"><button type="submit" class="primary">Simpan tautan</button><button type="button" data-remove>Hapus tautan</button></div></form>';
 doc.body.append(panel);
 const input=panel.querySelector('[data-url]'),error=panel.querySelector('[role="alert"]'),remove=panel.querySelector('[data-remove]');
 toolbarButton.setAttribute('aria-controls',panel.id);toolbarButton.setAttribute('aria-expanded','false');
 let range=null,anchor=null,frame=0,ignoreSelection=false;
 const closestLink=node=>{const element=node?.nodeType===1?node:node?.parentElement;const link=element?.closest('a');return link&&body.contains(link)?link:null;};
 const editable=()=>!body.closest('form')?.inert;
 function hide(){panel.hidden=true;toolbarButton.setAttribute('aria-expanded','false');}
 function position(){
  if(panel.hidden||!range)return;
  const rect=anchor?.getBoundingClientRect?.()??range.getBoundingClientRect?.()??body.getBoundingClientRect();
  const width=Math.min(360,Math.max(0,win.innerWidth-24));panel.style.width=width+'px';
  panel.style.left=Math.max(12,Math.min(rect.left,win.innerWidth-width-12))+'px';
  const height=panel.offsetHeight||230;
  const top=rect.bottom+10;panel.style.top=Math.max(12,Math.min(top+height<=win.innerHeight?top:rect.top-height-10,win.innerHeight-height-12))+'px';
 }
 function capture(allowCollapsed=true){
  const selection=win.getSelection();
  if(!editable()||!selection?.rangeCount)return false;
  const selected=selection.getRangeAt(0);
  if(!body.contains(selected.startContainer)||!body.contains(selected.endContainer))return false;
  const start=closestLink(selected.startContainer),end=closestLink(selected.endContainer);
  anchor=start&&start===end?start:null;
  if(selected.collapsed&&(!anchor||!allowCollapsed))return false;
  range=selected.cloneRange();return true;
 }
 function show(focus=false){
  ignoreSelection=false;
  input.value=anchor?.getAttribute('href')||'';error.hidden=true;remove.hidden=!anchor;
  panel.querySelector('[data-selected]').textContent=(anchor?.textContent||range?.toString()||'').slice(0,100);
  panel.hidden=false;toolbarButton.setAttribute('aria-expanded','true');position();
  if(focus){input.focus({preventScroll:true});input.select();}
 }
 function refresh(){if(ignoreSelection||panel.contains(doc.activeElement))return;if(capture(false))show();else hide();}
 function schedule(){win.cancelAnimationFrame(frame);frame=win.requestAnimationFrame(refresh);}
 function restore(){body.focus({preventScroll:true});const selection=win.getSelection();selection.removeAllRanges();selection.addRange(range);}
 function finish(){ignoreSelection=true;hide();const selection=win.getSelection();selection?.collapseToEnd();onChange();}
 toolbarButton.onmousedown=e=>e.preventDefault();toolbarButton.onclick=()=>{if(capture())show(true);};
 body.addEventListener('click',event=>{const link=closestLink(event.target);if(!link||!editable())return;event.preventDefault();anchor=link;range=doc.createRange();range.selectNodeContents(link);show(true);});
 body.addEventListener('mouseup',()=>{ignoreSelection=false;refresh();});body.addEventListener('keyup',event=>{if(event.key!=='Escape'){ignoreSelection=false;refresh();}});
 doc.addEventListener('selectionchange',schedule);
 body.addEventListener('input',()=>{range=null;anchor=null;hide();});
 doc.addEventListener('pointerdown',event=>{if(!panel.contains(event.target)&&!body.contains(event.target)&&!toolbarButton.contains(event.target))hide();});
 body.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();if(capture())show(true);}});
 panel.querySelector('[data-close]').onclick=()=>{ignoreSelection=true;hide();if(range)restore();};
 const escape=event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();ignoreSelection=true;hide();if(range)restore();}};panel.addEventListener('keydown',escape);body.addEventListener('keydown',escape);
 panel.querySelector('form').addEventListener('submit',event=>{
  event.preventDefault();let url;
  try{url=new URL(input.value.trim());if(!['https:','http:'].includes(url.protocol))throw Error();}
  catch{error.textContent='Masukkan alamat lengkap dengan https:// atau http://.';error.hidden=false;input.focus();return;}
  if(!range||!body.contains(range.commonAncestorContainer)||!editable()){hide();return;}
  restore();
  if(anchor?.isConnected){anchor.setAttribute('href',url.href);}
  else if(!doc.execCommand?.('createLink',false,url.href)){
   const link=doc.createElement('a');link.href=url.href;link.append(range.extractContents());range.insertNode(link);range.selectNodeContents(link);
  }
  finish();
 });
 remove.onclick=()=>{
  if(!anchor?.isConnected||!editable())return;
  range.selectNodeContents(anchor);restore();const link=anchor;anchor=null;
  if(!doc.execCommand?.('unlink',false))link.replaceWith(...link.childNodes);
  finish();
 };
 win.addEventListener('scroll',position,{passive:true});win.addEventListener('resize',position);
 return {hide};
}
