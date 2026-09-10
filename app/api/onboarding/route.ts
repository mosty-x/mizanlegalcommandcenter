import { z } from "zod";
import { completeOnboarding, touchVisitor } from "@/db/repository";
import { createVisitorIdentity, readVisitorId } from "@/lib/server/session";
import { assertSameOrigin, noStoreJson, parseJsonWithLimit, TOOL_SLUGS } from "@/lib/security";
import { writeAuditEvent } from "@/lib/server/audit";
import { currentTermsVersion } from "@/lib/server/terms";

const completionSchema=z.object({acceptedTerms:z.literal(true),viewedWorkflows:z.array(z.enum(TOOL_SLUGS)).length(TOOL_SLUGS.length)});

export async function GET(request:Request){try{const termsVersion=currentTermsVersion();let id=readVisitorId(request.headers.get("cookie"));let setCookie:string|undefined;if(!id){const created=createVisitorIdentity();id=created.id;setCookie=created.cookie;}const {row,created}=touchVisitor(id,new Date().toISOString());const guideRequired=!row.guideCompletedAt||!row.termsAcceptedAt||row.termsVersion!==termsVersion;const response=noStoreJson({guideRequired,firstVisit:created,termsVersion,acceptedAt:row.termsAcceptedAt});if(setCookie)response.headers.set("Set-Cookie",setCookie);return response;}catch{return noStoreJson({error:"إعداد جلسة البداية غير مكتمل. راجع مفاتيح الخادم.",code:"SESSION_SETUP_FAILED"},{status:503});}}

export async function POST(request:Request){try{assertSameOrigin(request);const id=readVisitorId(request.headers.get("cookie"));if(!id)return noStoreJson({error:"جلسة البداية غير موجودة. حدّث الصفحة.",code:"SESSION_REQUIRED"},{status:401});const input=completionSchema.parse(await parseJsonWithLimit(request,20_000));if(new Set(input.viewedWorkflows).size!==TOOL_SLUGS.length)return noStoreJson({error:"راجع مسارات العمل الخمسة قبل التشغيل.",code:"GUIDE_INCOMPLETE"},{status:400});const termsVersion=currentTermsVersion();const row=completeOnboarding(id,termsVersion,new Date().toISOString());await writeAuditEvent({userId:id,eventType:"onboarding.completed",detail:{termsVersion,workflowCount:TOOL_SLUGS.length}});return noStoreJson({guideRequired:false,firstVisit:false,termsVersion,acceptedAt:row.termsAcceptedAt});}catch{return noStoreJson({error:"تعذّر حفظ موافقة الشروط.",code:"ONBOARDING_SAVE_FAILED"},{status:400});}}
