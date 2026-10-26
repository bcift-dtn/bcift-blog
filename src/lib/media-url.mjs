// Keep dynamic media URLs canonical in both Astro development and production.
export function mediaUrl(value){
 if(typeof value!=='string')return value;
 return value.replace(/^\/blog\/media\/([a-f0-9]{32})\/?$/, '/blog/media/$1/');
}
