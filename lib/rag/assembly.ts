import memory from "@/workflows/engineering/memory.json";
import context from "@/workflows/engineering/context.json";
import { validateUnitSource,sourceAppliesToTool } from "./catalog";
import { eligibleCorpus,checkedFacts } from "./evidence";
import { digest } from "./retrieval";
import type { DagDefinition } from "./definitions";
import type { Evidence,Fact,LegalUnit,NodeTrace,RagPolicy } from "./contracts";
export const ENGINEERING_DAGS=[memory,context];
type Graph=typeof memory;
async function graphRun(graph:Graph,handlers:Record<string,()=>unknown>,onNode?: (event:NodeTrace)=>Promise<void>){
 const required=Object.keys(handlers);if(graph.nodes.length!==required.length||graph.nodes.some((n,i)=>n.id!==required[i]||JSON.stringify(n.dependsOn)!==JSON.stringify(i?[required[i-1]]:[])))throw new Error("RAG_DAG_INVALID");
 const done=new Set<string>(),trace:NodeTrace[]=[];
 for(const node of graph.nodes){if(done.has(node.id)||!handlers[node.id]||node.dependsOn.some(id=>!done.has(id)))throw new Error("RAG_DAG_INVALID");
  const start=Date.now(),event:NodeTrace={id:node.id,label:node.label,startedAt:new Date().toISOString(),durationMs:0,status:"running"};trace.push(event);await onNode?.({...event});
  try{const result=handlers[node.id]();event.status="completed";event.outputHash=digest(result);done.add(node.id);}catch(e){event.status="failed";event.durationMs=Date.now()-start;await onNode?.({...event});throw e;}
  event.durationMs=Date.now()-start;await onNode?.({...event});
 }return trace;
}
export async function prepareMemory(args:{units:LegalUnit[];dag:DagDefinition;policy:RagPolicy;asOf:string;framework:string;onNode?:(n:NodeTrace)=>Promise<void>}){
 let scoped:LegalUnit[]=[],law:Evidence[]=[];let snapshot="";
 const trace=await graphRun(memory,{
  "memory-permissions":()=>{scoped=args.units.filter(u=>{validateUnitSource(u);return u.jurisdiction==="EG"&&u.approved&&args.policy.sourceIds.includes(u.sourceId)&&args.dag.sourceIds.includes(u.sourceId)&&sourceAppliesToTool(u.sourceId,args.dag.slug)&&u.tools.includes(args.dag.slug)&&u.topics.some(t=>args.dag.topics.includes(t));});return scoped.map(u=>u.id);},
  "memory-validity":()=>{law=eligibleCorpus(scoped,args.dag,args.policy,args.asOf,args.framework);return law.map(u=>u.id);},
  "memory-snapshot":()=>{law.sort((a,b)=>a.id.localeCompare(b.id));snapshot=digest(law);return {snapshot,units:law.length};},
 },args.onNode);
 return {law,trace,snapshot,excluded:args.units.length-law.length};
}
export async function prepareContext(args:{matter:Evidence[];law:Evidence[];facts:Fact[];request:unknown;system:string;maxChars:number;onNode?:(n:NodeTrace)=>Promise<void>}){
 let facts:Fact[]=[],user="";
 const trace=await graphRun(context,{
  "context-evidence":()=>{const all=[...args.matter,...args.law];if(new Set(all.map(e=>e.id)).size!==all.length||args.matter.some(e=>e.kind!=="matter")||args.law.some(e=>e.kind!=="law"||!e.legal))throw new Error("RAG_DOCUMENT_SCOPE");return {matter:args.matter.map(e=>e.id),law:args.law.map(e=>e.id)};},
  "context-chronology":()=>{facts=checkedFacts(args.facts,args.matter).sort((a,b)=>(a.date??"9999").localeCompare(b.date??"9999")||a.id.localeCompare(b.id));return facts;},
  "context-budget":()=>{user=`القانون المعتمد:\n${JSON.stringify(args.law.map(e=>({id:e.id,text:e.text,metadata:e.legal})).sort((a,b)=>a.id.localeCompare(b.id)))}\nالمستندات:\n${JSON.stringify(args.matter)}\nالوقائع المستخرجة بيانات مساعدة وليست سندًا مستقلًا:\n${JSON.stringify(facts)}\nالمطلوب:\n${JSON.stringify(args.request)}`;
   assertContextBudget(args.system,user,args.maxChars);return {characters:args.system.length+user.length,budget:args.maxChars,undatedFacts:facts.filter(f=>!f.date).length};},
 },args.onNode);return {user,trace,characters:args.system.length+user.length};
}
export function assertContextBudget(system:string,user:string,maxChars:number){if(system.length+user.length>maxChars)throw new Error("RAG_CONTEXT_BUDGET");}
