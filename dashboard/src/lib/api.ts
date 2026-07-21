const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5050/api";
const key = "drive-access-token";
export type Session={accessToken:string;user:{id:string;email:string;name:string|null}};
export type Overview={metrics:{label:string;value:string|number}[];recentUsers:{id:string;email:string;name:string|null;createdAt:string}[]};
export const token=()=>localStorage.getItem(key);export const clear=()=>localStorage.removeItem(key);export const save=(s:Session)=>localStorage.setItem(key,s.accessToken);
export async function api<T>(path:string,options:RequestInit={}){const res=await fetch(`${base}${path}`,{...options,headers:{"Content-Type":"application/json",...(token()?{Authorization:`Bearer ${token()}`}:{ }),...options.headers}});const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(Array.isArray(body.message)?body.message[0]:body.message||"Unable to complete that request.");return body as T;}
