import {cmsFetch} from './cms-fetch';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const notice=(message:string,error=false)=>{const el=$('notice');el.textContent=message;el.classList.toggle('error',error);};
async function post(path:string,data:object={}){const response=await cmsFetch('/blog/admin/api/'+path+'/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Permintaan gagal.');return result;}
const auth=$<HTMLFormElement>('login');
if(auth)auth.addEventListener('submit',async e=>{e.preventDefault();const button=auth.querySelector('button')!;button.disabled=true;try{await post('login',Object.fromEntries(new FormData(auth)));auth.reset();location.href='/blog/admin/';}catch(error){notice((error as Error).message,true);}finally{button.disabled=false;}});
let resetToken=new URLSearchParams(location.hash.slice(1)).get('invite')||'';
if(resetToken&&$('invite-panel')){
 $('signin-panel').hidden=true;$('invite-panel').hidden=false;history.replaceState(null,'','/blog/admin/');
 post('invite/check',{token:resetToken}).then(info=>{$('invite-detail').textContent='Buat password baru untuk '+info.email+'.';$<HTMLInputElement>('invite-email').value=info.email;$('accept-invite').hidden=false;}).catch(e=>notice(e.message,true));
}else if(resetToken){notice('Keluar dari akun ini, lalu buka ulang link reset.');}
if($('accept-invite'))$<HTMLFormElement>('accept-invite').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement,values=Object.fromEntries(new FormData(form));if(values.password!==values.confirmation){notice('Ulangan password tidak sesuai.',true);return;}const button=form.querySelector('button')!;button.disabled=true;try{await post('invite/accept',{token:resetToken,password:values.password});resetToken='';form.reset();location.href='/blog/admin/';}catch(error){notice((error as Error).message,true);}finally{button.disabled=false;}};
