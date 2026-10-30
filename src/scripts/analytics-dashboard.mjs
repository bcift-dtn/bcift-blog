import {cmsFetch} from './cms-fetch.ts';
const metrics=[{key:'views',label:'Artikel dibuka',color:'#0076b6',dash:''},{key:'clicks',label:'Klik kartu',color:'#008777',dash:'7 4'},{key:'reads',label:'Bacaan aktif',color:'#7950b3',dash:'2 4'}];
const count=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
const number=value=>count(value).toLocaleString('id-ID');
const dayLabel=day=>new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(day+'T00:00:00Z'));
export function renderAnalytics(doc,data){
 const get=id=>doc.getElementById(id),series=(Array.isArray(data.series)?data.series:[]).filter(row=>/^\d{4}-\d{2}-\d{2}$/.test(row.day)).slice(-30);
 for(const metric of metrics)get('analytics-'+metric.key).textContent=number(data.totals?.[metric.key]);
 const svg=(tag,attrs={},text)=>{const el=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))el.setAttribute(key,String(value));if(text!==undefined)el.textContent=text;return el;};
 const chart=svg('svg',{viewBox:'0 0 800 235',role:'img','aria-labelledby':'reader-chart-title reader-chart-description'});
 chart.append(svg('title',{id:'reader-chart-title'},'Aktivitas pembaca artikel selama '+series.length+' hari'),svg('desc',{id:'reader-chart-description'},'Grafik artikel dibuka, klik kartu artikel, dan bacaan aktif. Angka lengkap tersedia pada tabel harian di bawah.'));
 const maximum=Math.max(4,Math.ceil(Math.max(0,...series.flatMap(row=>metrics.map(metric=>count(row[metric.key]))))/4)*4),left=40,top=18,width=730,height=165;
 for(let i=0;i<=4;i++){const y=top+height-i*height/4;chart.append(svg('line',{x1:left,x2:left+width,y1:y,y2:y,stroke:'#e1edf3','stroke-width':1}),svg('text',{x:left-9,y:y+4,'text-anchor':'end',fill:'#526b7b','font-size':11},String(maximum*i/4)));}
 const x=i=>left+(series.length<=1?width/2:i*width/(series.length-1)),y=value=>top+height-count(value)/maximum*height;
 for(const metric of metrics){chart.append(svg('polyline',{points:series.map((row,i)=>x(i)+','+y(row[metric.key])).join(' '),fill:'none',stroke:metric.color,'stroke-width':2.5,'stroke-dasharray':metric.dash,'stroke-linejoin':'round','stroke-linecap':'round'}));series.forEach((row,i)=>{const point=svg('circle',{cx:x(i),cy:y(row[metric.key]),r:3,fill:metric.color});point.append(svg('title',{},dayLabel(row.day)+' · '+metric.label+': '+number(row[metric.key])));chart.append(point);});}
 for(const i of [...new Set([0,Math.floor((series.length-1)/2),series.length-1])])if(series[i])chart.append(svg('text',{x:x(i),y:211,'text-anchor':i===0?'start':i===series.length-1?'end':'middle',fill:'#526b7b','font-size':12},dayLabel(series[i].day)));
 get('analytics-chart').replaceChildren(chart);get('analytics-chart').setAttribute('aria-busy','false');
 function row(cells){const tr=doc.createElement('tr');for(const content of cells){const td=doc.createElement('td');if(typeof content==='string')td.textContent=content;else td.append(content);tr.append(td);}return tr;}
 get('analytics-daily').replaceChildren(...series.map(item=>row([dayLabel(item.day),...metrics.map(metric=>number(item[metric.key]))])));
 const topArticles=Array.isArray(data.topArticles)?data.topArticles.slice(0,10):[];
 get('analytics-top').replaceChildren(...topArticles.map(item=>{const link=doc.createElement('a');link.textContent=String(item.title||item.slug);link.href='/blog/'+encodeURIComponent(item.slug)+'/';link.target='_blank';link.rel='noopener noreferrer';return row([link,...metrics.map(metric=>number(item[metric.key]))]);}));
 if(!topArticles.length){const tr=doc.createElement('tr'),td=doc.createElement('td');td.colSpan=4;td.textContent='Belum ada aktivitas artikel pada periode ini.';tr.append(td);get('analytics-top').append(tr);}
 get('analytics-start').textContent=data.firstRecordedDay?'Aktivitas pertama tercatat pada '+dayLabel(data.firstRecordedDay)+'. Data sebelum pencatatan tidak tersedia.':'Statistik mulai dikumpulkan setelah fitur ini aktif dan ada aktivitas pembaca.';
 get('analytics-status').textContent=metrics.some(metric=>count(data.totals?.[metric.key])>0)?'Menampilkan '+series.length+' hari terakhir.':'Belum ada aktivitas pembaca pada periode ini.';
}
export function initAnalyticsDashboard(doc,{fetcher=cmsFetch}={}){
 const panel=doc.getElementById('reader-analytics');if(!panel)return;
 const period=doc.getElementById('analytics-days'),refresh=doc.getElementById('analytics-refresh'),status=doc.getElementById('analytics-status');let requestId=0;
 async function load(){
  const id=++requestId;refresh.disabled=true;status.textContent='Memuat statistik…';doc.getElementById('analytics-chart').setAttribute('aria-busy','true');
  try{const response=await fetcher('/blog/admin/api/analytics/?days='+period.value);const result=await response.json();if(id!==requestId)return;if(!response.ok)throw Error(result.error||'Statistik belum dapat dimuat.');renderAnalytics(doc,result);}
  catch(error){if(id!==requestId)return;status.textContent=error.message||'Statistik belum dapat dimuat. Coba Perbarui.';for(const metric of metrics)doc.getElementById('analytics-'+metric.key).textContent='—';doc.getElementById('analytics-chart').replaceChildren();doc.getElementById('analytics-daily').replaceChildren();doc.getElementById('analytics-top').replaceChildren();}
  finally{if(id===requestId){refresh.disabled=false;doc.getElementById('analytics-chart').setAttribute('aria-busy','false');}}
 }
 period.addEventListener('change',load);refresh.addEventListener('click',load);doc.addEventListener('studio:view',event=>{if(event.detail.view==='analytics')load();});if(!panel.closest('[hidden]'))load();return {load};
}
if(typeof document!=='undefined')initAnalyticsDashboard(document);
