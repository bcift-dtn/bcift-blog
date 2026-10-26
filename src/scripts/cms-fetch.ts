// CSRF protection is tied to the current browser, so proxy/tunnel host rewriting is harmless.
let refresh:Promise<string>|null=null;
async function token(){
 const meta=document.querySelector<HTMLMetaElement>('meta[name="bcift-csrf"]');
 if(meta?.content)return meta.content;
 return refreshToken();
}
async function refreshToken(){
 if(!refresh)refresh=fetch('/blog/admin/api/csrf/',{credentials:'same-origin',cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('Tidak dapat menyambung ke server. Muat ulang halaman.');const data=await response.json();let meta=document.querySelector<HTMLMetaElement>('meta[name="bcift-csrf"]');if(!meta){meta=document.createElement('meta');meta.name='bcift-csrf';document.head.append(meta);}meta.content=data.token;return data.token;}).finally(()=>{refresh=null;});
 return refresh;
}
export async function cmsFetch(url:string,options:RequestInit={}){
 if(new URL(url,location.href).origin!==location.origin)throw new Error('Alamat dashboard tidak valid.');
 const mutable=!['GET','HEAD'].includes((options.method||'GET').toUpperCase());
 const headers=new Headers(options.headers);
 if(mutable)headers.set('X-BCIFT-CSRF',await token());
 const send=()=>fetch(url,{...options,headers,credentials:'same-origin'});
 let response=await send();
 if(mutable&&response.status===403){const error=await response.clone().json().catch(()=>null);if(error?.code==='CSRF_EXPIRED'){headers.set('X-BCIFT-CSRF',await refreshToken());response=await send();}}
 return response;
}
