import { z } from "zod";
import { findDocuments,incrementRateLimit,insertRun,updateRunCompleted,updateRunFailed } from "@/db/repository";
import { assertSameOrigin,noStoreJson,parseJsonWithLimit,safeIdentifierSchema,toolSlugSchema } from "@/lib/security";
import { apiError } from "@/lib/server/errors";
import { isAuthResponse,requireApiUser } from "@/lib/server/auth";
import { loadDocumentChunks,loadProviderForUser,storeEncryptedBlob } from "@/lib/server/storage";
import { writeAuditEvent } from "@/lib/server/audit";
import { loadFirmConfiguration,configurationRevisionNow } from "@/lib/server/config";
import { isoDate,ragPolicySchema,RAG_VERSION,type Evidence } from "@/lib/rag/contracts";
import { getDag } from "@/lib/rag/definitions";
import { eligibleCorpus } from "@/lib/rag/evidence";
import { readCorpus,recordNode,corpusRevisionNow } from "@/lib/rag/store";
import { createRagServices,type RagProviders } from "@/lib/rag/services";
import { executeEgyptDag } from "@/lib/rag/engine";
import { digest } from "@/lib/rag/retrieval";
import { runSshEgyptDag } from "@/lib/rag/ssh";

import { readProfile,profileRevisionNow } from "@/lib/rag/profile-store";

