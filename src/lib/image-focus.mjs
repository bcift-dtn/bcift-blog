export const defaultImageFocus=()=>({desktop:{x:50,y:60},mobile:{x:50,y:60},thumbnail:{x:50,y:50,fit:'cover'}});
export function validateImageFocus(value){
 if(!value||typeof value!=='object')throw new Error('Posisi gambar tidak valid.');
 const result={};for(const mode of ['desktop','mobile',...(value.thumbnail===undefined?[]:['thumbnail'])]){
  result[mode]={};for(const axis of ['x','y']){
   const number=value[mode]?.[axis];if(typeof number!=='number'||!Number.isFinite(number)||number<0||number>100)throw new Error('Posisi gambar harus antara 0 dan 100.');
   result[mode][axis]=Math.round(number*10)/10;
  }
 }if(result.thumbnail){const fit=value.thumbnail.fit??'cover';if(!['cover','contain'].includes(fit))throw new Error('Pilih tampilan thumbnail yang tersedia.');result.thumbnail.fit=fit;}return result;
}
export function readImageFocus(value){try{return validateImageFocus(typeof value==='string'?JSON.parse(value):value);}catch{return defaultImageFocus();}}

export function thumbnailFocus(value){return readImageFocus(value).thumbnail??defaultImageFocus().thumbnail;}
export function thumbnailStyle(value){const focus=thumbnailFocus(value);return 'object-position:'+focus.x+'% '+focus.y+'%;object-fit:'+focus.fit;}
