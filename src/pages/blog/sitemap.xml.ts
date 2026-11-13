import {articlePaths, inLanguage, posts} from '../../lib/posts';
import {blogPath, languages} from '../../lib/blog-language.mjs';

export async function GET() {
 const published=await posts();
 const paths=languages.filter(language=>published.some(post=>inLanguage(post,language))).map(blogPath);
 paths.push(...published.flatMap(post=>Object.values(articlePaths(post))));
 const urls=paths.map(path=>new URL(path,'https://bcift.co.id').href);
 const entries=urls.map(url=>`<url><loc>${url.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</loc></url>`).join('');
 return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,{
  headers:{'Content-Type':'application/xml','Cache-Control':'no-store'}
 });
}
