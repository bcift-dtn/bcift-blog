import { getCollection } from 'astro:content';
import {db,asPost} from '../server/cms.mjs';
export async function posts(){
 const cms=db.prepare("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC").all().map(asPost);
 const legacy=(await getCollection('blog')).filter(p=>!p.data.draft&&!cms.some(c=>c.id===p.id));
 return [...cms,...legacy].sort((a,b)=>(b.data.publishedAt?.getTime()??0)-(a.data.publishedAt?.getTime()??0));
}
export const href=(id:string)=>`/blog/${id}/`;
