import "server-only";
import { headers } from "next/headers";
import { readVisitorId } from "@/lib/server/session";
import { findVisitor } from "@/db/repository";
import { currentTermsVersion } from "@/lib/server/terms";

export type AuthenticatedUser={id:string;email:string;displayName:string};
export async function getAuthenticatedUser():Promise<AuthenticatedUser|null>{const requestHeaders=await headers();const id=readVisitorId(requestHeaders.get("cookie"));if(!id)return null;const visitor=findVisitor(id);if(!visitor?.guideCompletedAt||!visitor.termsAcceptedAt||visitor.termsVersion!==currentTermsVersion())return null;return{id,email:`${id}@mizan.local`,displayName:"فريق المكتب"};}
export async function requireApiUser():Promise<AuthenticatedUser|Response>{const user=await getAuthenticatedUser();if(user)return user;return Response.json({error:"راجع دليل التشغيل واقبل نسخة الشروط الحالية قبل استخدام الأدوات.",code:"TERMS_REQUIRED"},{status:403,headers:{"Cache-Control":"no-store"}});}
export function isAuthResponse(value:AuthenticatedUser|Response):value is Response{return value instanceof Response;}
