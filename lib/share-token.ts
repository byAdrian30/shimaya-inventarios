import {env} from 'cloudflare:workers';
export function configuredShareToken(){
 const token=env.READ_ONLY_SHARE_TOKEN;
 return token&&/^[A-Za-z0-9_-]{43,128}$/.test(token)?token:null;
}
export function hasSharedToken(request:Request){
 const token=configuredShareToken(),supplied=request.headers.get('Authorization')||'',expected=token?'Bearer '+token:'';
 if(!token||supplied.length!==expected.length)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 return difference===0;
}
export function denySharedWrite(request:Request){
 return hasSharedToken(request)?Response.json({error:'Este acceso es de solo lectura. No permite modificar datos.'},{status:403,headers:{'Cache-Control':'private, no-store',Vary:'Authorization'}}):null;
}
