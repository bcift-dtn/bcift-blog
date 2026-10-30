import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {initPublicAnalytics} from '../src/scripts/analytics-public.mjs';
import {renderAnalytics,initAnalyticsDashboard} from '../src/scripts/analytics-dashboard.mjs';
const dir=mkdtempSync(join(tmpdir(),'bcift-analytics-test-'));process.env.CMS_DATA_DIR=dir;
const {db}=await import('../src/server/cms.mjs');
const {createAnalyticsToken,parseAnalyticsToken,recordAnalytics,analyticsSummary,jakartaDay}=await import('../src/server/analytics.mjs');
const now=Date.parse('2026-10-28T05:00:00Z');
test.beforeEach(()=>db.exec('DELETE FROM article_analytics_daily;DELETE FROM analytics_receipts;'));
test('signed, scoped tokens deduplicate events and require a preceding view before a read',()=>{
 const token=createAnalyticsToken('ferry-guide','article',now),click=createAnalyticsToken('ferry-guide','click',now);
 assert.equal(parseAnalyticsToken(token,now).slug,'ferry-guide');assert.throws(()=>parseAnalyticsToken(token.slice(0,-1)+(token.endsWith('a')?'b':'a'),now));assert.throws(()=>parseAnalyticsToken(token,now+7*3600000));
 assert.throws(()=>recordAnalytics(token,'click',now));assert.throws(()=>recordAnalytics(click,'view',now));assert.throws(()=>recordAnalytics(token,'toString',now));
 assert.equal(recordAnalytics(token,'read',now),false);assert.equal(recordAnalytics(token,'view',now),true);assert.equal(recordAnalytics(token,'view',now+1),false);assert.equal(recordAnalytics(token,'read',now+14999),false);assert.equal(recordAnalytics(token,'read',now+15000),true);assert.equal(recordAnalytics(token,'read',now+16000),false);assert.equal(recordAnalytics(click,'click',now),true);
 assert.deepEqual(analyticsSummary(7,now+16000).totals,{views:1,clicks:1,reads:1});assert.equal(analyticsSummary(30,now).series.length,30);assert.throws(()=>analyticsSummary(365,now));
 const columns=db.prepare('PRAGMA table_info(analytics_receipts)').all().map(column=>column.name);assert.deepEqual(columns,['token','event','expires','recorded_at']);
});
test('daily aggregation uses Jakarta midnight and fills inactive dates with zeros',()=>{
 const before=Date.parse('2026-10-28T16:59:50Z'),token=createAnalyticsToken('midnight-guide','article',before);
 assert.equal(jakartaDay(before),'2026-10-28');assert.equal(jakartaDay(before+20000),'2026-10-29');recordAnalytics(token,'view',before);recordAnalytics(token,'read',before+20000);
 const report=analyticsSummary(7,before+20000);assert.equal(report.series.length,7);assert.deepEqual(report.series.at(-2),{day:'2026-10-28',views:1,clicks:0,reads:0});assert.deepEqual(report.series.at(-1),{day:'2026-10-29',views:0,clicks:0,reads:1});assert.equal(report.series[0].views,0);assert.equal(report.topArticles[0].slug,'midnight-guide');
});
function browser({send,token='test-token'}={}){
 const dom=new JSDOM('<meta name="bcift-article-stat" content="'+token+'"><div class="article-body">Article</div><a data-stat-click="click-token" href="/blog/guide/">Read more</a>',{url:'https://bcift.co.id/blog/guide/',pretendToBeVisual:true});
 let time=0,tick,hidden=false,rect={top:600,height:1000};const events=[];const w=dom.window;Object.defineProperty(w.document,'visibilityState',{get:()=>hidden?'hidden':'visible'});w.document.querySelector('.article-body').getBoundingClientRect=()=>rect;Object.defineProperty(w,'innerHeight',{value:800});w.setInterval=fn=>{tick=fn;return 1;};w.clearInterval=()=>{};w.fetch=async(_url,options)=>{const data=JSON.parse(options.body);events.push(data);return send?send(data,time):new Response(null,{status:204});};w.navigator.sendBeacon=()=>false;
 const dispose=initPublicAnalytics(w,{now:()=>time});return {dom,w,events,dispose,setTime:value=>time=value,tick:()=>tick(),setRect:value=>rect=value,setHidden:value=>{hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));}};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('browser tracks an open once, and a read only after 15 visible seconds and 50% progress',async()=>{
 const b=browser();try{assert.deepEqual(b.events.map(e=>e.event),['view']);await flush();b.setTime(15000);b.tick();assert.equal(b.events.length,1);b.setRect({top:200,height:1000});b.tick();b.tick();assert.deepEqual(b.events.map(e=>e.event),['view','read']);await flush();b.tick();assert.equal(b.events.length,2);
 b.w.document.addEventListener('click',event=>event.preventDefault());const link=b.w.document.querySelector('a');link.dispatchEvent(new b.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));link.dispatchEvent(new b.w.MouseEvent('click',{bubbles:true,cancelable:true,button:0}));assert.equal(b.events.filter(e=>e.event==='click').length,1);
 }finally{b.dispose();b.dom.window.close();}
});
test('time spent in a hidden tab does not count toward active reading',async()=>{
 const b=browser();try{await flush();b.setRect({top:0,height:400});b.setTime(10000);b.tick();b.setHidden(true);b.setTime(60000);b.tick();assert.equal(b.events.filter(e=>e.event==='read').length,0);b.setHidden(false);b.setTime(65000);b.tick();assert.equal(b.events.filter(e=>e.event==='read').length,1);}finally{b.dispose();b.dom.window.close();}
});

