import {articlePaths, inLanguage, postLanguage, posts} from './posts';
import {asPost, db} from '../server/cms.mjs';

export async function getBlogArticle(slug: string | undefined, language?: string, preview = false) {
 if (!slug) return null;
 const row = db.prepare('SELECT * FROM articles WHERE slug=?').get(slug);
 const all = await posts();
 const original = row
  ? (row.status === 'published' || preview ? asPost(row) : null)
  : all.find(post => post.id === slug);
 if (!original) return null;

 const selected = language ?? postLanguage(original);
 if (language === postLanguage(original)) return null;
 const post = inLanguage(original, selected, preview);
 if (!post) return null;

 const related = all.filter(item => item.id !== slug)
  .flatMap(item => inLanguage(item, selected) ?? []).slice(0, 3);
 const languagePaths = articlePaths(original, preview);
 if (preview) {
  for (const code of Object.keys(languagePaths)) languagePaths[code] += '?preview=1';
 }
 return {post, related, language: selected, languagePaths, preview};
}
