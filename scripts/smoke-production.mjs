import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { startSshFixture } from '../tests/ssh-fixture.mjs';
import { installMockAi } from '../tests/helpers/mock-ai-fetch.mjs';
import { UNIT,MATTER,POLICY,PROVIDERS,TOOLS,TODAY } from '../tests/helpers/rag-fixtures.mjs';
import { run as runRemote } from '../ssh-server/egypt-rag-handler.ts';
import { getDb } from '../db/index.ts';
const port=3137,origin=`http://127.0.0.1:${port}`;
const dataDir=await mkdtemp(path.join(os.tmpdir(),'mizan-rag-smoke-'));
process.env.DATA_DIR=path.join(dataDir,'remote');process.env.CREDENTIAL_MASTER_KEY=randomBytes(32).toString('base64');process.env.SESSION_SIGNING_KEY=randomBytes(32).toString('base64');
const mock=installMockAi();
const ssh=await startSshFixture({execute:packet=>runRemote(packet,{ragProviders:PROVIDERS})});
const child=spawn(process.execPath,['--import',path.resolve('tests/helpers/mock-ai-fetch.mjs'),'.next/standalone/server.js'],{cwd:process.cwd(),env:{...process.env,MIZAN_TEST_AI:'1',NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',DATA_DIR:path.join(dataDir,'app'),TERMS_VERSION:'smoke-egypt-v2',ALLOWED_SSH_HOSTS:`127.0.0.1:${ssh.settings.port}`},stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stdout.on('data',c=>diagnostics+=c);child.stderr.on('data',c=>diagnostics+=c);
const json=async(url,headers,method='GET',body)=>{const res=await fetch(origin+url,{method,headers,...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
async function user(){const res=await fetch(origin+'/api/onboarding');const cookie=res.headers.get('set-cookie').split(';',1)[0];const headers={cookie,origin,'content-type':'application/json'};assert.equal((await json('/api/providers',headers)).status,403);assert.equal((await json('/api/onboarding',headers,'POST',{acceptedTerms:true,viewedWorkflows:TOOLS})).status,200);return headers;}
try{
 for(let i=0;i<150;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}if(i===149)throw new Error(diagnostics);await new Promise(r=>setTimeout(r,100));}
 const headers=await user(),other=await user();
 const ids={};for(const [role,p] of Object.entries(PROVIDERS)){const r=await json('/api/providers',headers,'POST',{label:role,provider:p.config.provider,model:p.config.model,baseUrl:p.config.baseUrl,apiKey:p.apiKey});assert.equal(r.status,201,JSON.stringify(r.data));assert.equal('apiKey' in r.data.provider,false);ids[role]=r.data.provider.id;}
 const policy={...POLICY,embeddingProviderId:ids.embedding,rerankProviderId:ids.rerank,verifierProviderId:ids.verifier};assert.equal((await json('/api/knowledge',headers,'POST',{action:'policy',data:policy})).status,200);
 const docIds={};for(const tool of TOOLS){const r=await json('/api/documents',headers,'POST',{toolSlug:tool,fileName:'synthetic.txt',mimeType:'text/plain',base64:Buffer.from(MATTER.text).toString('base64'),extractedText:MATTER.text});assert.equal(r.status,201);docIds[tool]=r.data.document.id;}
 function input(tool,providerId=ids.generation){return {toolSlug:tool,providerId,documentIds:[docIds[tool]],title:'اختبار تقني مصري',objective:'اختبار ترابط المستندات والمصدر فقط',jurisdiction:'مصر',asOf:TODAY,framework:'EG',clientSafeDocumentsConfirmed:true};}
 const empty=await json('/api/workflows/run',headers,'POST',input('enforceability'));assert.equal(empty.status,201,JSON.stringify(empty.data));assert.equal(empty.data.run.rag.status,'withheld');assert.equal(empty.data.run.transparency.modelCalls,0);assert.equal((await json('/api/runs',headers,'PATCH',{runId:empty.data.run.id,approved:true})).status,400);
 assert.equal((await json('/api/knowledge',headers,'POST',{action:'import',data:{units:[UNIT]}})).status,200);
 assert.equal((await json('/api/knowledge',other)).data.units.length,0);
 assert.equal((await json('/api/knowledge',headers,'POST',{action:'import',data:{units:[{...UNIT,id:'bad',sourceUrl:'https://evil.test/'}]}})).status,400);
 let last;
 for(const tool of TOOLS){const r=await json('/api/workflows/run',headers,'POST',input(tool));assert.equal(r.status,201,JSON.stringify(r.data));last=r.data.run;assert.equal(last.rag.nodes.length,8);assert.equal(last.rag.engineering.memory.length,3);assert.equal(last.rag.engineering.context.length,3);assert.equal(last.output.findings.length,1);assert.equal(last.transparency.modelCalls,4);assert.equal(last.rag.approvalEligible,true);assert.equal((await json('/api/runs?id='+last.id,headers)).data.run.rag.corpusRevision,last.rag.corpusRevision);}
 const warm=await json('/api/workflows/run',headers,'POST',input('enforceability'));assert.equal(warm.status,201);assert.equal(warm.data.run.rag.metrics.retrievalCacheHit,true);assert.ok(warm.data.run.rag.metrics.embeddingHits>=2);
 const wrongTool=await json('/api/workflows/run',headers,'POST',{...input('disputes'),documentIds:[docIds.enforceability]});assert.equal(wrongTool.data.code,'RAG_DOCUMENT_SCOPE');
 assert.equal((await json('/api/workflows/run',other,'POST',input('enforceability'))).status,404);
 assert.equal((await json('/api/workflows/run',headers,'POST',{...input('client-command'),clientSafeDocumentsConfirmed:false})).data.code,'RAG_CLIENT_APPROVAL_REQUIRED');
 const sshProvider=await json('/api/providers',headers,'POST',{label:'سيرفر اختبار',provider:'ssh-gateway',model:'egypt-rag',ssh:ssh.settings});assert.equal(sshProvider.status,201,JSON.stringify(sshProvider.data));
 assert.equal((await json('/api/providers/test',headers,'POST',{providerId:sshProvider.data.provider.id})).status,200);
 for(const tool of TOOLS){const r=await json('/api/workflows/run',headers,'POST',input(tool,sshProvider.data.provider.id));assert.equal(r.status,201,JSON.stringify(r.data));assert.equal(r.data.run.output.findings.length,1);assert.equal(r.data.run.rag.nodes.length,8);assert.equal(r.data.run.transparency.provider,'ssh-gateway');}
 assert.equal((await json('/api/runs',headers,'PATCH',{runId:last.id,approved:true})).status,200);

 // Specialization API, immutable versions, neural prompt forwarding and stale-result denial.
 const oldProfile=(await json('/api/specialization?tool=enforceability',headers)).data.snapshot;
 const profileSave=await json('/api/specialization',headers,'PUT',{toolSlug:'enforceability',expectedRevision:0,profile:{...oldProfile.profile,analysisInstructions:'HTTP-PROFILE-MARK: لا تتجاوز السند.',reviewedBy:'مراجع الاختبار',changeNote:'تجربة تكامل التخصص'}});assert.equal(profileSave.status,200,JSON.stringify(profileSave.data));
 assert.equal((await json('/api/specialization?tool=enforceability',other)).data.snapshot.revision,0);
 assert.equal((await json('/api/specialization',headers,'PUT',{toolSlug:'enforceability',expectedRevision:0,profile:oldProfile.profile})).data.code,'RAG_PROFILE_CONFLICT');
 assert.equal((await json('/api/runs',headers,'PATCH',{runId:warm.data.run.id,approved:true})).data.code,'RAG_APPROVAL_DENIED');
 const profiled=await json('/api/workflows/run',headers,'POST',input('enforceability'));assert.equal(profiled.status,201,JSON.stringify(profiled.data));assert.equal(profiled.data.run.rag.profile.revision,1);assert.equal(profiled.data.run.rag.profile.hash,profileSave.data.snapshot.hash);
 const remoteProfiled=await json('/api/workflows/run',headers,'POST',input('enforceability',sshProvider.data.provider.id));assert.equal(remoteProfiled.status,201,JSON.stringify(remoteProfiled.data));assert.equal(remoteProfiled.data.run.rag.profile.hash,profileSave.data.snapshot.hash);assert.ok(mock.requests.some(r=>r.body.messages?.[0]?.content?.includes('HTTP-PROFILE-MARK')));
 // Correcting a reviewed unit is atomic and invalidates the previous source revision.
 const currentMemory=(await json('/api/knowledge',headers)).data;
 const correction=await json('/api/knowledge',headers,'POST',{action:'replace',data:{oldId:UNIT.id,expectedRevision:currentMemory.revision,unit:{...UNIT,reviewer:'مراجع تصحيح الاختبار'}}});assert.equal(correction.status,200,JSON.stringify(correction.data));
 assert.equal((await json('/api/runs',headers,'PATCH',{runId:profiled.data.run.id,approved:true})).data.code,'RAG_APPROVAL_DENIED');
 const correctedMemory=(await json('/api/knowledge',headers)).data;assert.equal(correctedMemory.units.length,1);assert.notEqual(correctedMemory.units[0].id,UNIT.id);
 assert.equal((await json('/api/knowledge?id='+correctedMemory.units[0].id,headers,'DELETE')).status,200);

 assert.equal((await json('/api/runs',headers,'PATCH',{runId:warm.data.run.id,approved:true})).data.code,'RAG_APPROVAL_DENIED');
 const pending=await json('/api/workflows/run',headers,'POST',input('enforceability'));assert.equal(pending.data.run.rag.status,'withheld');
 process.stdout.write('PASS production HTTP: onboarding; vault; policy; reviewed corpus import; empty-memory abstention; all 5 API DAGs; all 5 complete DAGs over pinned SSH; warm cache; user/tool isolation; sharing gate; persistent outputs; approval; source withdrawal; specialization revisions; prompt forwarding to remote engine; atomic memory correction. Neural services were deterministic doubles, not live legal evaluation.\n');
}finally{child.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(r,2000);child.once('exit',()=>{clearTimeout(t);r();});});await ssh.close();mock.restore();if(globalThis.__mizanDatabase){getDb().close();globalThis.__mizanDatabase=undefined;}await rm(dataDir,{recursive:true,force:true});}
