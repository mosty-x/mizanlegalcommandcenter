import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { getDataDirectory } from "@/db";

type StoredBody={arrayBuffer():Promise<ArrayBuffer>};
export type AppBucket={put(key:string,value:ArrayBuffer|Uint8Array|string,options?:unknown):Promise<unknown>;get(key:string):Promise<StoredBody|null>;delete(key:string|string[]):Promise<void>};
export type RuntimeEnvironment={CREDENTIAL_MASTER_KEY?:string;SESSION_SIGNING_KEY?:string;ALLOWED_AI_HOSTS?:string;TERMS_VERSION?:string};
export function getRuntimeEnvironment():RuntimeEnvironment{return{CREDENTIAL_MASTER_KEY:process.env.CREDENTIAL_MASTER_KEY,SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY,ALLOWED_AI_HOSTS:process.env.ALLOWED_AI_HOSTS,TERMS_VERSION:process.env.TERMS_VERSION};}

function blobRoot():string{return path.join(getDataDirectory(),"blobs");}
function safePath(key:string):string{if(!/^[a-zA-Z0-9/_-]+\.bin$/.test(key))throw new Error("STORAGE_KEY_INVALID");const root=path.resolve(blobRoot());const target=path.resolve(root,key);if(!target.startsWith(`${root}${path.sep}`))throw new Error("STORAGE_KEY_INVALID");return target;}

const fileBucket:AppBucket={
  async put(key,value){const target=safePath(key);await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});const bytes=typeof value==="string"?Buffer.from(value):Buffer.from(value instanceof Uint8Array?value:new Uint8Array(value));const temporary=`${target}.${crypto.randomUUID()}.tmp`;await fs.writeFile(temporary,bytes,{mode:0o600});await fs.rename(temporary,target);return{key};},
  async get(key){try{const bytes=await fs.readFile(safePath(key));return{async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;}};}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}},
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys]){try{await fs.unlink(safePath(key));}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}},
};
export function requireBucket():AppBucket{return fileBucket;}
