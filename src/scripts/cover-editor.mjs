import {readImageFocus,defaultImageFocus} from '../lib/image-focus.mjs';
export function initCoverEditor(doc,onChange){
 const get=id=>doc.getElementById(id),dialog=get('cover-dialog'),canvas=get('cover-canvas'),image=get('cover-crop-preview'),open=get('adjust-cover'),thumbnailButton=get('adjust-thumbnail'),fit=get('thumbnail-fit');
 let focus=defaultImageFocus(),mode='desktop',drag=null;
 const controls={x:get('cover-x'),y:get('cover-y')};
 function render(){
  canvas.dataset.mode=mode;image.style.objectPosition=focus[mode].x+'% '+focus[mode].y+'%';image.style.objectFit=mode==='thumbnail'?focus.thumbnail.fit:'cover';
  canvas.querySelector('.wave').hidden=mode==='thumbnail';get('thumbnail-fit-control').hidden=mode!=='thumbnail';fit.value=focus.thumbnail.fit;
  get('cover-mode-hint').textContent=mode==='thumbnail'?'Pratinjau thumbnail halaman blog. Pengaturan ini tidak mengubah banner artikel.':'Area di bawah gelombang tidak tampil pada artikel. Periksa desktop dan ponsel; potongan foto dapat sedikit berbeda mengikuti lebar layar.';
  for(const axis of ['x','y']){controls[axis].value=String(focus[mode][axis]);get('cover-'+axis+'-value').textContent=Math.round(focus[mode][axis])+'%';}
  doc.querySelectorAll('[data-cover-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.coverMode===mode)));
 }
 function hide(){if(dialog.close)dialog.close();else dialog.open=false;}
 function show(nextMode){if(open.disabled)return;mode=nextMode;render();if(dialog.showModal)dialog.showModal();else dialog.open=true;}
 open.onclick=()=>show('desktop');thumbnailButton.onclick=()=>show('thumbnail');
 fit.addEventListener('change',()=>{focus.thumbnail.fit=fit.value;render();onChange();});
 for(const id of ['close-cover','done-cover'])get(id).onclick=hide;
 doc.querySelectorAll('[data-cover-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.coverMode;render();});
 for(const axis of ['x','y'])controls[axis].addEventListener('input',()=>{focus[mode][axis]=Number(controls[axis].value);render();onChange();});
 get('reset-cover').onclick=()=>{focus[mode]=defaultImageFocus()[mode];render();onChange();};
 canvas.addEventListener('pointerdown',event=>{
  if(event.button!==0||!image.naturalWidth||!image.naturalHeight)return;
  const rect=canvas.getBoundingClientRect(),scale=(mode==='thumbnail'&&focus.thumbnail.fit==='contain'?Math.min:Math.max)(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,initial:{...focus[mode]},overflowX:image.naturalWidth*scale-rect.width,overflowY:image.naturalHeight*scale-rect.height};
  canvas.setPointerCapture?.(event.pointerId);event.preventDefault();
 });
 canvas.addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  for(const [axis,delta,overflow]of [['x',event.clientX-drag.x,drag.overflowX],['y',event.clientY-drag.y,drag.overflowY]])if(Math.abs(overflow)>1)focus[mode][axis]=Math.round(Math.max(0,Math.min(100,drag.initial[axis]-delta/overflow*100))*10)/10;
  render();onChange();
 });
 for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,()=>{drag=null;});
 render();
 return {getValue:()=>readImageFocus(focus),setValue:value=>{focus={...defaultImageFocus(),...readImageFocus(value)};mode='desktop';render();hide();},setImage:url=>{if(url)image.src=url;else image.removeAttribute('src');open.disabled=!url;thumbnailButton.disabled=!url;},hide};
}
