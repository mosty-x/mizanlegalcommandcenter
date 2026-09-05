import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

test("shipped remote receiver executes the reference handler against a local API fixture", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mizan-receiver-test-"));
  let received;
  const output = { title: "اختبار", executiveSummary: "نتيجة اصطناعية", findings: [], missingInformation: [], recommendedActions: [], assumptions: [], humanDecisionRequired: [], disclaimer: "اختبار" };
  const service = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    received = JSON.parse(raw);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
  await new Promise(resolve => service.listen(0, "127.0.0.1", resolve));
  const configPath = join(directory, "receiver.json");
  await writeFile(configPath, JSON.stringify({ handler: resolve("ssh-server/openai-compatible-handler.mjs"), profiles: {
    "legal-default": { endpoint: `http://127.0.0.1:${service.address().port}/v1/chat/completions`, model: "fixture-model" },
  } }));
  const run = (packet) => new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, ["ssh-server/mizan-workflow.mjs", "--stdio"], { env: { ...process.env, MIZAN_RECEIVER_CONFIG: configPath }, stdio: ["pipe", "pipe", "pipe"] });
    let raw = ""; child.stdout.on("data", data => { raw += data; });
    child.stderr.resume(); child.on("error", reject);
    child.on("exit", code => { try { resolveResult({ code, body: JSON.parse(raw) }); } catch (error) { reject(error); } });
    child.stdin.end(JSON.stringify(packet));
  });
  try {
    const base = { protocol: "mizan.workflow.v1", requestId: randomUUID() };
    const health = await run({ ...base, operation: "health" }); assert.equal(health.code, 0); assert.equal(health.body.ready, true);
    const result = await run({ ...base, operation: "run", workflow: { toolSlug: "disputes", profile: "legal-default" },
      documents: [{ id: "test" }], sources: [], policy: { externalActionsAllowed: false, humanApprovalRequired: true },
      prompt: { systemPrompt: "test-system", userPrompt: "test-user" } });
    assert.equal(result.code, 0); assert.deepEqual(result.body.output, output);
    assert.equal(received.model, "fixture-model"); assert.equal(received.messages[1].content, "test-user");
    const invalid = await run({ ...base, operation: "shell" }); assert.equal(invalid.code, 1); assert.equal(invalid.body.ok, false);
  } finally { await new Promise(resolve => service.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
