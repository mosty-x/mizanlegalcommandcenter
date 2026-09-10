import { createHash } from "node:crypto";
import type { Evidence } from "./contracts";

export function digest(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
// Normalization affects search only. Original evidence/quotations are never rewritten.
export function normalizeArabic(text:string){return text.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));}
const stops=new Set(["في","من","علي","الي","عن","ان","هو","هي","و","او","التي","الذي","هذا","هذه","the","of","and","to","a","is"]);
export function tokens(text:string){return (normalizeArabic(text).match(/[\p{L}\p{N}]+/gu)??[]).filter(t=>t.length>1&&!stops.has(t));}
export function lexicalRank(query:string,items:Evidence[]){
  const docs=items.map(i=>tokens(i.text)),terms=[...new Set(tokens(query))];
  const average=docs.reduce((s,d)=>s+d.length,0)/(docs.length||1)||1;
  const frequencies=new Map(terms.map(t=>[t,docs.filter(d=>d.includes(t)).length]));
  return items.map((item,i)=>{let score=0;for(const term of terms){const tf=docs[i].filter(t=>t===term).length;if(!tf)continue;const df=frequencies.get(term)!;score+=Math.log(1+(items.length-df+0.5)/(df+0.5))*(tf*2.2)/(tf+1.2*(0.25+0.75*docs[i].length/average));}return {id:item.id,score};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export function cosine(a:number[],b:number[]){
  if(!a.length||a.length!==b.length||a.some(x=>!Number.isFinite(x))||b.some(x=>!Number.isFinite(x)))throw new Error("RAG_EMBEDDING_INVALID");
  let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;}
  if(!aa||!bb)throw new Error("RAG_EMBEDDING_INVALID");return dot/Math.sqrt(aa*bb);
}
export function fuseRanks(lexical:{id:string;score:number}[],dense:{id:string;score:number}[],limit:number){
  const scores=new Map<string,number>();for(const ranking of [lexical,dense])ranking.forEach((r,i)=>scores.set(r.id,(scores.get(r.id)||0)+1/(60+i+1)));
  return [...scores].map(([id,score])=>({id,score})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);
}
export function hybridCandidates(query:string,items:Evidence[],queryVector:number[],vectors:number[][],limit:number){
  if(items.length!==vectors.length)throw new Error("RAG_EMBEDDING_INVALID");
  const dense=items.map((item,i)=>({id:item.id,score:cosine(queryVector,vectors[i])})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const byId=new Map(items.map(i=>[i.id,i]));
  return fuseRanks(lexicalRank(query,items),dense,limit).map(r=>({...byId.get(r.id)!,score:r.score}));
}
