import { getDb, getDataDirectory } from "@/db";
import { noStoreJson } from "@/lib/security";

export const dynamic="force-dynamic";
export async function GET(){const checks={database:false,storage:false,credentialKey:false,sessionKey:false};try{getDb().prepare("SELECT 1").get();checks.database=true;checks.storage=Boolean(getDataDirectory());checks.credentialKey=Buffer.from(process.env.CREDENTIAL_MASTER_KEY||"","base64").length===32;checks.sessionKey=Buffer.from(process.env.SESSION_SIGNING_KEY||"","base64").length===32;const ready=Object.values(checks).every(Boolean);return noStoreJson({status:ready?"ready":"configuration_required",checks},{status:ready?200:503});}catch{return noStoreJson({status:"unavailable",checks},{status:503});}}
