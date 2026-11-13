import {otherLanguage} from './blog-language.mjs';
import { getCollection } from 'astro:content';
import {db,asPost} from '../server/cms.mjs';
export async function posts(){
 const cms=db.prepare("SELECT * FROM articles WHERE status='published' ORDER BY published_at DESC").all().map(asPost);
 const legacy=(await getCollection('blog')).filter(p=>!p.data.draft&&!cms.some(c=>c.id===p.id));
 return [...cms,...legacy].sort((a,b)=>(b.data.publishedAt?.getTime()??0)-(a.data.publishedAt?.getTime()??0));
}
export const href=(id:string, alternate?:string)=>alternate ? `/blog/${alternate}/${id}/` : `/blog/${id}/`;
export type BlogPost = Awaited<ReturnType<typeof posts>>[number];
export const postLanguage = (post:BlogPost) => 'language' in post && post.language === 'id' ? 'id' : 'en';
export const hasTranslation = (post:BlogPost) => 'translation' in post && post.translation.published;
export function articlePaths(post:BlogPost, includeDraft = false):Record<string,string> {
 const language = postLanguage(post);
 const alternate = otherLanguage(language);
 const paths:Record<string,string> = {[language]:href(post.id)};
 if (hasTranslation(post) || (includeDraft && 'translation' in post && post.translation.title && post.translation.body)) paths[alternate] = href(post.id,alternate);
 return paths;
}
export function inLanguage(post:BlogPost, language:string, includeDraft = false):BlogPost | null {
 if (postLanguage(post) === language) return post;
 if (!('translation' in post) || !articlePaths(post,includeDraft)[language]) return null;
 const translation = post.translation;
 return {...post, body:translation.body, data:{...post.data, title:translation.title, description:translation.description, seoTitle:translation.seoTitle, imageAlt:translation.imageAlt || post.data.imageAlt, keywords:undefined}};
}