const active=new Set<string>();
const runSchema=z.object({
  toolSlug:toolSlugSchema,providerId:safeIdentifierSchema,
  documentIds:z.array(safeIdentifierSchema).min(1).max(8),
  title:z.string().trim().min(2).max(180),objective:z.string().trim().min(4).max(2500),
  jurisdiction:z.enum(["مصر","EG","Egypt"]).default("مصر"),
  asOf:isoDate,framework:z.enum(["EG","CRCICA-2024","CRCICA-2011"]).default("EG"),
  clientSafeDocumentsConfirmed:z.boolean().default(false),
}).strict();
export async function POST(request:Request){
  const user=await requireApiUser();if(isAuthResponse(user))return user;
  let runId:string|null=null,locked=false;const started=Date.now();
  try{
    assertSameOrigin(request);const input=runSchema.parse(await parseJsonWithLimit(request,32000));
    if(active.has(user.id)||active.size>=4)throw new Error("RAG_BUSY");active.add(user.id);locked=true;
    if(incrementRateLimit(user.id,"workflow-hour",Math.floor(Date.now()/3600000)*3600000)>30)throw new Error("RATE_LIMITED");
    if(input.toolSlug==="client-command"&&!input.clientSafeDocumentsConfirmed)throw new Error("RAG_CLIENT_APPROVAL_REQUIRED");
    const configurationRevision=configurationRevisionNow(user.id);
    const provider=await loadProviderForUser(user.id,input.providerId),customization=await loadFirmConfiguration(user.id);
    if(configurationRevisionNow(user.id)!==configurationRevision)throw new Error("RAG_CORPUS_CHANGED");
    const parsedPolicy=ragPolicySchema.safeParse(customization["rag-policy"]);if(!parsedPolicy.success)throw new Error("RAG_POLICY_REQUIRED");
    const policy=parsedPolicy.data,configurationHash=digest(customization);
    const profile=await readProfile(user.id,input.toolSlug),profileRevision=`${profile.revision}:${profile.hash}`;
    policy.sourceIds=policy.sourceIds.filter(id=>profile.profile.sourceIds.includes(id));
    const workflowConfig=customization["workflow-config"] as {enabledTools?:string[];maxDocumentsPerRun?:number;maxFindings?:number}|undefined;
    const providerCatalog=customization["provider-catalog"] as {allowedProviders?:string[];approvedModels?:string[]}|undefined;
    const practicePolicy=customization["practice-policy"] as {permittedJurisdictions?:string[]}|undefined;
    if(workflowConfig?.enabledTools&&!workflowConfig.enabledTools.includes(input.toolSlug))throw new Error("CONFIG_POLICY_DENIED");
    if(workflowConfig?.maxDocumentsPerRun&&input.documentIds.length>workflowConfig.maxDocumentsPerRun)throw new Error("CONFIG_POLICY_DENIED");
    if(practicePolicy?.permittedJurisdictions?.length&&!practicePolicy.permittedJurisdictions.some(j=>["مصر","Egypt","EG"].includes(j)))throw new Error("CONFIG_POLICY_DENIED");
    function checkProvider(p:typeof provider){if(providerCatalog?.allowedProviders&&!providerCatalog.allowedProviders.includes(p.config.provider))throw new Error("CONFIG_POLICY_DENIED");if(providerCatalog?.approvedModels?.length&&!providerCatalog.approvedModels.includes(p.config.model))throw new Error("CONFIG_POLICY_DENIED");}
    checkProvider(provider);
    policy.maxItems=Math.min(policy.maxItems,workflowConfig?.maxFindings??16);
    const docs=findDocuments(user.id,[...new Set(input.documentIds)]);
    if(docs.length!==new Set(input.documentIds).size||docs.some(d=>d.toolSlug!==input.toolSlug))throw new Error("RAG_DOCUMENT_SCOPE");
    const sourceData=await loadDocumentChunks(user.id,input.documentIds);
    if(sourceData.truncated)throw new Error("RAG_INPUT_TOO_LARGE");
    const matter:Evidence[]=sourceData.chunks.map(c=>({...c,kind:"matter"}));
    const corpus=await readCorpus(user.id),dag=getDag(input.toolSlug);
    const law=eligibleCorpus(corpus.units,dag,policy,input.asOf,input.framework);
    const signal=AbortSignal.any([request.signal,AbortSignal.timeout(240000)]);
    runId=crypto.randomUUID();
    insertRun({id:runId,userId:user.id,toolSlug:input.toolSlug,title:input.title,status:"running",providerId:input.providerId,model:provider.config.model,sourceCount:matter.length,workflowVersion:RAG_VERSION,createdAt:new Date().toISOString(),outputKey:null,outputIv:null,verifiedCitationCount:0,durationMs:0,inputTokens:null,outputTokens:null,errorCode:null,approvedAt:null,approvedBy:null,completedAt:null});
    await writeAuditEvent({userId:user.id,runId,eventType:"workflow.started",detail:{toolSlug:input.toolSlug,corpusRevision:corpus.revision,version:RAG_VERSION}});
    let result:Awaited<ReturnType<typeof executeEgyptDag>>;
    let usage:{inputTokens:number|null;outputTokens:number|null;cachedInputTokens?:number;modelCalls?:number;serviceCalls?:number};
    let requestIds:string[]=[];
    if(provider.config.provider==="ssh-gateway"){
      const remote=await runSshEgyptDag({userId:user.id,runId,secret:provider.apiKey,input,policy,profile,corpusRevision:corpus.revision,law,matter,signal});
      result=remote.result;usage=remote.usage;
      for(const node of [...result.rag.engineering.memory,...result.rag.nodes,...result.rag.engineering.context])await recordNode(user.id,runId,node);
    }else{
      const [embedding,rerank,verifier]=await Promise.all([loadProviderForUser(user.id,policy.embeddingProviderId),loadProviderForUser(user.id,policy.rerankProviderId),loadProviderForUser(user.id,policy.verifierProviderId)]);
      [embedding,rerank,verifier].forEach(checkProvider);
      const providers:RagProviders={generation:provider,embedding,rerank,verifier};
      const services=createRagServices({userId:user.id,tool:input.toolSlug,documentIds:input.documentIds,revision:digest([corpus.revision,input.asOf,input.framework,configurationHash,profileRevision]),policy,providers,signal});
      result=await executeEgyptDag({dag,profile,rawLawUnits:corpus.units,title:input.title,objective:input.objective,asOf:input.asOf,framework:input.framework,policy,matter,law,corpusRevision:corpus.revision,model:services.model,retrieve:services.retrieve,rerank:services.rerank,metrics:services.metrics,signal,onNode:event=>recordNode(user.id,runId!,event)});
      usage=services.usage;requestIds=services.requestIds;
    }
    const current=await readCorpus(user.id);
    if(current.revision!==corpus.revision||digest(await loadFirmConfiguration(user.id))!==configurationHash)throw new Error("RAG_CORPUS_CHANGED");
    // A document withdrawn during execution cannot be emitted as a fresh report.
    if(findDocuments(user.id,input.documentIds).length!==docs.length)throw new Error("RAG_DOCUMENT_SCOPE");
    const verifiedCitationCount=result.output.findings.reduce((sum,f)=>sum+f.verifiedSourceRefs.length,0);
    const trace={...result,rag:{...result.rag,profileRevision,configurationHash,configurationRevision,documentIds:docs.map(d=>d.id)},transparency:{provider:provider.config.provider,providerLabel:provider.config.label,model:provider.config.model,requestIds,workflowVersion:RAG_VERSION,durationMs:Date.now()-started,...usage,sourceTruncated:false,executionLocation:provider.config.provider==="ssh-gateway"?"سيرفر التنفيذ البعيد — المسار المصري الكامل":"محرك المسارات المصري والخدمات المحددة",documentsSent:"المقتطفات المحددة والنصوص القانونية المسموحة فقط",approvalStatus:result.rag.approvalEligible?"في انتظار مراجعة المحامي":"محجوب لعدم كفاية الأدلة"}};
    const outputKey=`${user.id}/runs/${runId}/output.bin`;
    const stored=await storeEncryptedBlob({key:outputKey,value:new TextEncoder().encode(JSON.stringify(trace)),userId:user.id,purpose:`workflow-output:${runId}`});
    // No await between the final snapshots and commit: this application uses one process.
    if(corpusRevisionNow(user.id)!==corpus.revision||configurationRevisionNow(user.id)!==configurationRevision||profileRevisionNow(user.id,input.toolSlug)!==profileRevision)throw new Error("RAG_CORPUS_CHANGED");
    if(findDocuments(user.id,input.documentIds).length!==docs.length)throw new Error("RAG_DOCUMENT_SCOPE");
    updateRunCompleted(runId,user.id,{outputKey,outputIv:stored.iv,verifiedCitationCount,durationMs:Date.now()-started,inputTokens:usage.inputTokens,outputTokens:usage.outputTokens,completedAt:new Date().toISOString()});
    await writeAuditEvent({userId:user.id,runId,eventType:"workflow.completed",detail:{status:result.rag.status,verifiedCitationCount}});
    return noStoreJson({run:{id:runId,status:"completed",toolSlug:input.toolSlug,title:input.title,approvedAt:null,...trace}},{status:201});
  }catch(error){
    if(runId){try{updateRunFailed(runId,user.id,Date.now()-started,new Date().toISOString());}catch{}await writeAuditEvent({userId:user.id,runId,eventType:"workflow.failed",detail:{durationMs:Date.now()-started}}).catch(()=>undefined);}
    if(error instanceof z.ZodError)return noStoreJson({error:"راجع بيانات المهمة: مصر، تاريخ صالح، واختيار الملفات والخدمات.",code:"RAG_IMPORT_INVALID"},{status:400});
    return apiError(error,400);
  }finally{if(locked)active.delete(user.id);}
}
