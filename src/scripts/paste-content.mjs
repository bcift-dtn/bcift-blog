import {normalizeArticleHtml} from '../lib/article-content.mjs';
import {mediaUrl} from '../lib/media-url.mjs';
import createDOMPurify from 'dompurify';
import {marked} from 'marked';

// Keep article structure, while removing source-site UI, styling and executable HTML.
export function createPasteFormatter(window){
 const purifier=createDOMPurify(window);
 const tags=['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','ul','ol','li','blockquote','a','img','table','thead','tbody','tr','th','td','hr','div'];
 const options={ALLOWED_TAGS:tags,ALLOWED_ATTR:['href','title','src','alt','width','height'],ALLOW_DATA_ATTR:false,ALLOW_ARIA_ATTR:false};
 return function formatPaste({html='',text=''}={}){
  if(html.length>1000000||text.length>200000)throw new Error('Teks terlalu panjang. Tempel artikel dalam bagian yang lebih kecil.');
  const source=html.trim()?html:marked.parse(text,{gfm:true,breaks:true,async:false});
  const template=window.document.createElement('template');
  // Some clipboard exporters wrap normal text in <b style="font-weight:normal">.
  // Read that override before stripping styles, otherwise the wrapper bolds everything.
  template.innerHTML=purifier.sanitize(source,{...options,ALLOWED_ATTR:[...options.ALLOWED_ATTR,'style']});
  for(const node of [...template.content.querySelectorAll('b,strong')].reverse()){
   const weight=node.style.fontWeight;
   if(weight==='normal'||(Number(weight)>0&&Number(weight)<600))node.replaceWith(...node.childNodes);
  }
  for(const node of template.content.querySelectorAll('[style]'))node.removeAttribute('style');
  for(const node of [...template.content.querySelectorAll('div')].reverse()){
   if(node.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote'))node.replaceWith(...node.childNodes);
   else{const paragraph=window.document.createElement('p');paragraph.append(...node.childNodes);node.replaceWith(paragraph);}
  }
  template.innerHTML=purifier.sanitize(normalizeArticleHtml(template.innerHTML),options);
  for(const node of template.content.querySelectorAll('h1,h4,h5,h6')){
   const heading=window.document.createElement(node.tagName==='H1'?'h2':'h3');heading.append(...node.childNodes);node.replaceWith(heading);
  }
  for(const link of template.content.querySelectorAll('a[href]')){
   if(!/^(?:https?:\/\/|mailto:|#|\/(?!\/))/i.test(link.getAttribute('href')||''))link.removeAttribute('href');
  }
  for(const image of template.content.querySelectorAll('img')){
   if(!/^(?:https:\/\/|\/(?!\/))/i.test(image.getAttribute('src')||''))image.remove();else image.setAttribute('src',mediaUrl(image.getAttribute('src')));
  }
  return purifier.sanitize(template.innerHTML,options);
 };
}
