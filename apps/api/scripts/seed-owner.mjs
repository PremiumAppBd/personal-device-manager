#!/usr/bin/env node
/**
 * Seed (or update) the single owner account in the LOCAL D1 database.
 *
 * Usage:
 *   OWNER_EMAIL=you@example.com OWNER_PASSWORD='a-long-password' \
 *     node scripts/seed-owner.mjs --local
 *
 * Uses PBKDF2-HMAC-SHA256 with the same parameters as src/lib/crypto.ts.
 * Never commit real credentials. This writes via `wrangler d1 execute`.
 */
import { execFileSync } from "node:child_process";
import { webcrypto as crypto } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run wrangler from the API package directory (where wrangler.toml lives),
// regardless of the caller's current working directory.
const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ITERATIONS = 210_000;

function b64url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: b64url(new Uint8Array(bits)), salt: b64url(salt) };
}

function uuid() {
  return crypto.randomUUID();
}

const email = (process.env.OWNER_EMAIL || "").toLowerCase().trim();
const password = process.env.OWNER_PASSWORD || "";
const isLocal = process.argv.includes("--local");

if (!email || !password) {
  console.error("Set OWNER_EMAIL and OWNER_PASSWORD environment variables.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("OWNER_PASSWORD must be at least 12 characters.");
  process.exit(1);
}

const { hash, salt } = await hashPassword(password);
const now = Date.now();
const id = uuid();
const esc = (s) => s.replace(/'/g, "''");

const sql = `INSERT INTO owners (id, email, password_hash, password_salt, created_at, updated_at)
VALUES ('${id}', '${esc(email)}', '${hash}', '${salt}', ${now}, ${now})
ON CONFLICT(email) DO UPDATE SET password_hash='${hash}', password_salt='${salt}', updated_at=${now};`;

const args = [
  "exec",
  "wrangler",
  "d1",
  "execute",
  "pdm_db",
  isLocal ? "--local" : "--remote",
  "--command",
  sql,
];

console.log(`Seeding owner ${email} (${isLocal ? "local" : "remote"})...`);
// Use the workspace-installed wrangler via pnpm, run from the API directory.
execFileSync("pnpm", args, { stdio: "inherit", cwd: API_DIR });
console.log("Done.");
