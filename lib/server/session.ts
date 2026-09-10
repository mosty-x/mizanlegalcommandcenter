import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getRuntimeEnvironment } from "@/lib/server/runtime";

export const SESSION_COOKIE="mizan_session";
const ONE_YEAR=60*60*24*365;

function key():Buffer{const value=getRuntimeEnvironment().SESSION_SIGNING_KEY;if(!value)throw new Error("SESSION_KEY_UNAVAILABLE");const decoded=Buffer.from(value,"base64");if(decoded.length!==32)throw new Error("SESSION_KEY_INVALID");return decoded;}
function signature(id:string):string{return createHmac("sha256",key()).update(`mizan:v1:${id}`).digest("base64url");}
function cookieMap(header:string|null):Map<string,string>{const map=new Map<string,string>();for(const part of (header??"").split(";")){const index=part.indexOf("=");if(index<1)continue;map.set(part.slice(0,index).trim(),decodeURIComponent(part.slice(index+1).trim()));}return map;}

export function readVisitorId(cookieHeader:string|null):string|null{const value=cookieMap(cookieHeader).get(SESSION_COOKIE);if(!value)return null;const [id,supplied,...rest]=value.split(".");if(rest.length||!id||!supplied||!/^[0-9a-f-]{36}$/.test(id))return null;const expected=signature(id);const a=Buffer.from(supplied);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b)?id:null;}
export function createVisitorIdentity():{id:string;cookie:string}{const id=randomUUID();const value=`${id}.${signature(id)}`;const secure=process.env.NODE_ENV==="production"?"; Secure":"";return{id,cookie:`${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ONE_YEAR}; Priority=High${secure}`};}
