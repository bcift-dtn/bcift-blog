import {homepageData} from '../../lib/homepage';
export async function GET(){const {articles}=await homepageData();return Response.json({articles},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'}});}
