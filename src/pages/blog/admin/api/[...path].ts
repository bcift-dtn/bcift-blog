import {mediaUrl} from '../../../../lib/media-url.mjs';
import type { APIRoute } from 'astro';
import {randomBytes} from 'node:crypto';
import {db,hasAdmin,ensureConfiguredAccounts,login,logout,currentUser,saveArticle,cleanBody,inviteMember,invitationInfo,acceptInvitation,updateMember,audit} from '../../../../server/cms.mjs';
import {readImageFocus} from '../../../../lib/image-focus.mjs';
import {readCategories} from '../../../../lib/categories.mjs';
import {readDestinationTrips} from '../../../../lib/destination-trips.mjs';
import {issueCsrf,checkCsrf,secureRequest} from '../../../../server/csrf.mjs';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'}});
export const ALL:APIRoute=async({request,params,cookies,clientAddress})=>{
 const path=(params.path||'').replace(/\/$/,''),method=request.method;
 const token=cookies.get('bcift_session')?.value,pending=cookies.get('bcift_pending')?.value;
 try{
  if(path==='csrf'&&method==='GET'){const csrf=issueCsrf(cookies.get('bcift_csrf')?.value);cookies.set('bcift_csrf',csrf,{httpOnly:true,sameSite:'strict',secure:secureRequest(request),path:'/blog/',maxAge:12*3600});return json({token:csrf});}
  if(!['GET','HEAD'].includes(method)&&!checkCsrf(request.headers.get('X-BCIFT-CSRF'),cookies.get('bcift_csrf')?.value))return json({error:'Sesi keamanan perlu diperbarui. Silakan coba kembali.',code:'CSRF_EXPIRED'},403);
  if(Number(request.headers.get('content-length')||0)>8_000_000)return json({error:'Ukuran terlalu besar.'},413);
  const cookieOptions={httpOnly:true,sameSite:'strict' as const,secure:secureRequest(request),path:'/blog/'};
  async function input(max=4096){const raw=await request.text();if(raw.length>max)throw new Error('Permintaan terlalu besar.');return JSON.parse(raw);}
  function signIn(email:string,password:string){const session=login(email,password,clientAddress);logout(token);logout(pending);cookies.delete('bcift_pending',{path:'/blog/'});cookies.set('bcift_session',session,{...cookieOptions,maxAge:8*3600});return json({ok:true});}
  ensureConfiguredAccounts();
  const user=currentUser(token);
  if(path==='session'&&method==='GET')return json({authenticated:!!user,user:user?{id:user.id,email:user.email,role:user.role}:null,setup:!hasAdmin()});
  if(path==='logout'&&method==='POST'){logout(token);logout(pending);cookies.delete('bcift_session',{path:'/blog/'});cookies.delete('bcift_pending',{path:'/blog/'});return json({ok:true});}
  if(path==='setup')return json({error:'Pendaftaran melalui web ditutup. Buat akun melalui terminal server.'},403);
  if(path==='login'&&method==='POST'){
   const data=await input(),email=String(data.email||''),password=String(data.password||'');
   if(password.length>128)throw new Error('Password terlalu panjang.');
   return signIn(email,password);
  }
  if(path==='invite/check'&&method==='POST'){const data=await input();const invite=invitationInfo(data.token);return json({email:invite.email,role:invite.role,purpose:invite.purpose});}
  if(path==='invite/accept'&&method==='POST'){const data=await input();const email=acceptInvitation(data.token,data.password);return signIn(email,data.password);}
  if(path.startsWith('mfa/'))return json({error:'Tidak ditemukan.'},404);
  if(!user)return json({error:'Silakan login kembali.'},401);
  if(path==='articles'&&method==='GET')return json(db.prepare('SELECT * FROM articles ORDER BY updated_at DESC').all().map((article:any)=>({...article,image_focus:readImageFocus(article.image_focus),categories:readCategories(article.categories,article.category),destination_trips:readDestinationTrips(article.destination_trips),image:mediaUrl(article.image),body:cleanBody(article.body)})));
  if(path==='articles'&&method==='POST'){const data=await input(250000);if(data.status==='published'&&user.role!=='admin')return json({error:'Editor menyimpan draft. Penerbitan dilakukan admin.'},403);const previous=data.id?db.prepare('SELECT status FROM articles WHERE id=?').get(Number(data.id)) as {status:string}|undefined:null;if(previous?.status==='published'&&user.role!=='admin')return json({error:'Perubahan artikel yang sudah terbit hanya dapat dilakukan admin.'},403);const result=saveArticle(data,data.id?Number(data.id):undefined);audit(user.id,'article.saved',result.slug);return json(result);}
  if(/^articles\/\d+$/.test(path)&&method==='DELETE'){if(user.role!=='admin')return json({error:'Hanya admin yang dapat menghapus artikel.'},403);db.prepare('DELETE FROM articles WHERE id=?').run(Number(path.split('/')[1]));audit(user.id,'article.deleted',path);return json({ok:true});}
  if(path==='upload'&&method==='POST'){
   const bytes=Buffer.from(await request.arrayBuffer());if(!bytes.length||bytes.length>5*1024*1024)throw new Error('Gambar maksimal 5 MB.');
   const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
   if(!png&&!jpg&&!webp)throw new Error('Gunakan JPG, PNG, atau WebP.');const id=randomBytes(16).toString('hex');db.prepare('INSERT INTO media VALUES(?,?,?)').run(id,png?'image/png':jpg?'image/jpeg':'image/webp',bytes);return json({url:`/blog/media/${id}/`});
  }
  if(path.startsWith('team')||path==='audit'){
   if(user.role!=='admin')return json({error:'Hanya admin yang dapat mengelola tim.'},403);
   if(path==='team'&&method==='GET')return json({members:db.prepare('SELECT id,email,role,active,(managed_hash IS NOT NULL) AS managed FROM admins ORDER BY id').all(),invitations:db.prepare('SELECT email,role,purpose,expires FROM invitations WHERE expires>?').all(Date.now())});
   if(path==='audit'&&method==='GET')return json(db.prepare('SELECT audit.id,audit.event,audit.subject,audit.created_at,admins.email AS actor FROM audit LEFT JOIN admins ON admins.id=audit.actor ORDER BY audit.id DESC LIMIT 100').all());
   if(method!=='GET'&&Date.now()-user.verifiedAt>15*60000)return json({error:'Untuk mengubah akses tim, login ulang (verifikasi berlaku 15 menit).'},403);
   if(path==='team/invite')return json({error:'Pembuatan akun hanya melalui terminal server.'},403);
   if(path==='team/reset-password'&&method==='POST'){const data=await input();const reset=inviteMember(user,data.email,undefined,'reset');return json({token:reset,expiresInHours:24});}
   if(path==='team/revoke'&&method==='POST'){const data=await input();db.prepare('DELETE FROM invitations WHERE email=?').run(String(data.email).toLowerCase().trim());audit(user.id,'invitation.revoked',data.email);return json({ok:true});}
   if(/^team\/\d+$/.test(path)&&method==='POST'){updateMember(user,Number(path.split('/')[1]),await input());return json({ok:true});}
  }
  return json({error:'Tidak ditemukan.'},404);
 }catch(error){return json({error:error instanceof Error?error.message:'Permintaan gagal.'},400);}
};
