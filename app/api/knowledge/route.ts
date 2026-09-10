import { z } from "zod";
import { isAuthResponse,requireApiUser } from "@/lib/server/auth";
import { apiError } from "@/lib/server/errors";
import { assertSameOrigin,noStoreJson,parseJsonWithLimit,safeIdentifierSchema } from "@/lib/security";
import { corpusImportSchema,ragPolicySchema,legalUnitSchema } from "@/lib/rag/contracts";
import { SOURCE_CATALOG,catalogSource } from "@/lib/rag/catalog";
import { clearRagCache,importCorpus,readCorpus,revokeUnit,replaceUnit } from "@/lib/rag/store";
import { EGYPT_DAGS } from "@/lib/rag/definitions";
import { loadFirmConfiguration } from "@/lib/server/config";
import { encryptText } from "@/lib/server/crypto";
import { incrementRateLimit,upsertFirmConfig } from "@/db/repository";
import { writeAuditEvent } from "@/lib/server/audit";

export async function GET(){
  const user=await requireApiUser();if(isAuthResponse(user))return user;
  try{const [corpus,config]=await Promise.all([readCorpus(user.id),loadFirmConfiguration(user.id)]);
    return noStoreJson({...corpus,catalog:SOURCE_CATALOG,policy:config["rag-policy"]??null,dags:EGYPT_DAGS});
  }catch(error){return apiError(error);}
}
export async function POST(request:Request){
  const user=await requireApiUser();if(isAuthResponse(user))return user;
  try{assertSameOrigin(request);
    if(incrementRateLimit(user.id,"knowledge-hour",Math.floor(Date.now()/3600000)*3600000)>40)throw new Error("RATE_LIMITED");
    const input=await parseJsonWithLimit(request,5000000);
    const action=z.object({action:z.enum(["import","policy","replace","clear-cache"])}).parse(input).action;
    if(action==="import"){
      const data=corpusImportSchema.parse((input as {data:unknown}).data);await importCorpus(user.id,data.units);
      await writeAuditEvent({userId:user.id,eventType:"knowledge.imported",detail:{units:data.units.length}});
    }else if(action==="replace"){
      const data=z.object({oldId:safeIdentifierSchema,expectedRevision:z.string().regex(/^[a-f0-9]{64}$/),unit:legalUnitSchema}).strict().parse((input as {data:unknown}).data);
      await replaceUnit(user.id,data.oldId,data.expectedRevision,{...data.unit,id:`law-${crypto.randomUUID()}`});
      await writeAuditEvent({userId:user.id,eventType:"knowledge.corrected",detail:{previousId:data.oldId}});
    }else if(action==="policy"){
      const data=ragPolicySchema.parse((input as {data:unknown}).data);
      if(data.sourceIds.some(id=>!catalogSource(id)))throw new Error("RAG_SOURCE_DENIED");
      const encrypted=await encryptText(JSON.stringify(data),user.id,"config:rag-policy");
      upsertFirmConfig(user.id,"rag-policy",encrypted.ciphertext,encrypted.iv,new Date().toISOString());clearRagCache(user.id);
      await writeAuditEvent({userId:user.id,eventType:"knowledge.policy",detail:{sourceCount:data.sourceIds.length}});
    }else clearRagCache(user.id);
    return noStoreJson({ok:true});
  }catch(error){if(error instanceof z.ZodError)return noStoreJson({error:"ملف الذاكرة أو الإعدادات غير مطابق. راجع الخانات المشار لها.",code:"RAG_IMPORT_INVALID",fields:error.issues.map(i=>({path:i.path.join("."),message:i.message}))},{status:400});return apiError(error,400);}
}
export async function DELETE(request:Request){
  const user=await requireApiUser();if(isAuthResponse(user))return user;
  try{assertSameOrigin(request);const id=safeIdentifierSchema.parse(new URL(request.url).searchParams.get("id"));
    if(!revokeUnit(user.id,id))throw new Error("DOCUMENT_NOT_FOUND");
    await writeAuditEvent({userId:user.id,eventType:"knowledge.revoked",detail:{id}});return noStoreJson({ok:true});
  }catch(error){return apiError(error,400);}
}
