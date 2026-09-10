// Deploy this file WITH the repository. Run the fixed receiver with tsx and react-server conditions.
// All neural credentials live in the remote receiver config, never in a workflow packet.
import { z } from "zod";
import { providerTypeSchema } from "../lib/ai/providers";
import { RAG_VERSION,isoDate,legalUnitSchema,ragPolicySchema,type Evidence } from "../lib/rag/contracts";
import { toolSlugSchema } from "../lib/security";
import { getDag } from "../lib/rag/definitions";
import { eligibleCorpus } from "../lib/rag/evidence";
import { executeEgyptDag } from "../lib/rag/engine";
import { profileSchema } from "../lib/rag/profile";
import { digest } from "../lib/rag/retrieval";
import { createRagServices,validateCapabilities,type RagProviders } from "../lib/rag/services";

const credential=z.object({config:z.object({id:z.string().min(1).max(120),label:z.string().max(80),provider:providerTypeSchema,model:z.string().min(2).max(120),baseUrl:z.string().url()}),apiKey:z.string().min(8).max(1000)});
const configSchema=z.object({ragProviders:z.object({generation:credential,embedding:credential,rerank:credential,verifier:credential})});
export async function health(config:unknown){const parsed=configSchema.parse(config);if(!process.env.CREDENTIAL_MASTER_KEY||!process.env.SESSION_SIGNING_KEY)throw new Error("KEYS_REQUIRED");return Boolean(parsed.ragProviders);}
export async function run(raw:unknown,config:unknown){
  const packet=z.object({
    tenantScope:z.string().regex(/^[a-f0-9]{64}$/),
    profile:z.object({profile:profileSchema,revision:z.number().int().nonnegative(),hash:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().nullable()}).optional(),
    workflow:z.object({version:z.literal(RAG_VERSION),toolSlug:toolSlugSchema}),
    documents:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/)})).min(1).max(8),
    sources:z.array(z.object({id:z.string(),text:z.string().min(1).max(3500),kind:z.literal("matter"),documentId:z.string(),fileName:z.string(),page:z.number().int().positive()})).max(42),
    rag:z.object({title:z.string().max(180),objective:z.string().max(2500),asOf:isoDate,framework:z.enum(["EG","CRCICA-2024","CRCICA-2011"]),policy:ragPolicySchema,corpusRevision:z.string().regex(/^[a-f0-9]{64}$/),law:z.array(z.object({legal:legalUnitSchema})).max(500)}),
  }).parse(raw);
  const dag=getDag(packet.workflow.toolSlug),providers=configSchema.parse(config).ragProviders as RagProviders;
  const policy=packet.rag.policy;validateCapabilities(providers,policy);
  const ids=new Set(packet.documents.map(d=>d.id));if(packet.sources.some(s=>!ids.has(s.documentId)))throw new Error("DOCUMENT_SCOPE");
  const law=eligibleCorpus(packet.rag.law.map(e=>e.legal),dag,policy,packet.rag.asOf,packet.rag.framework);
  const signal=AbortSignal.timeout(220000);
  const services=createRagServices({userId:packet.tenantScope,tool:dag.slug,documentIds:[...ids],revision:digest([packet.rag.corpusRevision,packet.rag.asOf,packet.rag.framework,packet.profile?.hash]),policy,providers,signal});
  const result=await executeEgyptDag({dag,...packet.rag,profile:packet.profile,corpusRevision:packet.rag.corpusRevision,policy,matter:packet.sources as Evidence[],law,signal,model:services.model,retrieve:services.retrieve,rerank:services.rerank,metrics:services.metrics});
  return {output:result.output,usage:services.usage,ragResult:{engineering:result.rag.engineering,profile:result.rag.profile,harness:result.rag.harness,claims:result.claims,selectedLegalIds:result.sources.filter(e=>e.kind==="law").map(e=>e.id),corpusRevision:result.rag.corpusRevision,version:RAG_VERSION,rejected:result.rag.rejected,nodes:result.rag.nodes,metrics:result.rag.metrics}};
}
