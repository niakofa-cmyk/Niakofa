import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const script=resolve("scripts/production-gate.mjs");
function run(env){return spawnSync(process.execPath,[script],{encoding:"utf8",env});}
test("missing origins fail closed",()=>{const r=run({});assert.equal(r.status,2);assert.match(r.stderr,/Missing required environment variable/);});
test("non-http origins fail closed",()=>{const r=run({NIAKOFA_API_ORIGIN:"ftp://example.com",LEGACY_RPG_ORIGIN:"https://example.com"});assert.equal(r.status,2);});
test("unsafe timeout fails closed",()=>{const r=run({NIAKOFA_API_ORIGIN:"https://example.com",LEGACY_RPG_ORIGIN:"https://example.org",GATE_TIMEOUT_MS:"0"});assert.equal(r.status,2);assert.match(r.stderr,/GATE_TIMEOUT_MS/);});
