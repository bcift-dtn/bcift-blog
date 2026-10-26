// Shared by CMS validation, editor choices and the public blog.
export const CATEGORY_VALUES=['Travel Guide','Travel Tips','Destination','Informasi Terminal','Informasi BCIFT','Terminal Guide','Explore Batam'];
export const PUBLIC_CATEGORIES=[...CATEGORY_VALUES];
export const categoryLabel=value=>value==='Travel Tips'?'Tips & Essentials':value;
export const editorCategoryLabel=categoryLabel;
export function validateCategories(values){
 if(!Array.isArray(values)||!values.length||values.length>CATEGORY_VALUES.length||values.some(value=>!CATEGORY_VALUES.includes(value)))throw new Error('Pilih minimal satu kategori artikel yang tersedia.');
 return [...new Set(values)];
}
export function readCategories(value,fallback='Travel Guide'){
 try{const values=typeof value==='string'?JSON.parse(value):value;return validateCategories(values);}catch{return CATEGORY_VALUES.includes(fallback)?[fallback]:['Travel Guide'];}
}
export const postCategories=data=>readCategories(data.categories,data.category);
export const categoryText=data=>postCategories(data).map(categoryLabel).join(' · ');
export const matchesCategory=(values,active)=>active==='All stories'||values.includes(active);
