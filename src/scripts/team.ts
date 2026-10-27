import {cmsFetch} from './cms-fetch';
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
async function request(path:string,data?:object){const response=await cmsFetch('/blog/admin/api/'+path+'/',data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});const result=await response.json();if(!response.ok)throw new Error(result.error||'Permintaan gagal.');return result;}
const error=(e:Error)=>{$('notice').textContent=e.message;$('notice').classList.add('error');};
function link(token:string){const field=$<HTMLTextAreaElement>('invite-link');field.value=location.origin+'/blog/admin/#invite='+token;$('invite-result').hidden=false;field.focus();field.select();}
function row(title:string,detail:string){const el=document.createElement('div');el.className='team-row';const info=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small'),controls=document.createElement('div');strong.textContent=title;small.textContent=detail;info.append(strong,small);controls.className='controls';el.append(info,controls);return {el,controls};}
function action(text:string,fn:()=>Promise<unknown>){const button=document.createElement('button');button.textContent=text;button.onclick=async()=>{button.disabled=true;try{await fn();}catch(e){error(e as Error);}finally{button.disabled=false;}};return button;}
async function load(){
 const [team,session,audit]=await Promise.all([request('team'),request('session'),request('audit')]);
 $('members').replaceChildren(...team.members.map((member:any)=>{const {el,controls}=row(member.email,(member.role==='admin'?'Admin':'Editorial/Penulis')+' · '+(member.active?'Aktif':'Nonaktif'));if(member.managed){const label=document.createElement('small');label.textContent='Dari kode';controls.append(label);}else if(member.id!==session.user.id){const select=document.createElement('select');select.setAttribute('aria-label','Peran '+member.email);for(const role of ['editor','admin']){const option=document.createElement('option');option.value=role;option.textContent=role==='admin'?'Admin':'Editorial/Penulis';select.append(option);}select.value=member.role;select.onchange=async()=>{if(!confirm('Ubah peran '+member.email+'? Semua sesinya akan dicabut.')){select.value=member.role;return;}try{await request('team/'+member.id,{role:select.value});await load();}catch(e){select.value=member.role;error(e as Error);}};controls.append(select,action(member.active?'Nonaktifkan':'Aktifkan',async()=>{if(!confirm((member.active?'Cabut akses ':'Aktifkan akses ')+member.email+'?'))return;await request('team/'+member.id,{active:!member.active});await load();}));}else{const label=document.createElement('small');label.textContent='Akunmu';controls.append(label);}if(member.active&&!member.managed)controls.append(action('Reset password',async()=>{if(!confirm('Buat link reset pribadi untuk '+member.email+'?'))return;const result=await request('team/reset-password',{email:member.email});link(result.token);await load();}));return el;}));
 $('pending-invites').replaceChildren(...team.invitations.map((invite:any)=>{const {el,controls}=row(invite.email,'Reset password'+' · berakhir '+new Date(invite.expires).toLocaleString('id-ID'));controls.append(action('Cabut link',async()=>{await request('team/revoke',{email:invite.email});await load();}));return el;}));
 if(!team.invitations.length)$('pending-invites').textContent='Tidak ada link reset aktif.';
 $('audit-list').replaceChildren(...audit.map((item:any)=>{const p=document.createElement('p');p.textContent=new Date(item.created_at).toLocaleString('id-ID')+' · '+(item.actor||'Sistem')+' · '+item.event+' · '+item.subject;return p;}));
}
if($('team-toggle')){
 $('team-toggle').onclick=()=>{$('team-view').hidden=false;load().then(()=>$('team-view').scrollIntoView({behavior:'smooth'})).catch(error);};
 $('team-close').onclick=()=>{$('team-view').hidden=true;};
 const createForm=$<HTMLFormElement>('create-account'),createSubmit=$<HTMLButtonElement>('create-account-submit'),createNotice=$('create-account-notice');
 const password=createForm.elements.namedItem('password') as HTMLInputElement,confirmation=createForm.elements.namedItem('confirmation') as HTMLInputElement;
 function validateConfirmation(){confirmation.setCustomValidity(confirmation.value&&password.value!==confirmation.value?'Konfirmasi password tidak sama.':'');}
 password.addEventListener('input',validateConfirmation);confirmation.addEventListener('input',validateConfirmation);
 let creating=false;
 createForm.addEventListener('submit',async event=>{
  event.preventDefault();validateConfirmation();if(creating||!createForm.reportValidity())return;
  const payload=Object.fromEntries(new FormData(createForm));creating=true;createSubmit.disabled=true;createSubmit.textContent='Membuat akun…';createNotice.textContent='';createNotice.classList.remove('error');
  try{
   const account=await request('team/create',payload);createForm.reset();confirmation.setCustomValidity('');
   const label=account.role==='admin'?'Admin':'Editorial/Penulis';createNotice.textContent='Akun '+account.email+' ('+label+') berhasil dibuat. Anggota dapat langsung login.';
   try{await load();}catch{createNotice.textContent+=' Daftar anggota belum dapat diperbarui; buka ulang Tim & akses untuk melihatnya.';}
  }catch(e){createNotice.textContent=(e as Error).message;createNotice.classList.add('error');}
  finally{password.value='';confirmation.value='';creating=false;createSubmit.disabled=false;createSubmit.textContent='Buat akun';}
 });

}
