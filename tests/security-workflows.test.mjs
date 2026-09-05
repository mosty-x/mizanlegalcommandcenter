import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const read=(file)=>readFile(path.join(root,file),"utf8");

test("Railway deployment has a Docker build and a guarded health check",async()=>{const railway=JSON.parse(await read("railway.json"));const docker=await read("Dockerfile");assert.equal(railway.build.builder,"DOCKERFILE");assert.equal(railway.deploy.healthcheckPath,"/api/health");assert.match(docker,/node:24-alpine/);assert.match(docker,/USER nextjs/);});

test("first visit uses a signed HttpOnly cookie and versioned consent",async()=>{const session=await read("lib/server/session.ts");const onboarding=await read("app/api/onboarding/route.ts");assert.match(session,/HttpOnly/);assert.match(session,/SameSite=Lax/);assert.match(session,/timingSafeEqual/);assert.match(onboarding,/currentTermsVersion/);assert.match(onboarding,/completeOnboarding/);});

test("the guide contains all five workflows and a production launch gate",async()=>{const guide=await read("components/onboarding-gate.tsx");const tools=await read("lib/tool-definitions.ts");for(const slug of ["enforceability","disputes","deal-room","regulatory","client-command"])assert.match(tools,new RegExp(`slug: "${slug}"`));assert.match(guide,/viewedWorkflows/);assert.match(guide,/تشغيل نسخة الإنتاج/);assert.match(guide,/acceptedTerms/);});

test("secrets and blobs remain encrypted and path constrained",async()=>{const crypto=await read("lib/server/crypto.ts");const runtime=await read("lib/server/runtime.ts");assert.match(crypto,/AES-GCM/);assert.match(crypto,/additionalData/);assert.match(runtime,/STORAGE_KEY_INVALID/);assert.match(runtime,/startsWith/);assert.match(runtime,/mode:0o600/);});

test("provider URLs require HTTPS and an explicit allowlist",async()=>{const security=await read("lib/security.ts");assert.match(security,/url\.protocol !== "https:"/);assert.match(security,/DEFAULT_ALLOWED_AI_HOSTS/);assert.match(security,/PROVIDER_HOST_DENIED/);});

test("legal output preserves sources and human approval",async()=>{const workflow=await read("lib/workflows.ts");const route=await read("app/api/workflows/run/route.ts");assert.match(workflow,/verifiedSourceRefs/);assert.match(workflow,/invalidSourceRefs/);assert.match(workflow,/مراجعة واعتماد محام/);assert.match(route,/approvalStatus/);});

test("the Railway source no longer imports Cloudflare runtime or Drizzle",async()=>{const roots=["app","lib","db","components"];for(const directory of roots){const queue=[path.join(root,directory)];while(queue.length){const current=queue.pop();for(const item of await readdir(current,{withFileTypes:true})){const full=path.join(current,item.name);if(item.isDirectory())queue.push(full);else if(/\.(ts|tsx)$/.test(item.name)){const source=await readFile(full,"utf8");assert.doesNotMatch(source,/cloudflare:workers|drizzle-orm/,full);}}}}});

test("interface keeps RTL, premium dropdowns, scrollbars and reduced motion",async()=>{const layout=await read("app/layout.tsx");const css=await read("app/globals.css");assert.match(layout,/lang="ar" dir="rtl"/);assert.match(css,/::-webkit-scrollbar-thumb/);assert.match(css,/premium-select-option\[data-highlighted\]/);assert.match(css,/prefers-reduced-motion:\s*reduce/);});
