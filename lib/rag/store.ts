import "server-only";
import { getDb } from "@/db";
import { encryptText,decryptText } from "@/lib/server/crypto";
import { legalUnitSchema,type LegalUnit,type NodeTrace } from "./contracts";
import { validateUnitSource } from "./catalog";
import { digest } from "./retrieval";

export function corpusRevisionNow(userId:string){
  return digest(getDb().prepare("SELECT id,content_hash FROM legal_units WHERE user_id=? ORDER BY id").all(userId));
}
export async function readCorpus(userId:string){
  const rows=getDb().prepare("SELECT id,ciphertext,iv,content_hash FROM legal_units WHERE user_id=? ORDER BY id").all(userId) as {id:string;ciphertext:string;iv:string;content_hash:string}[];
  const revision=digest(rows.map(({id,content_hash})=>({id,content_hash})));
  const units:LegalUnit[]=[];
  for(const r of rows)units.push(legalUnitSchema.parse(JSON.parse(await decryptText(r.ciphertext,r.iv,userId,`legal-unit:${r.id}`))));
  return {units,revision};
}
export async function importCorpus(userId:string,units:LegalUnit[]){
  const today=new Date().toISOString().slice(0,10),ids=new Set<string>();
  const prepared=[];
  for(const raw of units){const u=legalUnitSchema.parse(raw);validateUnitSource(u);
    if(ids.has(u.id)||u.verifiedOn>today||u.publishedOn>today)throw new Error("RAG_IMPORT_INVALID");ids.add(u.id);
    const data=JSON.stringify(u);prepared.push({id:u.id,hash:digest(u),...await encryptText(data,userId,`legal-unit:${u.id}`)});
  }
  const db=getDb();db.exec("BEGIN IMMEDIATE");
  try{
    const existing=db.prepare("SELECT id,content_hash FROM legal_units WHERE user_id=?").all(userId) as {id:string;content_hash:string}[];
    if(new Set([...existing.map(x=>x.id),...ids]).size>500)throw new Error("RAG_CORPUS_LIMIT");
    for(const p of prepared){const old=existing.find(x=>x.id===p.id);if(old&&old.content_hash!==p.hash)throw new Error("RAG_IMPORT_CONFLICT");
      db.prepare("INSERT OR IGNORE INTO legal_units (user_id,id,ciphertext,iv,content_hash) VALUES (?,?,?,?,?)").run(userId,p.id,p.ciphertext,p.iv,p.hash);}
    db.prepare("DELETE FROM rag_cache WHERE user_id=?").run(userId);db.exec("COMMIT");
  }catch(error){db.exec("ROLLBACK");throw error;}
}
export function revokeUnit(userId:string,id:string){const db=getDb();db.exec("BEGIN IMMEDIATE");try{const result=db.prepare("DELETE FROM legal_units WHERE user_id=? AND id=?").run(userId,id);db.prepare("DELETE FROM rag_cache WHERE user_id=?").run(userId);db.exec("COMMIT");return Number(result.changes)>0;}catch(error){db.exec("ROLLBACK");throw error;}}
export function clearRagCache(userId:string){getDb().prepare("DELETE FROM rag_cache WHERE user_id=?").run(userId);}
export async function readRagCache<T>(userId:string,key:string):Promise<T|null>{
  const db=getDb();db.prepare("DELETE FROM rag_cache WHERE expires_at<=?").run(Date.now());
  const row=db.prepare("SELECT ciphertext,iv FROM rag_cache WHERE user_id=? AND cache_key=?").get(userId,key) as {ciphertext:string;iv:string}|undefined;
  if(!row)return null;return JSON.parse(await decryptText(row.ciphertext,row.iv,userId,`rag-cache:${key}`)) as T;
}
export async function writeRagCache(userId:string,key:string,value:unknown,ttlSeconds:number){
  const plain=JSON.stringify(value);if(Buffer.byteLength(plain)>1500000)return;
  const encrypted=await encryptText(plain,userId,`rag-cache:${key}`),db=getDb();
  db.prepare("DELETE FROM rag_cache WHERE expires_at<=?").run(Date.now());
  // Bounded per-visitor storage, with no cached generated legal answers.
  const count=Number((db.prepare("SELECT COUNT(*) AS n FROM rag_cache WHERE user_id=?").get(userId) as {n:number}).n);
  if(count>=1200)db.prepare("DELETE FROM rag_cache WHERE user_id=? AND cache_key IN (SELECT cache_key FROM rag_cache WHERE user_id=? ORDER BY expires_at LIMIT 100)").run(userId,userId);
  db.prepare("INSERT OR REPLACE INTO rag_cache (user_id,cache_key,ciphertext,iv,expires_at) VALUES (?,?,?,?,?)").run(userId,key,encrypted.ciphertext,encrypted.iv,Date.now()+ttlSeconds*1000);
}
export async function recordNode(userId:string,runId:string,event:NodeTrace){getDb().prepare("INSERT OR REPLACE INTO rag_nodes (user_id,run_id,node_id,event_json) VALUES (?,?,?,?)").run(userId,runId,event.id,JSON.stringify(event));}
export function readNodes(userId:string,runId:string):NodeTrace[]{return (getDb().prepare("SELECT event_json FROM rag_nodes WHERE user_id=? AND run_id=? ORDER BY rowid").all(userId,runId) as {event_json:string}[]).map(r=>JSON.parse(r.event_json));}

export async function replaceUnit(userId:string,oldId:string,expectedRevision:string,raw:LegalUnit){
 const unit=legalUnitSchema.parse(raw);validateUnitSource(unit);
 const today=new Date().toISOString().slice(0,10);if(unit.verifiedOn>today||unit.publishedOn>today||unit.id===oldId)throw new Error("RAG_IMPORT_INVALID");
 const encrypted=await encryptText(JSON.stringify(unit),userId,`legal-unit:${unit.id}`),db=getDb();db.exec("BEGIN IMMEDIATE");
 try{if(corpusRevisionNow(userId)!==expectedRevision)throw new Error("RAG_CORPUS_CHANGED");
  if(!db.prepare("SELECT id FROM legal_units WHERE user_id=? AND id=?").get(userId,oldId))throw new Error("DOCUMENT_NOT_FOUND");
  db.prepare("INSERT INTO legal_units(user_id,id,ciphertext,iv,content_hash) VALUES (?,?,?,?,?)").run(userId,unit.id,encrypted.ciphertext,encrypted.iv,digest(unit));
  db.prepare("DELETE FROM legal_units WHERE user_id=? AND id=?").run(userId,oldId);clearRagCache(userId);db.exec("COMMIT");
 }catch(e){db.exec("ROLLBACK");throw e;}
}