test('a delayed view acknowledgement keeps reads behind the server interval',async()=>{
 const token=createAnalyticsToken('delayed-reader','article',now);let confirmView;const accepted=[];
 const b=browser({token,send:(data,time)=>{
  if(data.event==='view'){recordAnalytics(data.token,data.event,now+400);return new Promise(resolve=>confirmView=()=>resolve(new Response(null,{status:204})));}
  accepted.push(recordAnalytics(data.token,data.event,now+time+20));return new Response(null,{status:204});
 }});
 try{
  b.setRect({top:0,height:400});b.setTime(500);b.tick();assert.equal(b.events.length,1);confirmView();await flush();
  b.setTime(15000);b.tick();assert.equal(b.events.length,1);
  b.setTime(15500);b.tick();await flush();b.setTime(30000);b.tick();
  assert.deepEqual(accepted,[true]);assert.deepEqual(analyticsSummary(7,now+30000).totals,{views:1,clicks:0,reads:1});
 }finally{b.dispose();b.dom.window.close();}
});

test('failed view and read requests retry without duplicating recorded counts',async()=>{
 const token=createAnalyticsToken('retry-reader','article',now);let views=0,reads=0;
 const b=browser({token,send:(data,time)=>{
  if(data.event==='view'&&++views===1)throw Error('Offline');
  recordAnalytics(data.token,data.event,now+time);
  if(data.event==='read'&&++reads===1)throw Error('Response lost');
  return new Response(null,{status:204});
 }});
 try{
  b.setRect({top:0,height:400});await flush();b.setTime(1000);b.tick();b.tick();await flush();assert.equal(views,2);
  b.setTime(16000);b.tick();b.tick();await flush();assert.equal(reads,1);
  b.setTime(17000);b.tick();await flush();b.setTime(30000);b.tick();assert.equal(reads,2);
  assert.deepEqual(analyticsSummary(7,now+30000).totals,{views:1,clicks:0,reads:1});
 }finally{b.dispose();b.dom.window.close();}
});
function panel(){return new JSDOM(readFileSync('src/components/admin/AnalyticsPanel.astro','utf8').split('<script')[0]);}
const report={totals:{views:3,clicks:2,reads:1},series:[{day:'2026-10-28',views:3,clicks:2,reads:1}],topArticles:[{slug:'guide',title:'<img src=x onerror=alert(1)>',views:3,clicks:2,reads:1}],firstRecordedDay:'2026-10-28'};
test('dashboard renders readable charts, daily numbers and safe article titles',()=>{
 const dom=panel();try{const doc=dom.window.document;renderAnalytics(doc,report);assert.equal(doc.getElementById('analytics-views').textContent,'3');assert.equal(doc.querySelectorAll('#analytics-chart polyline').length,3);assert.equal(doc.querySelectorAll('#analytics-daily tr').length,1);assert.equal(doc.querySelector('#analytics-top a').textContent,report.topArticles[0].title);assert.equal(doc.querySelector('#analytics-top img'),null);assert.equal(doc.querySelector('#analytics-top a').getAttribute('href'),'/blog/guide/');assert.equal(doc.getElementById('analytics-chart').getAttribute('aria-busy'),'false');}finally{dom.window.close();}
});
test('dashboard period switch fetches 30 days and reports request failures',async()=>{
 const dom=panel(),calls=[];let fail=false;try{const doc=dom.window.document,controller=initAnalyticsDashboard(doc,{fetcher:async url=>{calls.push(url);return fail?Response.json({error:'Silakan login kembali.'},{status:401}):Response.json(report);}});await new Promise(r=>setTimeout(r,0));assert.ok(calls[0].endsWith('days=7'));doc.getElementById('analytics-days').value='30';doc.getElementById('analytics-days').dispatchEvent(new dom.window.Event('change'));await new Promise(r=>setTimeout(r,0));assert.ok(calls[1].endsWith('days=30'));fail=true;await controller.load();assert.match(doc.getElementById('analytics-status').textContent,/login/);assert.equal(doc.getElementById('analytics-views').textContent,'—');assert.equal(doc.getElementById('analytics-refresh').disabled,false);}finally{dom.window.close();}
});
test('hidden statistics wait until their menu is opened',async()=>{
 const dom=panel();try{const doc=dom.window.document,wrapper=doc.createElement('section');wrapper.hidden=true;doc.body.append(wrapper);wrapper.append(doc.getElementById('reader-analytics'));let calls=0;initAnalyticsDashboard(doc,{fetcher:async()=>{calls++;return Response.json(report);}});assert.equal(calls,0);doc.dispatchEvent(new dom.window.CustomEvent('studio:view',{detail:{view:'team'}}));assert.equal(calls,0);wrapper.hidden=false;doc.dispatchEvent(new dom.window.CustomEvent('studio:view',{detail:{view:'analytics'}}));await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);assert.equal(doc.getElementById('analytics-views').textContent,'3');}finally{dom.window.close();}
});
test.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
