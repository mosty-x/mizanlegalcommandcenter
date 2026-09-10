import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const body=`DATA_DIR=.mizan-data\nCREDENTIAL_MASTER_KEY=${randomBytes(32).toString('base64')}\nSESSION_SIGNING_KEY=${randomBytes(32).toString('base64')}\nTERMS_VERSION=2026-09-10-rag-v2\nALLOWED_AI_HOSTS=\nALLOWED_SSH_HOSTS=\n`;
try{await writeFile('.env.local',body,{flag:'wx',mode:0o600});process.stdout.write('Local configuration created. Keep this file private; preserve the keys for existing data.\n');}catch(error){if(error.code==='EEXIST')throw new Error('Configuration already exists; it was not overwritten.');throw error;}
