import {articleLinkAttributes} from '../lib/article-links.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import {readImageFocus,validateImageFocus} from '../lib/image-focus.mjs';
import {mediaUrl} from '../lib/media-url.mjs';
import {normalizeArticleHtml} from '../lib/article-content.mjs';
import {CATEGORY_VALUES,validateCategories,readCategories} from '../lib/categories.mjs';
import {readDestinationTrips,validateDestinationTrips} from '../lib/destination-trips.mjs';
import {INTERNAL_ACCOUNTS} from './internal-accounts.mjs';

export const dataDir = resolve(process.env.CMS_DATA_DIR || './data');
mkdirSync(dataDir, { recursive: true });
export const db = new DatabaseSync(resolve(dataDir, 'blog.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(ip TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS articles(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', image_alt TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT 'BCIFT Editorial', body TEXT NOT NULL DEFAULT '', seo_title TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', published_at TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, type TEXT NOT NULL, bytes BLOB NOT NULL);
`);
// Schema migration preserves existing articles and accounts. Old sessions require MFA.
for(const [table,columns] of Object.entries({articles:{image_focus:"TEXT NOT NULL DEFAULT '{}'",categories:"TEXT NOT NULL DEFAULT '[]'",destination_trips:"TEXT NOT NULL DEFAULT '[]'"},admins:{role:"TEXT NOT NULL DEFAULT 'admin'",active:'INTEGER NOT NULL DEFAULT 1',managed_hash:'TEXT',mfa_secret:'TEXT',mfa_enabled:'INTEGER NOT NULL DEFAULT 0',mfa_last_step:'INTEGER NOT NULL DEFAULT -1',recovery:'TEXT NOT NULL DEFAULT \'[]\''},sessions:{verified:'INTEGER NOT NULL DEFAULT 0',last_seen:'INTEGER NOT NULL DEFAULT 0',verified_at:'INTEGER NOT NULL DEFAULT 0',failures:'INTEGER NOT NULL DEFAULT 0',pending_secret:'TEXT'}})){
 const known=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
 for(const [name,type] of Object.entries(columns))if(!known.has(name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY,email TEXT NOT NULL,role TEXT NOT NULL,purpose TEXT NOT NULL DEFAULT 'invite',expires INTEGER NOT NULL,created_by INTEGER NOT NULL REFERENCES admins(id));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER,event TEXT NOT NULL,subject TEXT NOT NULL,created_at TEXT NOT NULL);`);
db.prepare("DELETE FROM invitations WHERE purpose!='reset'").run();
export const categories = CATEGORY_VALUES;
export const slugify = value => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
function checkPassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw new Error('Password harus 12–128 karakter.');}
function checkEmail(email){if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Email tidak valid.');}
export function passwordHash(password) {const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function passwordMatches(password,hash){const [salt,expected]=hash.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(expected,'hex'));}
export function audit(actor,event,subject=''){db.prepare('INSERT INTO audit(actor,event,subject,created_at) VALUES(?,?,?,?)').run(actor??null,event,String(subject).slice(0,254),new Date().toISOString());}
export const hasAdmin=()=>!!db.prepare('SELECT id FROM admins LIMIT 1').get();
// Shared account insertion; dashboard calls require an authenticated admin first.
export function createAccount(email,password,role='editor',context=null){
 email=normalizeEmail(email);checkEmail(email);checkPassword(password);
 if(!['admin','editor'].includes(role))throw new Error('Peran harus Admin atau Editorial/Penulis.');
 const hash=passwordHash(password);db.exec('BEGIN IMMEDIATE');try{
  if(!hasAdmin()&&role!=='admin')throw new Error('Akun pertama harus berperan Admin.');
  if(db.prepare('SELECT id FROM admins WHERE email=?').get(email))throw new Error('Email sudah memiliki akun.');
  const id=Number(db.prepare('INSERT INTO admins(email,password,role) VALUES(?,?,?)').run(email,hash,role).lastInsertRowid);
  audit(context?.actorId??id,context?'account.created':'account.created.locally',email);db.exec('COMMIT');return {id,email,role};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function createTeamAccount(actor,input){
 requireAdmin(actor);
 const {email,password,confirmation,role='editor'}=input;
 if(password!==confirmation)throw new Error('Konfirmasi password tidak sama.');
 return createAccount(email,password,role,{actorId:actor.id});
}
export function createAdmin(email,password){if(hasAdmin())throw new Error('Admin pertama sudah dibuat. Gunakan perintah akun lokal untuk anggota berikutnya.');return createAccount(email,password,'admin');}
export function ensureConfiguredAccounts(accounts=INTERNAL_ACCOUNTS){
 const emails=new Set();
 for(const account of accounts){checkEmail(normalizeEmail(account.email));if(!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.passwordHash))throw new Error('Hash password akun kode tidak valid.');if(!['admin','editor'].includes(account.role))throw new Error('Peran akun kode tidak valid.');if(emails.has(normalizeEmail(account.email)))throw new Error('Email konfigurasi ganda.');emails.add(normalizeEmail(account.email));}
 db.exec('BEGIN IMMEDIATE');try{
  for(const account of accounts){
   const email=normalizeEmail(account.email),active=account.enabled===false?0:1;
   const fingerprint=digest(JSON.stringify([email,account.passwordHash,account.role,active]));
   const previous=db.prepare('SELECT id,managed_hash FROM admins WHERE email=?').get(email);
   if(previous&&!previous.managed_hash)throw new Error('Email akun kode sudah dipakai akun lain. Pilih email konfigurasi berbeda.');
   if(!previous){const id=Number(db.prepare('INSERT INTO admins(email,password,role,active,managed_hash) VALUES(?,?,?,?,?)').run(email,account.passwordHash,account.role,active,fingerprint).lastInsertRowid);audit(id,'account.configured',email);}
   else if(previous.managed_hash!==fingerprint){db.prepare('UPDATE admins SET password=?,role=?,active=?,managed_hash=? WHERE id=?').run(account.passwordHash,account.role,active,fingerprint,previous.id);db.prepare('DELETE FROM sessions WHERE admin_id=?').run(previous.id);db.prepare('DELETE FROM invitations WHERE email=? OR created_by=?').run(email,previous.id);audit(previous.id,'account.configuration.updated',email);}
  }
  for(const user of db.prepare('SELECT id,email FROM admins WHERE managed_hash IS NOT NULL AND active=1').all()){if(!emails.has(user.email)){db.prepare('UPDATE admins SET active=0,managed_hash=? WHERE id=?').run('removed',user.id);db.prepare('DELETE FROM sessions WHERE admin_id=?').run(user.id);db.prepare('DELETE FROM invitations WHERE email=? OR created_by=?').run(user.email,user.id);audit(user.id,'account.removed.from.configuration',user.email);}}
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
function failed(key){db.prepare('INSERT INTO attempts(ip,count,expires) VALUES(?,1,?) ON CONFLICT(ip) DO UPDATE SET count=count+1').run(key,Date.now()+900000);}
export function login(email,password,ip){
 email=normalizeEmail(email);if(typeof password!=='string'||password.length>128)throw new Error('Email atau password tidak sesuai.');
 db.prepare('DELETE FROM attempts WHERE expires<?').run(Date.now());
 const keys=['ip:'+ip,'email:'+digest(email)];
 for(const key of keys){if((db.prepare('SELECT count FROM attempts WHERE ip=?').get(key)?.count??0)>=10)throw new Error('Terlalu banyak percobaan. Coba lagi setelah 15 menit.');}
 const user=db.prepare('SELECT * FROM admins WHERE email=?').get(email);
 const valid=passwordMatches(password,user?.password||passwordHash('invalid-account-placeholder'));
 if(!user||!user.active||!valid){keys.forEach(failed);throw new Error('Email atau password tidak sesuai.');}
 keys.forEach(key=>db.prepare('DELETE FROM attempts WHERE ip=?').run(key));
 db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
 const token=randomBytes(32).toString('hex');
 db.prepare('INSERT INTO sessions(token,admin_id,expires,verified,last_seen,verified_at) VALUES(?,?,?,1,?,?)').run(digest(token),user.id,Date.now()+8*3600000,Date.now(),Date.now());
 audit(user.id,'login.password',user.email);
 return token;
}
function session(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;return db.prepare('SELECT s.*,a.email,a.role,a.active FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token=? AND s.expires>? AND a.active=1').get(digest(token),Date.now())||null;}
export function currentUser(token){const s=session(token);if(!s?.verified||Date.now()-s.last_seen>30*60000)return null;if(Date.now()-s.last_seen>60000)db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(Date.now(),s.token);return {id:s.admin_id,email:s.email,role:s.role,verifiedAt:s.verified_at};}
export const authenticated=token=>!!currentUser(token);
export function logout(token){if(typeof token==='string')db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));}
export function requireAdmin(user){if(!user||user.role!=='admin')throw new Error('Hanya admin yang dapat mengelola anggota.');}
export function inviteMember(user,email,role='editor',purpose='invite'){
 requireAdmin(user);if(purpose!=='reset')throw new Error('Pembuatan akun hanya tersedia melalui terminal server.');email=normalizeEmail(email);checkEmail(email);role=role==='admin'?'admin':'editor';
 const existing=db.prepare('SELECT * FROM admins WHERE email=?').get(email);
 if(existing?.managed_hash)throw new Error('Password akun ini diatur di src/server/internal-accounts.mjs.');
 if(purpose==='reset'&&!existing)throw new Error('Akun tidak ditemukan.');
 if(purpose==='invite'&&existing)throw new Error('Email sudah memiliki akun. Gunakan reset password bila diperlukan.');
 if(purpose==='reset'&&!existing.active)throw new Error('Aktifkan akun sebelum membuat link reset.');
 const token=randomBytes(32).toString('hex');db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM invitations WHERE email=?').run(email);db.prepare('INSERT INTO invitations VALUES(?,?,?,?,?,?)').run(digest(token),email,existing?.role||role,purpose,Date.now()+24*3600000,user.id);audit(user.id,purpose==='reset'?'password.reset.invited':'member.invited',email);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return token;
}
export function invitationInfo(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new Error('Undangan tidak valid atau kedaluwarsa.');const invite=db.prepare('SELECT * FROM invitations WHERE token=? AND expires>?').get(digest(token),Date.now());if(!invite||invite.purpose!=='reset')throw new Error('Link reset tidak valid atau kedaluwarsa.');return invite;}
export function acceptInvitation(token,password){
 checkPassword(password);const hash=passwordHash(password);db.exec('BEGIN IMMEDIATE');try{
  const invite=invitationInfo(token);
  if(invite.purpose==='reset'){
   if(db.prepare('SELECT managed_hash FROM admins WHERE email=?').get(invite.email)?.managed_hash)throw new Error('Akun ini dikelola dari kode.');
   const user=db.prepare('SELECT id,active FROM admins WHERE email=?').get(invite.email);if(!user?.active)throw new Error('Akun tidak aktif.');
   db.prepare('UPDATE admins SET password=? WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE admin_id=?').run(user.id);
  }else throw new Error('Pendaftaran melalui web ditutup.');
  db.prepare('DELETE FROM invitations WHERE token=?').run(digest(token));audit(null,'invitation.accepted',invite.email);db.exec('COMMIT');return invite.email;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function updateMember(actor,id,{role,active}){
 requireAdmin(actor);id=Number(id);const user=db.prepare('SELECT id,email,role,active,managed_hash FROM admins WHERE id=?').get(id);if(!user)throw new Error('Anggota tidak ditemukan.');if(user.managed_hash)throw new Error('Peran dan status akun ini diatur dari kode server.');
 const newRole=role===undefined?user.role:(role==='admin'?'admin':'editor'),newActive=active===undefined?user.active:(active?1:0);
 if(id===actor.id&&(!newActive||newRole!=='admin'))throw new Error('Admin tidak dapat menonaktifkan atau menurunkan perannya sendiri.');
 db.exec('BEGIN IMMEDIATE');try{
  if(user.role==='admin'&&user.active&&(!newActive||newRole!=='admin')&&db.prepare("SELECT count(*) AS count FROM admins WHERE role='admin' AND active=1").get().count<=1)throw new Error('Setidaknya harus ada satu admin aktif.');
  db.prepare('UPDATE admins SET role=?,active=? WHERE id=?').run(newRole,newActive,id);db.prepare('DELETE FROM sessions WHERE admin_id=?').run(id);db.prepare('DELETE FROM invitations WHERE email=? OR created_by=?').run(user.email,id);audit(actor.id,'member.updated',user.email);db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}

export function cleanBody(value) {
 const sanitize=input=>sanitizeHtml(String(input), { transformTags:{div:'p',a:(tagName,attribs)=>({tagName,attribs:articleLinkAttributes(attribs)}),img:(tagName,attribs)=>({tagName,attribs:attribs.src?{...attribs,src:mediaUrl(attribs.src)}:attribs})}, allowedTags: ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','ul','ol','li','blockquote','a','img','table','thead','tbody','tr','th','td','hr'], allowedAttributes: { a:['href','title','target','rel'], img:['src','alt','width','height'] }, allowedSchemes:['https','http','mailto'], allowedSchemesByTag:{img:['https']}, allowProtocolRelative:false });
 return sanitize(normalizeArticleHtml(sanitize(value)));
}
const text = (value, max) => String(value ?? '').trim().slice(0, max);
export function saveArticle(input, id) {
 const previous = id ? db.prepare('SELECT * FROM articles WHERE id=?').get(id) : null;
 if (id && !previous) throw new Error('Artikel tidak ditemukan.');
 if (previous && input.updated_at !== previous.updated_at) throw new Error('Artikel berubah di tab lain. Muat ulang sebelum menyimpan.');
 const title = text(input.title, 180), slug = slugify(input.slug || title);
 const description = text(input.description, 500), body = cleanBody(text(input.body, 200000));
 const selectedCategories = validateCategories(input.categories ?? (input.category ? [input.category] : readCategories(previous?.categories,previous?.category)));
 const category = selectedCategories[0];
 const image = mediaUrl(text(input.image, 1000)), imageAlt = text(input.image_alt, 250);
 const imageFocus = input.image_focus === undefined ? readImageFocus(previous?.image_focus) : validateImageFocus(input.image_focus);
 const destinationTrips = validateDestinationTrips(input.destination_trips ?? readDestinationTrips(previous?.destination_trips));
 const status = input.status === 'published' ? 'published' : 'draft';
 if (!title || !slug) throw new Error('Judul dan slug wajib diisi.');
 if (['admin','media','sitemap','index','events','featured'].includes(slug)) throw new Error('Slug ini digunakan sistem. Pilih slug lain.');
 if (image && !/^https:\/\/[^\s]+$/.test(image) && !/^\/(?:images\/[a-zA-Z0-9_.-]+|blog\/media\/[a-f0-9]{32}\/?)$/.test(image)) throw new Error('Gunakan gambar upload atau URL HTTPS.');
 if (status === 'published' && (!description || !image || !imageAlt || sanitizeHtml(body,{allowedTags:[],allowedAttributes:{}}).trim().length < 40)) throw new Error('Lengkapi ringkasan, gambar, alt gambar, dan isi artikel sebelum menerbitkan.');
 const now = new Date().toISOString();
 const values = [slug,title,description,category,JSON.stringify(selectedCategories),image,imageAlt,JSON.stringify(imageFocus),text(input.author,100)||'BCIFT Editorial',body,text(input.seo_title,180),text(input.keywords,500),JSON.stringify(destinationTrips),status,previous?.published_at || (status==='published'?now:null),now];
 try {
  if(previous) db.prepare('UPDATE articles SET slug=?,title=?,description=?,category=?,categories=?,image=?,image_alt=?,image_focus=?,author=?,body=?,seo_title=?,keywords=?,destination_trips=?,status=?,published_at=?,updated_at=? WHERE id=?').run(...values,id);
  else id = Number(db.prepare('INSERT INTO articles(slug,title,description,category,categories,image,image_alt,image_focus,author,body,seo_title,keywords,destination_trips,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
 } catch(error) { if(String(error).includes('UNIQUE')) throw new Error('Slug sudah digunakan artikel lain.'); throw error; }
 const saved=db.prepare('SELECT * FROM articles WHERE id=?').get(id);
 return {...saved,image_focus:readImageFocus(saved.image_focus),categories:readCategories(saved.categories,saved.category),destination_trips:readDestinationTrips(saved.destination_trips)};
}
export function asPost(row) { return { id:row.slug, cms:true, body:cleanBody(row.body), data:{imageFocus:readImageFocus(row.image_focus),categories:readCategories(row.categories,row.category),destinationTrips:readDestinationTrips(row.destination_trips),title:row.title,description:row.description,category:row.category,image:mediaUrl(row.image) || '/images/terminal.webp',imageAlt:row.image_alt,author:row.author,draft:row.status!=='published',featured:false,seoTitle:row.seo_title,keywords:row.keywords,publishedAt:row.published_at?new Date(row.published_at):undefined,updatedAt:new Date(row.updated_at)} }; }
export function articleBody(body) {
 body=cleanBody(body);
 const headings=[];
 const html=body.replace(/<h([23])>([\s\S]*?)<\/h\1>/g,(_,depth,content)=>{const text=sanitizeHtml(content,{allowedTags:[],allowedAttributes:{}});const slug=`section-${headings.length+1}`;headings.push({depth:Number(depth),text,slug});return `<h${depth} id="${slug}">${content}</h${depth}>`;});
 return {html,headings};
}
