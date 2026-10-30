import type {APIRoute} from 'astro';
import {currentUser} from '../../server/cms.mjs';
import {parseAnalyticsToken,recordAnalytics} from '../../server/analytics.mjs';
import {posts} from '../../lib/posts';
export const POST:APIRoute=async({request,cookies})=>{
 const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'};
 const empty=()=>new Response(null,{status:204,headers});
 if(currentUser(cookies.get('bcift_session')?.value))return empty();
 const site=request.headers.get('sec-fetch-site');if(site&&!['same-origin','none'].includes(site))return new Response(null,{status:403,headers});
 if(/bot|crawler|spider|headless|preview|facebookexternalhit|lighthouse/i.test(request.headers.get('user-agent')||''))return empty();
 if(Number(request.headers.get('content-length')||0)>2048)return new Response(null,{status:413,headers});
 try{const raw=await request.text();if(raw.length>2048)return new Response(null,{status:413,headers});const data=JSON.parse(raw);const payload=parseAnalyticsToken(data.token);if(!(await posts()).some(post=>post.id===payload.slug))return empty();recordAnalytics(data.token,data.event);return empty();}catch{return new Response(null,{status:400,headers});}
};
