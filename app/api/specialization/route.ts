import { z } from "zod";
import { requireApiUser,isAuthResponse } from "@/lib/server/auth";
import { assertSameOrigin,noStoreJson,parseJsonWithLimit,toolSlugSchema } from "@/lib/security";
import { apiError } from "@/lib/server/errors";
import { incrementRateLimit } from "@/db/repository";
import { readProfile,listProfileHistory,saveProfile } from "@/lib/rag/profile-store";
import { profileSchema,SEALED_HARNESS } from "@/lib/rag/profile";
import { getDag } from "@/lib/rag/definitions";
import { ENGINEERING_DAGS } from "@/lib/rag/assembly";
import { SOURCE_CATALOG } from "@/lib/rag/catalog";
import { COMMON } from "@/lib/rag/engine";
import { writeAuditEvent } from "@/lib/server/audit";
export async function GET(request:Request){
 const user=await requireApiUser();if(isAuthResponse(user))return user;
 try{assertSameOrigin(request);const url=new URL(request.url),tool=toolSlugSchema.parse(url.searchParams.get("tool")),raw=url.searchParams.get("revision"),revision=raw===null?undefined:z.coerce.number().int().min(0).max(100).parse(raw);
  return noStoreJson({snapshot:await readProfile(user.id,tool,revision),history:listProfileHistory(user.id,tool),dag:getDag(tool),engineering:ENGINEERING_DAGS,catalog:SOURCE_CATALOG,fixedPolicy:`${COMMON}\n${SEALED_HARNESS}`});
 }catch(e){return apiError(e,400);}
}
export async function PUT(request:Request){
 const user=await requireApiUser();if(isAuthResponse(user))return user;
 try{assertSameOrigin(request);if(incrementRateLimit(user.id,"profiles-hour",Math.floor(Date.now()/3600000)*3600000)>30)throw new Error("RATE_LIMITED");
 const input=z.object({toolSlug:toolSlugSchema,expectedRevision:z.number().int().min(0).max(100),profile:profileSchema}).strict().parse(await parseJsonWithLimit(request,100000));
 const snapshot=await saveProfile(user.id,input.toolSlug,input.profile,input.expectedRevision);
 await writeAuditEvent({userId:user.id,eventType:"specialization.saved",detail:{tool:input.toolSlug,revision:snapshot.revision,hash:snapshot.hash}});return noStoreJson({snapshot});
 }catch(e){if(e instanceof z.ZodError)return noStoreJson({error:"راجع اسم التخصص والمراجع وسبب التعديل وحدود الخانات.",code:"RAG_IMPORT_INVALID",fields:e.issues.map(i=>({path:i.path.join("."),message:i.message}))},{status:400});return apiError(e,400);}
}
