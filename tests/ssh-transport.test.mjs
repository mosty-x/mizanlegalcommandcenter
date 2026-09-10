import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { sshExchange, validateSshCredentials } from "../lib/server/ssh-transport.ts";
import { providerInputSchema } from "../lib/ai/providers.ts";
import { startSshFixture } from "./ssh-fixture.mjs";

test("real SSH handshake, fixed command, validation and failure boundaries", async t => {
  const server = await startSshFixture();
  const originalAllowlist = process.env.ALLOWED_SSH_HOSTS;
  process.env.ALLOWED_SSH_HOSTS = `${server.settings.host}:${server.settings.port}`;
  const exchange = (settings = server.settings, extra = {}) => sshExchange({ settings,
    packet: { protocol: "mizan.workflow.v1", requestId: randomUUID(), operation: "health" }, ...extra });
  try {
    await t.test("health succeeds over SSH and only invokes the fixed receiver", async () => {
      assert.equal((await exchange()).ready, true);
      assert.deepEqual(server.commands, ["/usr/local/bin/mizan-workflow --stdio"]);
    });
    await t.test("SSH input requires fingerprint and does not require an API key", () => {
      const input = { label: "remote", provider: "ssh-gateway", model: "legal-default", ssh: server.settings };
      assert.equal(providerInputSchema.safeParse(input).success, true);
      assert.equal(providerInputSchema.safeParse({ ...input, ssh: { ...server.settings, fingerprint: "" } }).success, false);
      assert.throws(() => validateSshCredentials({ ...server.settings, host: "server;id" }));
    });
    await t.test("unlisted host, invalid port and invalid private key are rejected", async () => {
      assert.throws(() => validateSshCredentials({ ...server.settings, host: "unlisted.example.com" }), /SSH_HOST_DENIED/);
      assert.throws(() => validateSshCredentials({ ...server.settings, port: 65536 }));
      assert.throws(() => validateSshCredentials({ ...server.settings, privateKey: "x".repeat(90) }), /SSH_KEY_INVALID/);
    });
    await t.test("bad fingerprint is rejected before authentication or job submission", async () => {
      const before = server.authCount; const packets = server.packets.length;
      await assert.rejects(exchange({ ...server.settings, fingerprint: `SHA256:${randomBytes(32).toString("base64").replace(/=+$/, "")}` }), /SSH_FINGERPRINT_MISMATCH/);
      assert.equal(server.authCount, before); assert.equal(server.packets.length, packets);
    });
    for (const [mode, error] of [["wrong-id", /SSH_PROTOCOL_INVALID/], ["invalid", /SSH_PROTOCOL_INVALID/], ["oversize", /PROVIDER_RESPONSE_TOO_LARGE/], ["disconnect", /SSH_CONNECTION_CLOSED|SSH_EXEC_FAILED/], ["timeout", /SSH_TIMEOUT/]]) {
      await t.test(mode, async () => { server.mode = mode; await assert.rejects(exchange(server.settings, { timeoutMs: mode === "timeout" ? 400 : 4000 }), error); });
    }
    server.mode = "valid";
    await t.test("connection slot is released after failure", async () => assert.equal((await exchange()).ready, true));
  } finally {
    if (originalAllowlist === undefined) delete process.env.ALLOWED_SSH_HOSTS; else process.env.ALLOWED_SSH_HOSTS = originalAllowlist;
    await server.close();
  }
});
