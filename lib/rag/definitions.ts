import { z } from "zod";
import enforceability from "@/workflows/egypt/enforceability.json";
import disputes from "@/workflows/egypt/disputes.json";
import deal from "@/workflows/egypt/deal-room.json";
import regulatory from "@/workflows/egypt/regulatory.json";
import client from "@/workflows/egypt/client-command.json";
import { RAG_VERSION, topics, type ToolSlug } from "./contracts";
import { toolSlugSchema } from "@/lib/security";

const definitionSchema = z.object({
  version:z.literal(RAG_VERSION),slug:toolSlugSchema,title:z.string(),jurisdiction:z.literal("EG"),
  topics:z.array(z.enum(topics)).min(1),sourceIds:z.array(z.string()).min(1),
  allowedKinds:z.array(z.string()).min(1),analysisInstruction:z.string().min(10),
  product:z.enum(["clause-review","chronology-matrix","deal-register","procedure-graph","client-brief"]),maxConcurrency:z.literal(2),
  nodes:z.array(z.object({id:z.string().regex(/^[a-z-]+$/),label:z.string(),handler:z.enum(["extract","retrieve","rerank","analyze","gate","verify","product"]),dependsOn:z.array(z.string()),instruction:z.string().optional()}).strict()).min(7).max(16),
}).strict();
export type DagDefinition = z.infer<typeof definitionSchema>;
export function validateDag(raw:unknown):DagDefinition {
  const dag=definitionSchema.parse(raw), ids=new Set(dag.nodes.map(n=>n.id));
  if(ids.size!==dag.nodes.length)throw new Error("RAG_DAG_INVALID");
  const visited=new Set<string>(),stack=new Set<string>();
  function visit(id:string){
    if(stack.has(id)||!ids.has(id))throw new Error("RAG_DAG_INVALID");
    if(visited.has(id))return;
    stack.add(id);for(const dep of dag.nodes.find(n=>n.id===id)!.dependsOn)visit(dep);
    stack.delete(id);visited.add(id);
  }
  dag.nodes.forEach(n=>visit(n.id));
  for(const handler of ["retrieve","rerank","analyze","gate","verify","product"]){if(dag.nodes.filter(n=>n.handler===handler).length!==1)throw new Error("RAG_DAG_INVALID");}
  const required:Record<string,string[]>={rerank:["retrieve"],analyze:["extract","rerank"],gate:["analyze"],verify:["gate"],product:["verify"]};
  for(const [handler,deps] of Object.entries(required)){
    const node=dag.nodes.find(n=>n.handler===handler)!;
    for(const dep of deps)if(!node.dependsOn.some(id=>dag.nodes.find(n=>n.id===id)?.handler===dep))throw new Error("RAG_DAG_INVALID");
  }
  return dag;
}
export const EGYPT_DAGS=[enforceability,disputes,deal,regulatory,client].map(validateDag);
export function getDag(slug:ToolSlug){return EGYPT_DAGS.find(d=>d.slug===slug)!;}
