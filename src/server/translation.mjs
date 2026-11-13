import {cleanBody, readTranslation} from './cms.mjs';
import {languages, otherLanguage} from '../lib/blog-language.mjs';

export const translationConfigured = () => !!process.env.CMS_GOOGLE_TRANSLATE_KEY?.trim();

export async function generateTranslation(article, request = fetch) {
 const key = process.env.CMS_GOOGLE_TRANSLATE_KEY?.trim();
 if (!key) throw new Error('Terjemahan otomatis belum dikonfigurasi di server.');
 const source = article.language;
 if (!languages.includes(source)) throw new Error('Pilih bahasa sumber artikel.');
 const target = otherLanguage(source);
 const fields = ['title','description','seoTitle','imageAlt'];
 const values = fields.map(field => String(article[field] ?? '').trim());
 const body = cleanBody(article.body ?? '');
 if (!values[0] || !values[1] || !body) throw new Error('Isi judul, ringkasan, dan artikel sebelum menerjemahkan.');
 if ([...body].length + values.join('').length > 25_000) throw new Error('Artikel terlalu panjang untuk diterjemahkan sekaligus.');

 async function translate(q, format) {
  let response;
  try {
   response = await request('https://translation.googleapis.com/language/translate/v2',{
    method:'POST', headers:{'Content-Type':'application/json','X-Goog-Api-Key':key},
    body:JSON.stringify({q,source,target,format}), signal:AbortSignal.timeout(20_000)
   });
  } catch { throw new Error('Layanan terjemahan tidak dapat dijangkau. Coba lagi.'); }
  if (!response.ok) throw new Error('Layanan terjemahan gagal. Periksa konfigurasi Google Cloud atau coba lagi.');
  const payload = await response.json();
  const results = payload.data?.translations?.map(item => item.translatedText);
  if (results?.length !== q.length || results.some(value => typeof value !== 'string')) throw new Error('Hasil terjemahan tidak lengkap. Coba lagi.');
  return results;
 }
 const inputs = values.filter(Boolean);
 const [translated, [translatedBody]] = await Promise.all([translate(inputs,'text'),translate([body],'html')]);
 const result = {body:translatedBody,published:false};
 fields.forEach((field,index) => {result[field] = values[index] ? translated.shift() : '';});
 return readTranslation(result);
}
