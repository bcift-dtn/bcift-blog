import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {db,dataDir} from './cms.mjs';
const lifetime=6*3600000;
db.exec(`CREATE TABLE IF NOT EXISTS article_analytics_daily(day TEXT NOT NULL,slug TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 0,clicks INTEGER NOT NULL DEFAULT 0,reads INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,slug));
CREATE TABLE IF NOT EXISTS analytics_receipts(token TEXT NOT NULL,event TEXT NOT NULL,expires INTEGER NOT NULL,recorded_at INTEGER NOT NULL,PRIMARY KEY(token,event));`);
let key,lastCleanup=0;
function signingKey(){
 if(key)return key;const path=resolve(dataDir,'analytics.key');
 try{key=readFileSync(path);}catch(error){if(error.code!=='ENOENT')throw error;try{writeFileSync(path,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}key=readFileSync(path);}
 if(key.length!==32)throw Error('Kunci statistik tidak valid.');return key;
}
const signature=value=>createHmac('sha256',signingKey()).update(value).digest('hex');
export function createAnalyticsToken(slug,scope='article',now=Date.now()){
 // Older saved slugs may end in a hyphen at the former 100-character boundary.
 if(typeof slug!=='string'||slug.length>100||!/^[a-z0-9]+(?:-[a-z0-9]+)*-?$/.test(slug)||!['article','click'].includes(scope))throw Error('Artikel statistik tidak valid.');
 const payload=Buffer.from(JSON.stringify({slug,scope,expires:now+lifetime,nonce:randomBytes(12).toString('hex')})).toString('base64url');return payload+'.'+signature(payload);
}
export function parseAnalyticsToken(token,now=Date.now()){
 if(typeof token!=='string'||token.length>1000)throw Error('Token statistik tidak valid.');
 const parts=token.split('.');if(parts.length!==2||!/^[A-Za-z0-9_-]+$/.test(parts[0])||!/^[a-f0-9]{64}$/.test(parts[1])||!timingSafeEqual(Buffer.from(parts[1],'hex'),Buffer.from(signature(parts[0]),'hex')))throw Error('Token statistik tidak valid.');
 const payload=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));if(!Number.isFinite(payload.expires)||payload.expires<=now||payload.expires>now+lifetime+60000||!['article','click'].includes(payload.scope))throw Error('Token statistik kedaluwarsa.');return payload;
}
export const jakartaDay=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function recordAnalytics(token,event,now=Date.now()){
 const payload=parseAnalyticsToken(token,now);if(!['view','click','read'].includes(event))throw Error('Jenis statistik tidak valid.');const column={view:'views',click:'clicks',read:'reads'}[event];
 if(!column||(event==='click')!==(payload.scope==='click'))throw Error('Jenis statistik tidak valid.');
 const id=createHash('sha256').update(token).digest('hex');
 if(now-lastCleanup>3600000){db.prepare('DELETE FROM analytics_receipts WHERE expires<?').run(now);lastCleanup=now;}
 db.exec('BEGIN IMMEDIATE');try{
  if(db.prepare('SELECT 1 FROM analytics_receipts WHERE token=? AND event=?').get(id,event)){db.exec('COMMIT');return false;}
  if(event==='read'){const view=db.prepare("SELECT recorded_at FROM analytics_receipts WHERE token=? AND event='view'").get(id);if(!view||now-view.recorded_at<15000){db.exec('COMMIT');return false;}}
  db.prepare('INSERT INTO analytics_receipts(token,event,expires,recorded_at) VALUES(?,?,?,?)').run(id,event,payload.expires,now);
  db.prepare('INSERT INTO article_analytics_daily(day,slug,'+column+') VALUES(?,?,1) ON CONFLICT(day,slug) DO UPDATE SET '+column+'='+column+'+1').run(jakartaDay(now),payload.slug);
  db.exec('COMMIT');return true;
 }catch(error){db.exec('ROLLBACK');throw error;}
}
export function analyticsSummary(days=7,now=Date.now()){
 if(![7,30].includes(days))throw Error('Pilih periode 7 atau 30 hari.');
 const end=jakartaDay(now),endDay=Date.parse(end+'T00:00:00Z');
 const dates=Array.from({length:days},(_,i)=>new Date(endDay-(days-1-i)*86400000).toISOString().slice(0,10));
 const rows=db.prepare('SELECT day,SUM(views) AS views,SUM(clicks) AS clicks,SUM(reads) AS reads FROM article_analytics_daily WHERE day>=? AND day<=? GROUP BY day').all(dates[0],end);
 const byDay=new Map(rows.map(row=>[row.day,row]));const series=dates.map(day=>({...{views:0,clicks:0,reads:0},...byDay.get(day),day}));
 const totals=series.reduce((sum,row)=>({views:sum.views+row.views,clicks:sum.clicks+row.clicks,reads:sum.reads+row.reads}),{views:0,clicks:0,reads:0});
 const topArticles=db.prepare('SELECT d.slug,COALESCE(a.title,d.slug) AS title,SUM(d.views) AS views,SUM(d.clicks) AS clicks,SUM(d.reads) AS reads FROM article_analytics_daily d LEFT JOIN articles a ON a.slug=d.slug WHERE d.day>=? AND d.day<=? GROUP BY d.slug ORDER BY views DESC,reads DESC,clicks DESC LIMIT 10').all(dates[0],end);
 return {days,timezone:'Asia/Jakarta',series,totals,topArticles,firstRecordedDay:db.prepare('SELECT MIN(day) AS day FROM article_analytics_daily').get().day};
}
