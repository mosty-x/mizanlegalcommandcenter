import { createHash, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import ssh2, { type Client as SshClient } from "ssh2";
const { Client, utils } = ssh2;
import { assertSshTargetAllowed, sshSettingsSchema, type SshSettings } from "../ai/ssh-settings";

export const SSH_COMMAND = "/usr/local/bin/mizan-workflow --stdio";
export const SSH_PROTOCOL = "mizan.workflow.v1";
const MAX_RESPONSE = 1_500_000;
const MAX_REQUEST = 120_000_000;
const active = new Set<string>();

export function validateSshCredentials(raw: unknown): SshSettings {
  const settings = sshSettingsSchema.parse(raw);
  assertSshTargetAllowed(settings);
  const key = utils.parseKey(settings.privateKey, settings.passphrase);
  if (key instanceof Error || Array.isArray(key) || !key.isPrivateKey()) throw new Error("SSH_KEY_INVALID");
  return settings;
}

export async function sshExchange(args: {
  settings: SshSettings;
  packet: { protocol: string; requestId: string; operation: "health" | "run"; [key: string]: unknown };
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<Record<string, unknown>> {
  const settings = validateSshCredentials(args.settings);
  const target = `${settings.host}:${settings.port}`;
  if (active.has(target) || active.size >= 4) throw new Error("SSH_BUSY");
  active.add(target);
  let connection: SshClient | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(args.timeoutMs ?? 90000, 90000));
  const cancel = () => controller.abort();
  args.signal?.addEventListener("abort", cancel, { once: true });
  if (args.signal?.aborted) controller.abort();
  try {
    const encoded = JSON.stringify(args.packet);
    if (Buffer.byteLength(encoded) > MAX_REQUEST) throw new Error("PAYLOAD_TOO_LARGE");
    // Resolve once and connect to that numeric address; no second DNS lookup at connect time.
    const address = await Promise.race([
      lookup(settings.host, { family: 4 }),
      new Promise<never>((_, reject) => {
        if (controller.signal.aborted) reject(new Error("SSH_TIMEOUT"));
        else controller.signal.addEventListener("abort", () => reject(new Error("SSH_TIMEOUT")), { once: true });
      }),
    ]).catch(() => { throw new Error(controller.signal.aborted ? "SSH_TIMEOUT" : "SSH_CONNECTION_FAILED"); });
    if (/^(0\.|169\.254\.|224\.|255\.)/.test(address.address) || address.address === "100.100.100.200") throw new Error("SSH_HOST_DENIED");
    if (controller.signal.aborted) throw new Error("SSH_TIMEOUT");
    const expected = Buffer.from(settings.fingerprint.slice(7), "base64");
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const client = connection = new Client();
      let settled = false;
      let mismatch = false;
      const finish = (error?: Error, body?: Record<string, unknown>) => {
        if (settled) return;
        settled = true;
        client.destroy();
        if (error) reject(error); else resolve(body!);
      };
      controller.signal.addEventListener("abort", () => finish(new Error("SSH_TIMEOUT")), { once: true });
      client.on("error", () => finish(new Error(mismatch ? "SSH_FINGERPRINT_MISMATCH" : "SSH_CONNECTION_FAILED")));
      client.on("close", () => finish(new Error("SSH_CONNECTION_CLOSED")));
      client.on("ready", () => {
        client.exec(SSH_COMMAND, { pty: false }, (error, stream) => {
          if (error) return finish(new Error("SSH_EXEC_FAILED"));
          const chunks: Buffer[] = [];
          let size = 0;
          let stderrSize = 0;
          stream.on("error", () => finish(new Error("SSH_CONNECTION_CLOSED")));
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE) return finish(new Error("PROVIDER_RESPONSE_TOO_LARGE"));
            chunks.push(Buffer.from(chunk));
          });
          // Drain stderr without storing or exposing remote logs (they may contain secrets).
          stream.stderr.on("data", (chunk: Buffer) => {
            stderrSize += chunk.length;
            if (stderrSize > 64000) finish(new Error("PROVIDER_RESPONSE_TOO_LARGE"));
          });
          stream.on("close", (code: number | undefined) => {
            if (code !== 0) return finish(new Error("SSH_EXEC_FAILED"));
            try {
              const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              if (!body || body.protocol !== SSH_PROTOCOL || body.requestId !== args.packet.requestId || body.ok !== true) throw new Error();
              if (args.packet.operation === "health" && body.ready !== true) throw new Error();
              finish(undefined, body);
            } catch { finish(new Error("SSH_PROTOCOL_INVALID")); }
          });
          stream.end(encoded);
        });
      });
      client.connect({
        host: address.address, port: settings.port, username: settings.username,
        privateKey: settings.privateKey, passphrase: settings.passphrase,
        readyTimeout: 15000, keepaliveInterval: 10000, keepaliveCountMax: 2,
        authHandler: ["publickey"], agentForward: false,
        hostVerifier: (key: Buffer) => {
          const actual = createHash("sha256").update(key).digest();
          const matches = expected.length === actual.length && timingSafeEqual(expected, actual);
          mismatch = !matches;
          return matches;
        },
      });
    });
  } finally {
    clearTimeout(timeout);
    args.signal?.removeEventListener("abort", cancel);
    connection?.destroy();
    active.delete(target);
  }
}
