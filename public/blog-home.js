/* Mount on the same domain as the blog backend. Uses the saved homepage selection. */
(async()=>{for(const container of document.querySelectorAll('[data-bcift-blog-home]')){try{
 const response=await fetch('/blog/featured/',{cache:'no-store'});if(!response.ok)throw Error('Blog unavailable');const {articles}=await response.json();
 const nodes=articles.map(article=>{const link=document.createElement('a');link.className='bcift-home-card';link.href=article.url;link.target='_blank';link.rel='noopener noreferrer';
 if(article.image){const img=document.createElement('img');img.src=article.image;img.alt=article.imageAlt;img.loading='lazy';img.width=720;img.height=480;img.style.objectFit=article.thumbnail.fit;img.style.objectPosition=article.thumbnail.x+'% '+article.thumbnail.y+'%';link.append(img);}
 const copy=document.createElement('div'),tag=document.createElement('small'),heading=document.createElement('h3'),description=document.createElement('p');tag.textContent=article.category;heading.textContent=article.title;description.textContent=article.description;copy.append(tag,heading,description);link.append(copy);return link;});container.replaceChildren(...nodes);
 }catch{container.hidden=true;}}})();
