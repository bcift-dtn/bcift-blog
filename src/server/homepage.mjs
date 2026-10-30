import {db,audit} from './cms.mjs';
db.exec("CREATE TABLE IF NOT EXISTS blog_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
export function homepageSettings(){const row=db.prepare("SELECT value FROM blog_settings WHERE key='homepage'").get();return row?JSON.parse(row.value):{mode:'automatic',slugs:[]};}
export function selectHomepage(settings,published){
 const sorted=[...published].filter(p=>!p.data.draft).sort((a,b)=>(b.data.publishedAt?.getTime()??0)-(a.data.publishedAt?.getTime()??0)||a.id.localeCompare(b.id));
 const selected=settings.mode==='manual'?settings.slugs.map(slug=>sorted.find(p=>p.id===slug)).filter(Boolean):[];
 return [...selected,...sorted.filter(p=>!selected.some(item=>item.id===p.id))].slice(0,3);
}
export function saveHomepage(actor,input,published){
 if(actor?.role!=='admin')throw Error('Hanya Admin yang dapat mengatur artikel halaman utama.');
 if(!input||!['automatic','manual'].includes(input.mode))throw Error('Pilih mode otomatis atau manual.');
 const slugs=input.mode==='manual'?input.slugs:[];
 if(!Array.isArray(slugs)||slugs.some(s=>typeof s!=='string')||new Set(slugs).size!==slugs.length)throw Error('Pilih artikel berbeda untuk setiap posisi.');
 const allowed=published.filter(p=>!p.data.draft);
 if(input.mode==='manual'&&(!allowed.length||slugs.length!==Math.min(3,allowed.length)||slugs.some(slug=>!allowed.some(p=>p.id===slug))))throw Error('Pilih tiga artikel yang sudah terbit (atau semua artikel jika jumlahnya kurang dari tiga).');
 const value={mode:input.mode,slugs};db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO blog_settings VALUES('homepage',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));audit(actor.id,'homepage.updated',input.mode);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}
}
