import {initCoverEditor} from './cover-editor.mjs';
import {initLinkEditor} from './link-editor.mjs';
import {readCategories,categoryLabel} from '../lib/categories.mjs';
import {isDestination} from '../lib/destination-trips.mjs';
import {mediaUrl} from '../lib/media-url.mjs';
import {createPasteFormatter} from './paste-content.mjs';
import {cmsFetch} from './cms-fetch';
const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const notice=(message:string,error=false)=>{ $('notice').textContent=message;$('notice').classList.toggle('error',error); };
async function api(path:string,options:RequestInit={}){
 const response=await cmsFetch('/blog/admin/api/'+path+'/',{...options,headers:{...(options.body instanceof ArrayBuffer?{}:{'Content-Type':'application/json'}),...options.headers}});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Permintaan gagal.');return data;
}
if($('logout')){
 const isAdmin=document.querySelector<HTMLElement>('.studio')?.dataset.role==='admin';
 if(!isAdmin)$('publish').hidden=true;
 type Article={id:number;title:string;slug:string;body:string;status:string;updated_at:string;[key:string]:any};
 let articles:Article[]=[],current:Article|null=null,dirty=false,busy=false;
 let imageTarget='cover',savedRange:Range|null=null;
 const form=$<HTMLFormElement>('article-form'),body=$('body');
 const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const coverEditor=initCoverEditor(document,markDirty);
 const slugify=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
 const categoryInputs=[...form.querySelectorAll<HTMLInputElement>('input[name="categories"]')];
 const selectedCategories=()=>categoryInputs.filter(input=>input.checked).map(input=>input.value);
 function destinationFields(){categoryInputs[0].setCustomValidity(selectedCategories().length?'':'Pilih minimal satu kategori artikel.');const visible=isDestination(selectedCategories());$('destination-panel').hidden=!visible;document.querySelectorAll<HTMLFieldSetElement>('.destination-row').forEach(row=>row.disabled=!visible);}
 function addDestination(trip?:{location:string;minutes:number;transport:string}){
  const row=($<HTMLTemplateElement>('destination-template').content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  if(trip)for(const key of ['location','minutes','transport'])row.querySelector<HTMLInputElement>('[data-trip="'+key+'"]')!.value=String(trip[key as keyof typeof trip]);
  row.querySelector<HTMLButtonElement>('.remove-destination')!.onclick=()=>{row.remove();changed();};$('destination-trips').append(row);destinationFields();
 }
 function readTrips(){return [...$('destination-trips').querySelectorAll<HTMLElement>('.destination-row')].map(row=>({location:row.querySelector<HTMLInputElement>('[data-trip="location"]')!.value,minutes:row.querySelector<HTMLInputElement>('[data-trip="minutes"]')!.value,transport:row.querySelector<HTMLSelectElement>('[data-trip="transport"]')!.value})).filter(trip=>trip.location.trim()||trip.minutes);}
 function snapshot(){return JSON.stringify({...Object.fromEntries(new FormData(form)),body:body.innerHTML,image_focus:coverEditor.getValue(),categories:selectedCategories(),category:selectedCategories()[0],destination_trips:isDestination(selectedCategories())?readTrips():current?.destination_trips??[]});}
 $('add-destination').onclick=()=>{if($('destination-trips').children.length>=20){notice('Maksimal 20 lokasi tujuan per artikel.',true);return;}addDestination();changed();};
 $('category-options').addEventListener('change',destinationFields);
 function markDirty(){dirty=true;$('save-state').textContent='Ada perubahan belum disimpan';}
 function changed(){markDirty();seo();}
 function seo(){
  const title=field('seo_title').value||field('title').value,description=field('description').value;
  const words=body.innerText.trim().split(/\s+/).filter(Boolean).length;
  $('word-count').textContent=words+' kata';$('description-count').textContent=description.length+' karakter · umumnya sekitar 140–160 karakter';
  $('serp-title').textContent=(title||'Judul artikel')+' | BCIFT';$('serp-description').textContent=description||'Ringkasan artikel akan ditampilkan di sini.';
  const keyword=field('keywords').value.split(',')[0].trim().toLowerCase();
  const checks:[[boolean,string],...Array<[boolean,string]>]=[[title.length>=25&&title.length<=65,'Judul SEO ringkas (sekitar 25–65 karakter)'],[description.length>=100&&description.length<=160,'Meta description menjelaskan isi artikel'],[!!body.querySelector('h2'),'Ada subjudul H2 untuk membantu pembaca'],[!!keyword&&body.innerText.toLowerCase().includes(keyword),'Kata kunci fokus muncul dalam isi'],[!!field('image_alt').value.trim(),'Alt gambar utama sudah diisi']];
  $('seo-checks').replaceChildren(...checks.map(([ok,text])=>{const li=document.createElement('li');li.textContent=(ok?'✓ ':'○ ')+text;return li;}));
 }
 function list(){
  $('total').textContent=String(articles.length);$('published').textContent=String(articles.filter(a=>a.status==='published').length);$('drafts').textContent=String(articles.filter(a=>a.status==='draft').length);
  const query=$<HTMLInputElement>('search').value.toLowerCase(),status=$<HTMLSelectElement>('status').value;
  const rows=articles.filter(a=>a.title.toLowerCase().includes(query)&&(status==='all'||status===a.status)).map(article=>{
   const row=document.createElement('div');row.className='article-row';const info=document.createElement('div'),title=document.createElement('h3'),meta=document.createElement('small'),actions=document.createElement('div'),badge=document.createElement('span'),edit=document.createElement('button');
   title.textContent=article.title;meta.textContent=readCategories(article.categories,article.category).map(categoryLabel).join(' · ')+' · Diperbarui '+new Date(article.updated_at).toLocaleString('id-ID');badge.className='badge'+(article.status==='published'?' live':'');badge.textContent=article.status==='published'?'Terbit':'Draft';edit.textContent='Edit artikel';edit.onclick=()=>open(article);info.append(title,meta);actions.append(badge,edit);row.append(info,actions);return row;
  });
  $('articles').replaceChildren(...rows);if(!rows.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=articles.length?'Tidak ada artikel yang cocok.':'Belum ada artikel. Mulai dengan tombol “Artikel baru”.';$('articles').append(empty);}
 }
 async function load(){articles=await api('articles');list();}
 function cover(){const img=$<HTMLImageElement>('cover-preview');field('image').value=mediaUrl(field('image').value);img.src=field('image').value;img.hidden=!field('image').value;coverEditor.setImage(field('image').value);}
 function open(article:Article|null){
  linkEditor.hide();coverEditor.setValue(article?.image_focus);current=article;form.reset();for(const name of ['title','slug','description','author','image','image_alt','seo_title','keywords'])if(article)field(name).value=article[name]||'';
  const chosen=article?readCategories(article.categories,article.category):['Travel Guide'];categoryInputs.forEach(input=>input.checked=chosen.includes(input.value));
  $('destination-trips').replaceChildren();for(const trip of article?.destination_trips??[])addDestination(trip);destinationFields();
  form.inert=!isAdmin&&article?.status==='published';$<HTMLButtonElement>('save-draft').disabled=!isAdmin&&article?.status==='published';
  body.innerHTML=article?.body||'';dirty=false;$('library').hidden=true;$('editor-view').hidden=false;$('editor-heading').textContent=article?'Edit artikel':'Artikel baru';$('save-state').textContent=article?(article.status==='published'?'Terbit':'Draft')+' · Tersimpan':'Belum disimpan';$('delete').hidden=!article||!isAdmin;
  const preview=$<HTMLAnchorElement>('preview');preview.hidden=!article;preview.href=article?'/blog/'+article.slug+'/?preview=1':'#';$('publish').textContent=article?.status==='published'?'Simpan perubahan':'Terbitkan';cover();seo();window.scrollTo({top:0,behavior:'instant'});
 }
 async function save(status:string){
  if(busy||!form.reportValidity())return;busy=true;const savedSnapshot=snapshot();
  document.querySelectorAll<HTMLButtonElement>('#save-draft,#publish').forEach(b=>b.disabled=true);
  try{const result=await api('articles',{method:'POST',body:JSON.stringify({...JSON.parse(savedSnapshot),id:current?.id,updated_at:current?.updated_at,status})});current=result;const unchanged=savedSnapshot===snapshot();dirty=!unchanged;if(unchanged)open(result);else{const preview=$<HTMLAnchorElement>('preview');preview.hidden=false;preview.href='/blog/'+result.slug+'/?preview=1';$('save-state').textContent='Versi tersimpan; perubahan terbaru belum disimpan';}await load();notice(status==='published'?'Artikel diterbitkan. Blog dan sitemap sudah diperbarui.':'Draft berhasil disimpan.');}catch(error){notice((error as Error).message,true);}finally{busy=false;document.querySelectorAll<HTMLButtonElement>('#save-draft,#publish').forEach(b=>b.disabled=false);}
 }
 $('new').onclick=()=>open(null);$('back').onclick=()=>{if(dirty&&!confirm('Tinggalkan perubahan yang belum disimpan?'))return;linkEditor.hide();dirty=false;$('editor-view').hidden=true;$('library').hidden=false;};
 $('logout').onclick=async()=>{if(dirty&&!confirm('Keluar tanpa menyimpan perubahan?'))return;try{await api('logout',{method:'POST',body:'{}'});dirty=false;location.reload();}catch(e){notice((e as Error).message,true);}};
 $('search').addEventListener('input',list);$('status').addEventListener('change',list);form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('input',changed);body.addEventListener('input',changed);
 $('title').addEventListener('input',()=>{if(!current)field('slug').value=slugify(field('title').value);});$('image').addEventListener('change',cover);
 $('save-draft').onclick=()=>{if(current?.status==='published'&&!confirm('Retarik artikel dari publik dan simpan sebagai draft?'))return;save('draft');};$('publish').onclick=()=>save('published');
 $('delete').onclick=async()=>{if(!current||!confirm('Hapus artikel “'+current.title+'”? Tindakan ini tidak bisa dibatalkan.'))return;try{await api('articles/'+current.id,{method:'DELETE'});dirty=false;$('back').click();await load();notice('Artikel dihapus.');}catch(e){notice((e as Error).message,true);}};
 document.querySelectorAll<HTMLButtonElement>('[data-command],[data-block]').forEach(button=>{button.onmousedown=e=>e.preventDefault();button.onclick=()=>{body.focus();document.execCommand(button.dataset.command||'formatBlock',false,button.dataset.block);changed();};});
 const linkEditor=initLinkEditor(body,$('insert-link'),changed);
 const formatPaste=createPasteFormatter(window);
 body.addEventListener('paste',e=>{
  if(!e.clipboardData)return;
  e.preventDefault();
  try{
   const html=formatPaste({html:e.clipboardData.getData('text/html'),text:e.clipboardData.getData('text/plain')});
   if(!html)return;
   body.focus();
   if(!document.execCommand('insertHTML',false,html)){
    const selection=window.getSelection();
    if(selection?.rangeCount&&body.contains(selection.anchorNode)){
     const range=selection.getRangeAt(0);range.deleteContents();const fragment=range.createContextualFragment(html);const last=fragment.lastChild;range.insertNode(fragment);if(last){range.setStartAfter(last);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
    }else body.insertAdjacentHTML('beforeend',html);
   }
   changed();
  }catch(error){notice((error as Error).message,true);}
 });
 $('suggest').onclick=()=>{const ignored=new Set('yang dan untuk dari dengan atau ke di the a an to from with and for of in how'.split(' '));const words=field('title').value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,'').split(/\s+/).filter(w=>w.length>2&&!ignored.has(w));field('keywords').value=[...new Set([words.slice(0,4).join(' '),...words.slice(0,5)])].filter(Boolean).join(', ');changed();};
 $('upload-cover').onclick=()=>{imageTarget='cover';$<HTMLInputElement>('file').click();};$('body-image').onmousedown=e=>e.preventDefault();$('body-image').onclick=()=>{imageTarget='body';const selection=window.getSelection();savedRange=selection?.rangeCount&&body.contains(selection.anchorNode)?selection.getRangeAt(0).cloneRange():null;$<HTMLInputElement>('file').click();};
 $('file').addEventListener('change',async()=>{const input=$<HTMLInputElement>('file'),file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024){notice('Gambar maksimal 5 MB.',true);return;}try{notice('Mengupload gambar…');const result=await api('upload',{method:'POST',body:await file.arrayBuffer(),headers:{'Content-Type':file.type}});if(imageTarget==='cover'){field('image').value=result.url;cover();}else{const alt=prompt('Deskripsi gambar (alt):')||'';const img=document.createElement('img');img.src=result.url;img.alt=alt;body.focus();if(savedRange){const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(savedRange);}document.execCommand('insertHTML',false,img.outerHTML);}changed();notice('Gambar berhasil diupload.');}catch(e){notice((e as Error).message,true);}finally{input.value='';}});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
 load().catch(e=>notice(e.message,true));
}
