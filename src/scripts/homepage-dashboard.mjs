import {cmsFetch} from './cms-fetch.ts';
export function initHomepageDashboard(doc,{fetcher=cmsFetch}={}){
 const form=doc.getElementById('homepage-form');if(!form)return;
 const radios=[...form.querySelectorAll('[name="homepage-mode"]')],slots=[...form.querySelectorAll('[data-homepage-slot]')],status=doc.getElementById('homepage-status'),save=doc.getElementById('homepage-save');let data=null,busy=false,dirty=false;
 const mode=()=>radios.find(r=>r.checked)?.value||'automatic';
 function preview(){
  doc.getElementById('homepage-slots').hidden=mode()!=='manual';slots.forEach((slot,i)=>slot.disabled=mode()!=='manual'||i>=(data?.available.length??0));
  if(!data)return;const chosen=mode()==='manual'?slots.map(s=>data.available.find(a=>a.slug===s.value)).filter(Boolean):[];
  const articles=[...chosen,...data.available.filter(a=>!chosen.some(p=>p.slug===a.slug))].slice(0,3);
  const nodes=articles.map(a=>{const card=doc.createElement('article'),img=doc.createElement('img'),heading=doc.createElement('h3'),meta=doc.createElement('p');if(a.image){img.src=a.image;img.alt=a.imageAlt;img.style.objectFit=a.thumbnail.fit;img.style.objectPosition=a.thumbnail.x+'% '+a.thumbnail.y+'%';card.append(img);}heading.textContent=a.title;meta.textContent=a.category;card.append(heading,meta);return card;});
  doc.getElementById('homepage-preview').replaceChildren(...nodes);if(!nodes.length)doc.getElementById('homepage-preview').textContent='Belum ada artikel terbit.';
 }
 function apply(result){data=result;radios.forEach(r=>r.checked=r.value===data.settings.mode);for(const [i,slot]of slots.entries()){slot.replaceChildren(new doc.defaultView.Option('Pilih artikel terbit',''));for(const a of data.available)slot.append(new doc.defaultView.Option(a.title,a.slug));slot.value=data.settings.slugs[i]||'';}dirty=false;preview();}
 async function request(options){const response=await fetcher('/blog/admin/api/homepage/',options),result=await response.json();if(!response.ok)throw Error(result.error||'Pengaturan belum dapat dimuat.');return result;}
 async function load(){if(busy||dirty)return;busy=true;save.disabled=true;status.textContent='Memuat pengaturan…';try{apply(await request());status.textContent='';}catch(error){status.textContent=error.message;}finally{busy=false;save.disabled=!data;}}
 form.addEventListener('change',()=>{dirty=true;status.textContent='Perubahan belum disimpan.';preview();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!data)return;const slugs=mode()==='manual'?slots.filter(s=>!s.disabled).map(s=>s.value):[];if(mode()==='manual'&&(!slugs.length||slugs.some(s=>!s)||new Set(slugs).size!==slugs.length)){status.textContent='Pilih artikel berbeda pada setiap posisi.';return;}busy=true;save.disabled=true;for(const el of form.elements)if(el!==save)el.disabled=true;try{apply(await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:mode(),slugs})}));status.textContent='Pilihan artikel halaman utama berhasil disimpan.';}catch(error){status.textContent=error.message;}finally{busy=false;save.disabled=false;radios.forEach(r=>r.disabled=false);preview();}});
 doc.addEventListener('studio:view',event=>{if(event.detail.view==='homepage')load();});return {load};
}
if(typeof document!=='undefined')initHomepageDashboard(document);
