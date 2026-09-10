import { catalogSource, sourceAppliesToTool, validateUnitSource } from "./catalog";
import type { Claim, Evidence, Fact, LegalUnit, RagPolicy } from "./contracts";
import type { DagDefinition } from "./definitions";
import { normalizeArabic, digest } from "./retrieval";

function quoteText(s:string){return s.normalize("NFC").replace(/\s+/g," ").trim();}
export function quoteExists(text:string,quote:string){return quoteText(text).includes(quoteText(quote));}
function dateInEvidence(date:string,evidence:Evidence[]){
  const [year,month,day]=date.split("-");
  const variants=[date,`${+day}/${+month}/${year}`,`${day}/${month}/${year}`,`${+day}-${+month}-${year}`,`${day}-${month}-${year}`];
  return evidence.some(e=>variants.some(v=>normalizeArabic(e.text).includes(v)));
}
export function eligibleCorpus(units:LegalUnit[],dag:DagDefinition,policy:RagPolicy,asOf:string,framework:string,today=new Date().toISOString().slice(0,10)){
  if(asOf>today)throw new Error("RAG_DATE_INVALID");
  const selected=units.filter(u=>{
    validateUnitSource(u);
    return u.approved && u.jurisdiction==="EG" && policy.sourceIds.includes(u.sourceId) && dag.sourceIds.includes(u.sourceId)
      && sourceAppliesToTool(u.sourceId,dag.slug) && u.tools.includes(dag.slug) && u.topics.some(t=>dag.topics.includes(t))
      && u.validFrom<=asOf && (!u.validTo||asOf<u.validTo) && u.publishedOn<=today && u.verifiedOn<=today
      && (Date.parse(today)-Date.parse(u.verifiedOn))/86400000 <= policy.maxSourceAgeDays
      && (u.framework==="EG"||u.framework===framework);
  });
  const versions=new Map<string,string>();
  for(const u of selected){const k=`${u.instrumentId}:${u.unitLabel}`;const existing=versions.get(k);if(existing && existing!==digest(u.text))throw new Error("RAG_SOURCE_CONFLICT");versions.set(k,digest(u.text));}
  return selected.map(u=>({id:`LAW-${u.id}`,kind:"law" as const,text:u.text,fileName:`${u.title} — ${u.unitLabel}`,legal:u}));
}
export function checkedFacts(facts:Fact[],evidence:Evidence[]){
  const byId=new Map(evidence.map(s=>[s.id,s]));
  return facts.filter(f=>f.citations.every(c=>{const s=byId.get(c.sourceId);return s?.kind==="matter"&&quoteExists(s.text,c.quote);}) && (!f.date||dateInEvidence(f.date,f.citations.map(c=>byId.get(c.sourceId)!))));
}
export type Rejection={id:string;reason:string};
export function gateClaims(claims:Claim[],evidence:Evidence[],dag:DagDefinition,maxItems:number){
  const byId=new Map(evidence.map(e=>[e.id,e])),accepted:Claim[]=[],rejected:Rejection[]=[];
  const mustHaveLaw=new Set(["risk","amendment","authority","procedure","requirement"]);
  for(const claim of claims){
    let reason="";
    if(claims.filter(c=>c.id===claim.id).length!==1)reason="معرّف نتيجة مكرر";
    else if(!dag.allowedKinds.includes(claim.kind))reason="نوع نتيجة خارج اختصاص الأداة";
    else if(!claim.factCitations.length)reason="لا يوجد سند من مستندات الملف";
    else if((claim.basis==="legal"||mustHaveLaw.has(claim.kind))&&!claim.lawCitations.length)reason="لا يوجد سند قانوني";
    else if(claim.factCitations.some(c=>{const s=byId.get(c.sourceId);return !s||s.kind!=="matter"||!quoteExists(s.text,c.quote);}))reason="اقتباس واقعي غير مطابق";
    else if(claim.lawCitations.some(c=>{const s=byId.get(c.sourceId);return !s||s.kind!=="law"||s.legal?.kind==="commentary"||!quoteExists(s.text,c.quote);}))reason="اقتباس قانوني غير مطابق";
    else if(claim.date&&!dateInEvidence(claim.date,claim.factCitations.map(c=>byId.get(c.sourceId)!)))reason="تاريخ غير موجود صراحة في المستند";
    else if(claim.dependsOn.includes(claim.id))reason="اعتماد دائري";
    if(reason)rejected.push({id:claim.id,reason});else accepted.push(claim);
  }
  if(accepted.length>maxItems)rejected.push(...accepted.splice(maxItems).map(c=>({id:c.id,reason:"تجاوز حد النتائج"})));
  return {accepted,rejected};
}
export function pruneDependencies(claims:Claim[]){
  const byId=new Map(claims.map(c=>[c.id,c]));
  function valid(id:string,stack:Set<string>):boolean {const c=byId.get(id);if(!c||stack.has(id))return false;return c.dependsOn.every(dep=>valid(dep,new Set([...stack,id])));}
  return claims.filter(c=>valid(c.id,new Set()));
}
export function assembleProduct(dag:DagDefinition,claims:Claim[]){
  const groups:Record<string,Claim[]>={};for(const kind of dag.allowedKinds)groups[kind]=claims.filter(c=>c.kind===kind);
  if(dag.product==="chronology-matrix")groups.event.sort((a,b)=>(a.date??"9999").localeCompare(b.date??"9999"));
  if(dag.product==="procedure-graph"){
    const ordered:Claim[]=[],visited=new Set<string>();function visit(c:Claim){if(visited.has(c.id))return;visited.add(c.id);for(const id of c.dependsOn){const dep=claims.find(x=>x.id===id);if(dep)visit(dep);}ordered.push(c);}claims.forEach(visit);
    return {type:dag.product,groups,orderedIds:ordered.map(c=>c.id),edges:claims.flatMap(c=>c.dependsOn.map(from=>({from,to:c.id})))};
  }
  return {type:dag.product,groups};
}
export function corpusMetadata(units:LegalUnit[]){return units.map(({text,...u})=>({...u,sha256:digest(text),sourceName:catalogSource(u.sourceId)?.name}));}
