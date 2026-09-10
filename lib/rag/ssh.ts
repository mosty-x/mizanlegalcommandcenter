import { createHmac } from "node:crypto";
import { z } from "zod";
import { sshExchange,SSH_PROTOCOL,validateSshCredentials } from "@/lib/server/ssh-transport";
import { claimSchema,RAG_VERSION,type Evidence,type RagPolicy,type ToolSlug } from "./contracts";
import { finalizeEgyptResult } from "./engine";
import type { ProfileSnapshot } from "./profile";
import { ENGINEERING_DAGS } from "./assembly";
import { getDag } from "./definitions";
import { gateClaims,pruneDependencies } from "./evidence";

const engineeringNode=z.object({id:z.string(),label:z.string().max(140),status:z.enum(["completed","skipped"]),startedAt:z.string().datetime(),durationMs:z.number().nonnegative().max(240000),outputHash:z.string().max(64).optional()});
const remoteSchema=z.object({
  engineering:z.object({memory:z.array(engineeringNode).length(3),context:z.array(engineeringNode).max(3),excludedUnits:z.number().int().nonnegative(),memorySnapshot:z.string().regex(/^[a-f0-9]{64}$/)}),
  profile:z.object({revision:z.number().int().nonnegative(),hash:z.string(),label:z.string().max(120),reviewedBy:z.string().max(100)}),
  harness:z.object({maxContextChars:z.number().int().min(20000).max(220000),externalActions:z.literal(false),silentTruncation:z.literal(false),unverifiedAnswers:z.literal(false)}),
  claims:z.array(claimSchema).max(16),
  selectedLegalIds:z.array(z.string()).max(16),
  corpusRevision:z.string(),version:z.literal(RAG_VERSION),
  rejected:z.array(z.object({id:z.string().max(120),reason:z.string().max(160)})).max(40),
  nodes:z.array(z.object({id:z.string(),label:z.string(),status:z.enum(["completed","skipped"]),startedAt:z.string().datetime(),durationMs:z.number().nonnegative().max(240000),outputHash:z.string().max(64).optional()})).max(16),
  metrics:z.object({corpusUnits:z.number().nonnegative(),candidateCount:z.number().nonnegative(),selectedCount:z.number().nonnegative(),embeddingHits:z.number().nonnegative(),embeddingMisses:z.number().nonnegative(),retrievalCacheHit:z.boolean(),rerankModel:z.string().max(120)}),
});
export async function runSshEgyptDag(args:{userId:string;runId:string;secret:string;input:{toolSlug:ToolSlug;title:string;objective:string;asOf:string;framework:string;documentIds:string[]};policy:RagPolicy;profile:ProfileSnapshot;corpusRevision:string;law:Evidence[];matter:Evidence[];signal:AbortSignal}){
  const {input}=args,dag=getDag(input.toolSlug);
  const tenantScope=createHmac("sha256",process.env.SESSION_SIGNING_KEY!).update(args.userId).digest("hex");
  const response=await sshExchange({settings:validateSshCredentials(JSON.parse(args.secret)),signal:args.signal,timeoutMs:235000,packet:{
    protocol:SSH_PROTOCOL,operation:"run",requestId:args.runId,
    workflow:{version:RAG_VERSION,toolSlug:input.toolSlug},tenantScope,profile:args.profile,
    documents:input.documentIds.map(id=>({id})),sources:args.matter,
    policy:{humanApprovalRequired:true,externalActionsAllowed:false},
    rag:{title:input.title,objective:input.objective,asOf:input.asOf,framework:input.framework,policy:args.policy,corpusRevision:args.corpusRevision,law:args.law},
  }});
  if(!response.ragResult)throw new Error("RAG_SSH_VERSION_REQUIRED");
  const remote=remoteSchema.parse(response.ragResult);
  if(remote.profile.hash!==args.profile.hash||remote.profile.revision!==args.profile.revision||remote.harness.maxContextChars!==args.profile.profile.maxContextChars)throw new Error("RAG_OUTPUT_INVALID");
  for(const [kind,nodes] of [["memory",remote.engineering.memory],["context",remote.engineering.context]] as const){const expected=ENGINEERING_DAGS.find(d=>d.id===kind)!.nodes;if(nodes.length&& (nodes.length!==expected.length||nodes.some((n,i)=>n.id!==expected[i].id)))throw new Error("RAG_DAG_INVALID");}
  if(remote.claims.length&&(remote.engineering.context.length!==3||[...remote.nodes,...remote.engineering.memory,...remote.engineering.context].some(n=>n.status!=="completed")))throw new Error("RAG_OUTPUT_INVALID");
  if(remote.selectedLegalIds.length&&args.profile.profile.requiredUnitIds.some(id=>!remote.selectedLegalIds.includes(`LAW-${id}`)))throw new Error("RAG_REQUIRED_AUTHORITY_MISSING");
  for(const graph of ENGINEERING_DAGS){const entries=graph.id==="memory"?remote.engineering.memory:remote.engineering.context;entries.forEach(n=>{n.label=graph.nodes.find(d=>d.id===n.id)!.label;});}
  if(remote.corpusRevision!==args.corpusRevision||remote.nodes.length!==dag.nodes.length||new Set(remote.nodes.map(n=>n.id)).size!==dag.nodes.length||remote.nodes.some(n=>!dag.nodes.some(d=>d.id===n.id)))throw new Error("RAG_OUTPUT_INVALID");
  const byId=new Map(args.law.map(l=>[l.id,l]));
  if(remote.selectedLegalIds.some(id=>!byId.has(id)))throw new Error("RAG_SOURCE_DENIED");
  const selectedLaw=remote.selectedLegalIds.map(id=>byId.get(id)!);
  const gated=gateClaims(remote.claims,[...args.matter,...selectedLaw],dag,args.policy.maxItems);
  if(gated.rejected.length)throw new Error("RAG_OUTPUT_INVALID");
  const safe=pruneDependencies(gated.accepted);
  if(safe.length!==gated.accepted.length)throw new Error("RAG_OUTPUT_INVALID");
  const result=finalizeEgyptResult({dag,title:input.title,matter:args.matter,corpusRevision:args.corpusRevision,asOf:input.asOf,framework:input.framework,metrics:remote.metrics,policy:args.policy},safe,
    remote.rejected.map(r=>({id:r.id,reason:"السيرفر حجب العنصر بعد فحص الأدلة"})),remote.nodes.map(n=>({...n,label:dag.nodes.find(d=>d.id===n.id)!.label})),selectedLaw);
  const usage=z.object({inputTokens:z.number().nonnegative().nullable(),outputTokens:z.number().nonnegative().nullable(),cachedInputTokens:z.number().nonnegative().optional()}).parse(response.usage);
  return {result:{...result,rag:{...result.rag,profile:{revision:args.profile.revision,hash:args.profile.hash,label:args.profile.profile.label,reviewedBy:args.profile.profile.reviewedBy},engineering:remote.engineering,harness:remote.harness}},usage};
}
