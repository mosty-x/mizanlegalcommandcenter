import "server-only";
import { getDb } from "@/db";
import { decryptText,encryptText } from "@/lib/server/crypto";
import { getDag } from "./definitions";
import type { ToolSlug } from "./contracts";
import { defaultSnapshot,validateProfile,type ProfileSnapshot } from "./profile";
import { digest } from "./retrieval";
type Row={revision:number;content_hash:string;ciphertext:string;iv:string;created_at:string};
export function profileRevisionNow(userId:string,tool:ToolSlug){const row=getDb().prepare("SELECT revision,content_hash FROM rag_profiles WHERE user_id=? AND tool_slug=? ORDER BY revision DESC LIMIT 1").get(userId,tool) as {revision:number;content_hash:string}|undefined;return row?`${row.revision}:${row.content_hash}`:`0:${defaultSnapshot(getDag(tool)).hash}`;}
export async function readProfile(userId:string,tool:ToolSlug,revision?:number):Promise<ProfileSnapshot>{
 if(revision===0)return defaultSnapshot(getDag(tool));
 const sql=revision===undefined?"SELECT * FROM rag_profiles WHERE user_id=? AND tool_slug=? ORDER BY revision DESC LIMIT 1":"SELECT * FROM rag_profiles WHERE user_id=? AND tool_slug=? AND revision=?";
 const row=getDb().prepare(sql).get(...(revision===undefined?[userId,tool]:[userId,tool,revision])) as Row|undefined;
 if(!row){if(revision!==undefined)throw new Error("RAG_PROFILE_NOT_FOUND");return defaultSnapshot(getDag(tool));}
 const profile=validateProfile(JSON.parse(await decryptText(row.ciphertext,row.iv,userId,`rag-profile:${tool}:${row.content_hash}`)),getDag(tool));
 if(digest(profile)!==row.content_hash)throw new Error("RAG_OUTPUT_INVALID");return {profile,revision:row.revision,hash:row.content_hash,createdAt:row.created_at};
}
export function listProfileHistory(userId:string,tool:ToolSlug){return getDb().prepare("SELECT revision,content_hash AS hash,created_at AS createdAt FROM rag_profiles WHERE user_id=? AND tool_slug=? ORDER BY revision DESC").all(userId,tool);}
export async function saveProfile(userId:string,tool:ToolSlug,raw:unknown,expectedRevision:number){
 const profile=validateProfile(raw,getDag(tool)),hash=digest(profile),encrypted=await encryptText(JSON.stringify(profile),userId,`rag-profile:${tool}:${hash}`),db=getDb();
 db.exec("BEGIN IMMEDIATE");try{const last=db.prepare("SELECT MAX(revision) AS n FROM rag_profiles WHERE user_id=? AND tool_slug=?").get(userId,tool) as {n:number|null};
 const revision=Number(last.n??0);if(revision!==expectedRevision)throw new Error("RAG_PROFILE_CONFLICT");if(revision>=100)throw new Error("RAG_PROFILE_LIMIT");
 db.prepare("INSERT INTO rag_profiles(user_id,tool_slug,revision,ciphertext,iv,content_hash,created_at) VALUES (?,?,?,?,?,?,?)").run(userId,tool,revision+1,encrypted.ciphertext,encrypted.iv,hash,new Date().toISOString());db.exec("COMMIT");
 }catch(e){db.exec("ROLLBACK");throw e;}return readProfile(userId,tool);
}
