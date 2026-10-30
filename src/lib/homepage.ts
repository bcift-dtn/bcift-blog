import {posts,href} from './posts';
import {homepageSettings,selectHomepage} from '../server/homepage.mjs';
import {thumbnailFocus} from './image-focus.mjs';
import {categoryText} from './categories.mjs';
export function homepageCard(p:Awaited<ReturnType<typeof posts>>[number]){return {slug:p.id,title:p.data.title,description:p.data.description,url:href(p.id),image:p.data.image,imageAlt:p.data.imageAlt||p.data.title,thumbnail:thumbnailFocus(p.data.imageFocus),category:categoryText(p.data),publishedAt:p.data.publishedAt?.toISOString()??null};}
export async function homepageData(){const published=await posts(),settings=homepageSettings();return {settings,available:published.map(homepageCard),articles:selectHomepage(settings,published).map(homepageCard)};}
