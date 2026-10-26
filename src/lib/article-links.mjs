export function articleLinkAttributes(attributes){
 const {target,rel,...rest}=attributes;
 return typeof rest.href==='string'&&rest.href.trim()&&!/^(?:#|mailto:|tel:)/i.test(rest.href.trim())?{...rest,target:'_blank',rel:'noopener noreferrer'}:rest;
}
// Keep legacy Markdown articles consistent with articles from the CMS.
export function articleLinkTargets(){
 return {name:'article-link-targets',element:{filter:['a'],visit(node,ctx){
  const attributes=articleLinkAttributes(node.properties??{});
  if(attributes.target){ctx.setProperty(node,'target',attributes.target);ctx.setProperty(node,'rel',attributes.rel);}
 }}};
}
