import {marked} from 'marked';
const markdown=/(?:^|\n)\s{0,3}(?:#{1,6}\s|[-+*]\s|\d+[.)]\s|>\s)|\*\*[^*]+\*\*|__[^_]+__|\[[^\]\n]+\]\([^\n]+\)|(?:^|\s)\*[^*\n]+\*(?=\s|[.,!?]|$)/;
const listItem=/^\s{0,3}(?:[-+*]\s|\d+[.)]\s)/;
const block=/^\s{0,3}(?:#{1,6}\s|>\s)/;
const options={gfm:true,breaks:true,async:false};

// Clipboard HTML can contain literal Markdown inside <p> tags. Repair that structure
// without flattening genuine rich text, images, tables or existing lists.
export function normalizeArticleHtml(value){
 let html=String(value||'').replace(/<(?:p|div)\b[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/(?:p|div)>/gi,'');
 if(!/<[a-z][\s\S]*>/i.test(html)&&markdown.test(html))html=marked.parse(html,options);
 html=html.replace(/(?:<p\b[^>]*>[\s\S]*?<\/p>\s*)+/gi,group=>{
  const pieces=[...group.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(match=>match[1]);
  const output=[];let list=[];
  const flush=()=>{if(list.length){output.push(marked.parse(list.join('\n'),options));list=[];}};
  for(const inner of pieces){
   const text=inner.replace(/<br\s*\/?>/gi,'\n').trim();
   if(listItem.test(text)){list.push(text);continue;}
   flush();
   if(block.test(text))output.push(marked.parse(text,options));
   else if(markdown.test(text))output.push('<p>'+marked.parseInline(text,options)+'</p>');
   else output.push('<p>'+inner+'</p>');
  }
  flush();return output.join('\n');
 });
 html=html.replace(/<h([1456])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(_,level,text)=>`<h${level==='1'?2:3}>${text}</h${level==='1'?2:3}>`);
 return html.replace(/(<\/?(?:p|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|th|td)\b[^>]*>)\s+(?=<\/?(?:p|h[1-6]|ul|ol|li|blockquote|table|thead|tbody|tr|th|td)\b)/gi,'$1').trim();
}
