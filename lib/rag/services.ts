import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { callProvider,type StoredProvider } from "@/lib/ai/providers";
import { validateProviderUrl } from "@/lib/security";
import { readRagCache,writeRagCache } from "./store";
import { digest,hybridCandidates } from "./retrieval";
import { RAG_VERSION,type Evidence,type ModelCall,type RagPolicy,type RetrievalMetrics,type ToolSlug } from "./contracts";

export type ProviderCredential={config:StoredProvider;apiKey:string};
export type RagProviders={generation:ProviderCredential;embedding:ProviderCredential;rerank:ProviderCredential;verifier:ProviderCredential};
const vectorSchema=z.array(z.number().finite()).min(8).max(8192).refine(v=>v.some(x=>x!==0));
export async function boundedJsonFetch(url:URL,body:unknown,key:string,signal:AbortSignal){
  const response=await fetch(url,{method:"POST",redirect:"error",signal,headers:{"content-type":"application/json",authorization:`Bearer ${key}`},body:JSON.stringify(body)});
  if(!response.ok){await response.body?.cancel();throw new Error("RAG_SERVICE_FAILED");}
  const reader=response.body?.getReader();if(!reader)throw new Error("RAG_SERVICE_FAILED");
  const pieces:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2500000)throw new Error("PROVIDER_RESPONSE_TOO_LARGE");pieces.push(value);}}finally{await reader.cancel().catch(()=>undefined);}
  try{return JSON.parse(Buffer.concat(pieces).toString("utf8")) as unknown;}catch{throw new Error("RAG_OUTPUT_INVALID");}
}
function endpoint(provider:ProviderCredential,role:"embedding"|"rerank"){
  const config=provider.config;
  if(config.provider!=="openai"&&config.provider!=="openai-compatible")throw new Error("RAG_CAPABILITY_MISSING");
  const url=validateProviderUrl(config.baseUrl,process.env.ALLOWED_AI_HOSTS);
  if(role==="embedding"&&config.provider==="openai")url.pathname="/v1/embeddings";
  if(role==="embedding"&&!url.pathname.endsWith("/embeddings"))throw new Error("RAG_CAPABILITY_MISSING");
  if(role==="rerank"&&!url.pathname.endsWith("/rerank"))throw new Error("RAG_CAPABILITY_MISSING");
  return url;
}
export function validateCapabilities(providers:RagProviders,policy:RagPolicy){
  endpoint(providers.embedding,"embedding");endpoint(providers.rerank,"rerank");
  if([providers.generation,providers.verifier].some(p=>p.config.provider==="ssh-gateway"))throw new Error("RAG_CAPABILITY_MISSING");
  if(policy.kvBackend==="vllm"&&[providers.generation,providers.verifier].some(p=>p.config.provider!=="openai-compatible"))throw new Error("RAG_CAPABILITY_MISSING");
}
export function createRagServices(args:{userId:string;tool:ToolSlug;documentIds:string[];revision:string;policy:RagPolicy;providers:RagProviders;signal:AbortSignal}){
  validateCapabilities(args.providers,args.policy);
  const {providers,policy,signal}=args;
  const signature=(p:ProviderCredential)=>({id:p.config.id,model:p.config.model,url:p.config.baseUrl});
  // All app-owned caches have the same permission/revision boundary. No cross-matter answer caching.
  const scope=digest({user:args.userId,tool:args.tool,documents:[...args.documentIds].sort(),revision:args.revision,policy,version:RAG_VERSION,providers:Object.fromEntries(Object.entries(providers).map(([k,p])=>[k,signature(p)]))});
  const salt=createHmac("sha256",process.env.SESSION_SIGNING_KEY||process.env.CREDENTIAL_MASTER_KEY||"local-no-shared-cache").update(scope).digest("hex");
  const metrics:RetrievalMetrics={corpusUnits:0,candidateCount:0,selectedCount:0,embeddingHits:0,embeddingMisses:0,retrievalCacheHit:false,rerankModel:providers.rerank.config.model};
  const usage={inputTokens:0,outputTokens:0,cachedInputTokens:0,modelCalls:0,serviceCalls:0};
  const requestIds:string[]=[];
  function budget(){signal.throwIfAborted();usage.serviceCalls++;if(usage.serviceCalls>45)throw new Error("RAG_BUDGET_EXCEEDED");}
  async function embeddings(texts:string[]){
    const vectors:Array<number[]|null>=[],keys=texts.map(text=>digest([scope,"embedding",signature(providers.embedding),text]));
    for(const key of keys){const cached=await readRagCache<number[]>(args.userId,key);vectors.push(cached?vectorSchema.parse(cached):null);if(cached)metrics.embeddingHits++;else metrics.embeddingMisses++;}
    const missing=vectors.flatMap((v,i)=>v?[]:[i]);
    for(let start=0;start<missing.length;start+=16){budget();const indexes=missing.slice(start,start+16);
      const result=z.object({data:z.array(z.object({index:z.number().int().nonnegative(),embedding:vectorSchema})).max(16)}).parse(await boundedJsonFetch(endpoint(providers.embedding,"embedding"),{model:providers.embedding.config.model,input:indexes.map(i=>texts[i]),encoding_format:"float"},providers.embedding.apiKey,signal));
      if(result.data.length!==indexes.length||new Set(result.data.map(r=>r.index)).size!==indexes.length||result.data.some(r=>r.index>=indexes.length))throw new Error("RAG_EMBEDDING_INVALID");
      for(const row of result.data){const index=indexes[row.index];vectors[index]=row.embedding;await writeRagCache(args.userId,keys[index],row.embedding,7*86400);}
    }
    const complete=vectors as number[][];if(complete.some(v=>!v||v.length!==complete[0].length))throw new Error("RAG_EMBEDDING_INVALID");return complete;
  }
  const model:ModelCall=async(stage,systemPrompt,userPrompt)=>{
    budget();if(++usage.modelCalls>6)throw new Error("RAG_BUDGET_EXCEEDED");
    const provider=stage==="verify"?providers.verifier:providers.generation;
    const result=await callProvider({...provider,systemPrompt,userPrompt,maxOutputTokens:4096,signal,cacheSalt:policy.kvBackend==="vllm"?salt:undefined});
    usage.inputTokens+=result.usage.inputTokens??0;usage.outputTokens+=result.usage.outputTokens??0;usage.cachedInputTokens+=result.usage.cachedInputTokens??0;
    if(result.requestId)requestIds.push(result.requestId);return result.text;
  };
  return {model,metrics,usage,requestIds,scope,
    async retrieve(query:string,items:Evidence[]){metrics.corpusUnits=items.length;if(items.length>500)throw new Error("RAG_CORPUS_LIMIT");
      const vectors=await embeddings([query,...items.map(e=>e.text)]);
      const candidates=hybridCandidates(query,items,vectors[0],vectors.slice(1),policy.candidateK);metrics.candidateCount=candidates.length;return candidates;
    },
    async rerank(query:string,items:Evidence[]){
      if(!items.length)return [];
      const key=digest([scope,"rerank",query,items.map(i=>({id:i.id,text:i.text}))]);
      const cached=await readRagCache<{id:string;score:number}[]>(args.userId,key);let scores=cached;
      if(scores)metrics.retrievalCacheHit=true;
      else{budget();const result=z.object({results:z.array(z.object({index:z.number().int().nonnegative(),relevance_score:z.number().finite().min(0).max(1)})).max(60)}).parse(await boundedJsonFetch(endpoint(providers.rerank,"rerank"),{model:providers.rerank.config.model,query,documents:items.map(i=>i.text),top_n:policy.topK,max_tokens_per_doc:8192},providers.rerank.apiKey,signal));
        if(new Set(result.results.map(r=>r.index)).size!==result.results.length||result.results.some(r=>r.index>=items.length))throw new Error("RAG_OUTPUT_INVALID");
        scores=result.results.map(r=>({id:items[r.index].id,score:r.relevance_score})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
        await writeRagCache(args.userId,key,scores,900);
      }
      const byId=new Map(items.map(i=>[i.id,i]));return scores.filter(s=>byId.has(s.id)).map(s=>({...byId.get(s.id)!,score:s.score}));
    },
  };
}
