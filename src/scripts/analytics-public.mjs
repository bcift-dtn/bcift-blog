export function readProgress(rect,viewportHeight){return Math.max(0,Math.min(1,(viewportHeight-rect.top)/Math.max(1,rect.height)));}
export function initPublicAnalytics(win,{now=()=>Date.now()}={}){
 const doc=win.document,token=doc.querySelector('meta[name="bcift-article-stat"]')?.content,article=doc.querySelector('.article-body');
 const clicked=new WeakSet();let viewed=false,read=false,viewPending=false,readPending=false,viewConfirmedAt=Infinity,visibleMs=0,last=now(),wasVisible=doc.visibilityState!=='hidden';
 async function send(value,event){
  const body=JSON.stringify({token:value,event});
  // Views need an acknowledgement before starting the server's minimum read interval.
  if(event==='click')try{if(win.navigator.sendBeacon?.('/blog/events/',new win.Blob([body],{type:'application/json'})))return true;}catch{}
  try{return (await win.fetch('/blog/events/',{method:'POST',body,credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'}})).ok;}catch{return false;}
 }
 function view(){if(token&&!viewed&&!viewPending&&doc.visibilityState!=='hidden'){viewPending=true;send(token,'view').then(accepted=>{if(accepted){viewed=true;viewConfirmedAt=now();}}).finally(()=>{viewPending=false;});}}
 function tick(){const time=now();if(wasVisible)visibleMs+=Math.max(0,time-last);last=time;wasVisible=doc.visibilityState!=='hidden';view();if(token&&article&&viewed&&!read&&!readPending&&wasVisible&&visibleMs>=15000&&time-viewConfirmedAt>=15000&&readProgress(article.getBoundingClientRect(),win.innerHeight)>=0.5){readPending=true;send(token,'read').then(accepted=>{read=accepted;}).finally(()=>{readPending=false;});}}
 const click=event=>{if(event.defaultPrevented||!['click','auxclick'].includes(event.type)||(event.button!==0&&event.button!==1))return;const link=event.target?.closest?.('a[data-stat-click]');if(!link||clicked.has(link))return;clicked.add(link);send(link.dataset.statClick,'click');};
 doc.addEventListener('click',click);doc.addEventListener('auxclick',click);doc.addEventListener('visibilitychange',tick);view();
 const timer=token&&article?win.setInterval(tick,1000):null;
 return ()=>{if(timer!==null)win.clearInterval(timer);doc.removeEventListener('click',click);doc.removeEventListener('auxclick',click);doc.removeEventListener('visibilitychange',tick);};
}
if(typeof window!=='undefined')initPublicAnalytics(window);
