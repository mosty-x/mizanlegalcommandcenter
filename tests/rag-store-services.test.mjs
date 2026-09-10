import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { importCorpus,readCorpus,revokeUnit,readRagCache,writeRagCache,corpusRevisionNow } from '../lib/rag/store.ts';
import { createRagServices,validateCapabilities } from '../lib/rag/services.ts';
import { UNIT,MATTER,LAW,POLICY,PROVIDERS,TODAY } from './helpers/rag-fixtures.mjs';
import { installMockAi } from './helpers/mock-ai-fetch.mjs';
import { run as runRemote } from '../ssh-server/egypt-rag-handler.ts';
import { getDb } from '../db/index.ts';
import { callProvider } from '../lib/ai/providers.ts';
const dir=await mkdtemp(join(tmpdir(),'mizan-rag-store-'));
process.env.DATA_DIR=dir;process.env.CREDENTIAL_MASTER_KEY=randomBytes(32).toString('base64');process.env.SESSION_SIGNING_KEY=randomBytes(32).toString('base64');
test.after(async()=>{getDb().close();globalThis.__mizanDatabase=undefined;await rm(dir,{recursive:true,force:true});});
test('corpus encryption, tenant isolation, idempotent import and atomic conflict',async()=>{
 await importCorpus('alice',[UNIT]);await importCorpus('alice',[UNIT]);assert.equal((await readCorpus('alice')).units.length,1);assert.equal((await readCorpus('bob')).units.length,0);
 await assert.rejects(importCorpus('alice',[{...UNIT,id:'new-unit'},{...UNIT,text:UNIT.text+' conflict'}]),/RAG_IMPORT_CONFLICT/);assert.equal((await readCorpus('alice')).units.length,1);
 const rows=getDb().prepare('SELECT ciphertext FROM legal_units').all();assert.ok(!JSON.stringify(rows).includes(UNIT.text));
 assert.equal((await readCorpus('alice')).revision,corpusRevisionNow('alice'));
});
test('cache is encrypted, tenant scoped, TTL bounded, and invalidated on withdrawal',async()=>{
 await writeRagCache('alice','cache', {value:'private-vector'},60);assert.equal(await readRagCache('bob','cache'),null);assert.deepEqual(await readRagCache('alice','cache'),{value:'private-vector'});
 await writeRagCache('alice','expired',{value:1},-1);assert.equal(await readRagCache('alice','expired'),null);
 assert.equal(revokeUnit('bob',UNIT.id),false);assert.equal(revokeUnit('alice',UNIT.id),true);assert.equal(await readRagCache('alice','cache'),null);assert.equal((await readCorpus('alice')).units.length,0);
});
test('source withdrawal while decrypting is detected by the final synchronous revision',async()=>{
 await importCorpus('race',[UNIT]);const before=corpusRevisionNow('race');const pending=readCorpus('race');revokeUnit('race',UNIT.id);
 assert.equal((await pending).revision,before);assert.notEqual(corpusRevisionNow('race'),before);
});
test('embedding + rerank transports execute once, then scoped cache hits; changed matter invalidates',async()=>{
 const mock=installMockAi();try{
 const args={userId:'cache-user',tool:'enforceability',documentIds:['matter-1'],revision:'revision-1',policy:POLICY,providers:PROVIDERS,signal:AbortSignal.timeout(10000)};
 const one=createRagServices(args);await one.rerank('query',await one.retrieve('query',[LAW]));assert.equal(one.usage.serviceCalls,2);
 const two=createRagServices(args);await two.rerank('query',await two.retrieve('query',[LAW]));assert.equal(two.usage.serviceCalls,0);assert.equal(two.metrics.embeddingHits,2);assert.equal(two.metrics.retrievalCacheHit,true);
 const three=createRagServices({...args,documentIds:['matter-2']});await three.retrieve('query',[LAW]);assert.equal(three.metrics.embeddingHits,0);
 }finally{mock.restore();}
});
test('vLLM salt differs by tenant/matter and is absent in provider-managed mode',async()=>{
 const mock=installMockAi();try{for(const [user,docs,mode] of [['a',['x'],'vllm'],['b',['x'],'vllm'],['a',['y'],'vllm'],['a',['x'],'provider-managed']]){
 const service=createRagServices({userId:user,tool:'enforceability',documentIds:docs,revision:'r',policy:{...POLICY,kvBackend:mode},providers:PROVIDERS,signal:AbortSignal.timeout(10000)});
 await service.model('extract','استخرج الوقائع فقط','{}');}
 const salts=mock.requests.map(r=>r.body.cache_salt);assert.equal(new Set(salts.slice(0,3)).size,3);assert.equal(salts[3],undefined);
 }finally{mock.restore();}
});
test('wrong role endpoint or failed neural service cannot fall back to ungrounded mode',async()=>{
 assert.throws(()=>validateCapabilities({...PROVIDERS,embedding:PROVIDERS.generation},POLICY),/RAG_CAPABILITY_MISSING/);
 const mock=installMockAi();try{const service=createRagServices({userId:'failed',tool:'enforceability',documentIds:['x'],revision:'r',policy:POLICY,providers:{...PROVIDERS,embedding:{...PROVIDERS.embedding,config:{...PROVIDERS.embedding.config,model:'fixture-failure'}}},signal:AbortSignal.timeout(10000)});await assert.rejects(service.retrieve('test',[LAW]),/RAG_SERVICE_FAILED/);}finally{mock.restore();}
});
test('remote Egyptian handler runs the SAME multi-stage engine with server-owned credentials',async()=>{
 const mock=installMockAi();try{
 const result=await runRemote({tenantScope:'a'.repeat(64),workflow:{version:'egypt-rag-2.1.0',toolSlug:'disputes'},documents:[{id:'fixture'}],sources:[MATTER],rag:{title:'اختبار',objective:'اختبار البيانات',asOf:TODAY,framework:'EG',policy:POLICY,corpusRevision:'b'.repeat(64),law:[LAW]}},{ragProviders:PROVIDERS});
 assert.equal(result.ragResult.version,'egypt-rag-2.1.0');assert.equal(result.ragResult.nodes.length,8);assert.equal(result.ragResult.claims.length,1);assert.equal(result.ragResult.claims[0].kind,'event');assert.equal(result.usage.modelCalls,4);
 }finally{mock.restore();}
});

test('generation response size is bounded while streaming, without a content-length header',async()=>{
 const original=globalThis.fetch;let cancelled=false;
 globalThis.fetch=async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1000000));},cancel(){cancelled=true;}}));
 try{await assert.rejects(callProvider({...PROVIDERS.generation,systemPrompt:'test',userPrompt:'test'}),/PROVIDER_RESPONSE_TOO_LARGE/);assert.equal(cancelled,true);}finally{globalThis.fetch=original;}
});
