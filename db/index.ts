import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

declare global {
  var __mizanDatabase: DatabaseSync | undefined;
}

function dataDirectory(): string {
  const configured = process.env.DATA_DIR?.trim();
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), ".mizan-data");
}

function initialize(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, visit_count INTEGER NOT NULL DEFAULT 1, guide_completed_at TEXT, terms_version TEXT, terms_accepted_at TEXT);
    CREATE TABLE IF NOT EXISTS provider_configs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, base_url TEXT NOT NULL, api_key_ciphertext TEXT NOT NULL, api_key_iv TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(user_id, label));
    CREATE TABLE IF NOT EXISTS firm_configs (user_id TEXT NOT NULL, kind TEXT NOT NULL, ciphertext TEXT NOT NULL, iv TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(user_id, kind));
    CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tool_slug TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sha256 TEXT NOT NULL, blob_key TEXT NOT NULL, blob_iv TEXT NOT NULL, text_key TEXT NOT NULL, text_iv TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workflow_runs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, tool_slug TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, provider_id TEXT NOT NULL, model TEXT NOT NULL, output_key TEXT, output_iv TEXT, source_count INTEGER NOT NULL DEFAULT 0, verified_citation_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER, output_tokens INTEGER, error_code TEXT, workflow_version TEXT NOT NULL DEFAULT '1.0.0', approved_at TEXT, approved_by TEXT, created_at TEXT NOT NULL, completed_at TEXT);
    CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT, event_type TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (user_id TEXT NOT NULL, bucket TEXT NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, bucket));
    CREATE INDEX IF NOT EXISTS idx_provider_configs_user ON provider_configs(user_id);
    CREATE INDEX IF NOT EXISTS idx_documents_user_tool ON documents(user_id, tool_slug);
    CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_created ON workflow_runs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_tool ON workflow_runs(user_id, tool_slug);
    CREATE INDEX IF NOT EXISTS idx_audit_events_user_created ON audit_events(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_run ON audit_events(run_id);
  `);
}

export function getDb(): DatabaseSync {
  if (globalThis.__mizanDatabase) return globalThis.__mizanDatabase;
  const directory = dataDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(path.join(directory, "mizan.sqlite"));
  initialize(database);
  globalThis.__mizanDatabase = database;
  return database;
}

export function getDataDirectory(): string {
  return dataDirectory();
}
