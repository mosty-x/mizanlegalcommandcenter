#!/usr/bin/env node
// Fixed stdio receiver. Install on YOUR remote SSH server; never upload its config to git.
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

const protocol = "mizan.workflow.v1";
const deadline = setTimeout(() => process.exit(124), 85000);
let requestId = null;
try {
  if (process.argv[2] !== "--stdio") throw new Error("STDIO_REQUIRED");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 120000000) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  const packet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (packet.protocol !== protocol || !/^[a-f0-9-]{36}$/.test(packet.requestId)) throw new Error("PROTOCOL_INVALID");
  requestId = packet.requestId;
  const configPath = process.env.MIZAN_RECEIVER_CONFIG || "/etc/mizan/receiver.json";
  const config = JSON.parse(await readFile(configPath, "utf8"));
  if (!isAbsolute(config.handler)) throw new Error("HANDLER_INVALID");
  const handler = await import(pathToFileURL(config.handler).href);
  let response;
  if (packet.operation === "health") {
    if (typeof handler.run !== "function" || typeof handler.health !== "function") throw new Error("HANDLER_INVALID");
    const ready = await handler.health(config);
    if (ready !== true) throw new Error("HANDLER_NOT_READY");
    response = { ready: true };
  } else if (packet.operation === "run") {
    if (!["enforceability", "disputes", "deal-room", "regulatory", "client-command"].includes(packet.workflow?.toolSlug)
      || packet.policy?.externalActionsAllowed !== false || packet.policy?.humanApprovalRequired !== true
      || !Array.isArray(packet.documents) || packet.documents.length < 1 || packet.documents.length > 8
      || !Array.isArray(packet.sources)) throw new Error("WORKFLOW_INVALID");
    response = await handler.run(packet, config);
    if (!response || typeof response.output !== "object") throw new Error("OUTPUT_INVALID");
  } else throw new Error("OPERATION_INVALID");
  const encoded = JSON.stringify({ ...response, protocol, requestId, ok: true });
  if (Buffer.byteLength(encoded) > 1500000) throw new Error("OUTPUT_TOO_LARGE");
  process.stdout.write(encoded);
} catch {
  // Keep provider errors, filenames, prompts and credentials out of SSH stdout/stderr.
  process.stdout.write(JSON.stringify({ protocol, requestId, ok: false, code: "REMOTE_EXECUTION_FAILED" }));
  process.exitCode = 1;
} finally { clearTimeout(deadline); }
