import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { startSshFixture } from "../tests/ssh-fixture.mjs";

const port=3137;
const origin=`http://127.0.0.1:${port}`;
const dataDir=await mkdtemp(path.join(os.tmpdir(),"mizan-smoke-"));
const ssh = await startSshFixture();
const child=spawn(process.execPath,[".next/standalone/server.js"],{cwd:process.cwd(),env:{...process.env,NODE_ENV:"production",PORT:String(port),HOSTNAME:"127.0.0.1",DATA_DIR:dataDir,CREDENTIAL_MASTER_KEY:randomBytes(32).toString("base64"),SESSION_SIGNING_KEY:randomBytes(32).toString("base64"),TERMS_VERSION:"smoke-v1",ALLOWED_SSH_HOSTS:`127.0.0.1:${ssh.settings.port}`},stdio:["ignore","pipe","pipe"]});
let diagnostics="";child.stdout.on("data",chunk=>{diagnostics+=chunk;});child.stderr.on("data",chunk=>{diagnostics+=chunk;});

async function waitForServer(){for(let i=0;i<80;i+=1){try{const response=await fetch(`${origin}/api/health`);if(response.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error(`Server did not become ready.\n${diagnostics}`);}

try{
  await waitForServer();
  const health=await fetch(`${origin}/api/health`);assert.equal(health.status,200);assert.equal((await health.json()).status,"ready");
  const first=await fetch(`${origin}/api/onboarding`);assert.equal(first.status,200);const firstBody=await first.json();assert.equal(firstBody.firstVisit,true);assert.equal(firstBody.guideRequired,true);
  const setCookie=first.headers.get("set-cookie");assert.ok(setCookie?.includes("HttpOnly"));const cookie=setCookie.split(";",1)[0];
  const returning=await fetch(`${origin}/api/onboarding`,{headers:{cookie}});assert.equal((await returning.json()).firstVisit,false);
  const blocked=await fetch(`${origin}/api/providers`,{headers:{cookie}});assert.equal(blocked.status,403);
  const accepted=await fetch(`${origin}/api/onboarding`,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify({acceptedTerms:true,viewedWorkflows:["enforceability","disputes","deal-room","regulatory","client-command"]})});const acceptedBody=await accepted.json();assert.equal(accepted.status,200,JSON.stringify(acceptedBody));assert.equal(acceptedBody.guideRequired,false);
  const after=await fetch(`${origin}/api/onboarding`,{headers:{cookie}});assert.equal((await after.json()).guideRequired,false);
  const providers=await fetch(`${origin}/api/providers`,{headers:{cookie}});assert.equal(providers.status,200);
  const createdProvider=await fetch(`${origin}/api/providers`,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify({label:"مزود الاختبار",provider:"openai",model:"gpt-5-mini",apiKey:"not-a-secret-smoke-value"})});assert.equal(createdProvider.status,201);const providerBody=await createdProvider.json();assert.equal("apiKey" in providerBody.provider,false);
  const createdDocument=await fetch(`${origin}/api/documents`,{method:"POST",headers:{cookie,origin,"content-type":"application/json"},body:JSON.stringify({toolSlug:"enforceability",fileName:"smoke.txt",mimeType:"text/plain",base64:Buffer.from("evidence").toString("base64"),extractedText:"واقعة اختبار موثقة"})});assert.equal(createdDocument.status,201);const documentBody=await createdDocument.json();
  const documents=await fetch(`${origin}/api/documents?tool=enforceability`,{headers:{cookie}});assert.equal((await documents.json()).documents.length,1);
  const headers = { cookie, origin, "content-type": "application/json" };
  const sshCreated = await fetch(`${origin}/api/providers`, { method: "POST", headers, body: JSON.stringify({
    label: "سيرفر اختبار", provider: "ssh-gateway", model: "legal-default", ssh: ssh.settings,
  }) });
  const sshBody = await sshCreated.json(); assert.equal(sshCreated.status, 201, JSON.stringify(sshBody));
  assert.equal("ssh" in sshBody.provider, false);
  const listBody = await (await fetch(`${origin}/api/providers`, { headers })).text();
  assert.equal(listBody.includes("PRIVATE KEY"), false); assert.equal(listBody.includes(ssh.settings.fingerprint), false);
  const connectionTest = await fetch(`${origin}/api/providers/test`, { method: "POST", headers, body: JSON.stringify({ providerId: sshBody.provider.id }) });
  assert.equal(connectionTest.status, 200, await connectionTest.text());
  // A second visitor cannot use the first visitor's SSH credentials or documents.
  const visitor2 = await fetch(`${origin}/api/onboarding`);
  const cookie2 = visitor2.headers.get("set-cookie").split(";", 1)[0];
  const headers2 = { ...headers, cookie: cookie2 };
  await fetch(`${origin}/api/onboarding`, {method: "POST", headers: headers2, body: JSON.stringify({ acceptedTerms: true, viewedWorkflows: ["enforceability","disputes","deal-room","regulatory","client-command"] })});
  assert.equal((await fetch(`${origin}/api/providers/test`, {method: "POST", headers: headers2, body: JSON.stringify({ providerId: sshBody.provider.id })})).status, 404);
  for (const toolSlug of ["enforceability","disputes","deal-room","regulatory","client-command"]) {
    const runResponse = await fetch(`${origin}/api/workflows/run`, { method: "POST", headers, body: JSON.stringify({ toolSlug,
      providerId: sshBody.provider.id, documentIds: [documentBody.document.id], title: "ملف اختبار", objective: "حلل واقعة الاختبار", jurisdiction: "مصر" }) });
    const runBody = await runResponse.json(); assert.equal(runResponse.status, 201, JSON.stringify(runBody));
    assert.equal(runBody.run.transparency.provider, "ssh-gateway");
    assert.equal(runBody.run.output.findings[0].verifiedSourceRefs.length, 1);
    assert.deepEqual(runBody.run.output.findings[0].invalidSourceRefs, ["UNKNOWN-SOURCE"]);
    assert.equal(runBody.run.approvedAt, null);
    const saved = await fetch(`${origin}/api/runs?id=${runBody.run.id}`, {headers});
    assert.equal((await saved.json()).run.output.title, runBody.run.output.title);
    const packet = ssh.packets.at(-1);
    assert.equal(packet.workflow.toolSlug, toolSlug);
    assert.equal(Buffer.from(packet.documents[0].base64, "base64").toString(), "evidence");
    assert.equal(packet.documents[0].id, documentBody.document.id);
    assert.equal(packet.policy.externalActionsAllowed, false);
  }
  assert.equal((await fetch(`${origin}/api/providers?id=${sshBody.provider.id}`,{method:"DELETE",headers})).status,200);
  assert.equal((await fetch(`${origin}/api/documents?id=${documentBody.document.id}`,{method:"DELETE",headers:{cookie,origin}})).status,200);
  assert.equal((await fetch(`${origin}/api/providers?id=${providerBody.provider.id}`,{method:"DELETE",headers:{cookie,origin}})).status,200);
  process.stdout.write("PASS standalone: onboarding, API vault, SSH save/test, user isolation, all five SSH workflows, original files, source checks, persisted results, deletion\n");
}finally{
  child.kill("SIGTERM");
  await new Promise(resolve=>{const timer=setTimeout(resolve,1500);child.once("exit",()=>{clearTimeout(timer);resolve();});});
  await rm(dataDir,{recursive:true,force:true});
  await ssh.close();
}
