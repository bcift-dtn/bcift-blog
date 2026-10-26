const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
export function allowedRequestOrigin(request,{development=false,publicOrigin}={}){
 const origin=request.headers.get('origin');
 if(!origin||origin==='null')return null;
 let parsed;try{parsed=new URL(origin);}catch{return null;}
 if(parsed.origin!==origin)return null;
 const destination=new URL(request.url);
 if(origin===destination.origin&&(localHosts.has(parsed.hostname)||origin==='https://bcift.co.id'))return parsed;
 const configured=publicOrigin||(development?'https://t9k80gqr-4321.asse.devtunnels.ms':undefined);
 if(configured){try{if(origin===new URL(configured).origin)return parsed;}catch{}}
 return null;
}
