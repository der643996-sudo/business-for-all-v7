import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/style.css','utf8');
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const migration=fs.readFileSync('migrations/0001_initial.sql','utf8');

// The distributed package intentionally has no D1 id. START-FRESH-DATABASE creates a new DB and writes the binding.
test('v7.1 fresh package has no legacy D1 binding',()=>{
  assert.equal(pkg.version,'7.1.0');
  assert.equal(config.d1_databases,undefined);
  assert.ok(fs.existsSync('START-FRESH-DATABASE.bat'));
  assert.ok(fs.existsSync('START-FRESH-DATABASE.ps1'));
  assert.match(worker,/e\.DB/);
});

test('fresh schema has clean table names and no v3 legacy tables',()=>{
  for(const table of ['admins','sessions','subjects','resources','announcements','settings','audit_logs']){
    assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(worker,/v3_/);
  assert.doesNotMatch(migration,/v3_/);
});

test('PBKDF2 stays inside Cloudflare WebCrypto limit',()=>{
  const n=Number(worker.match(/iterations:(\d+)/)?.[1]);
  assert.ok(n>=100000&&n<=100000);
});

test('external links require HTTPS and block private IPv4 ranges',()=>{
  assert.match(worker,/url\.protocol!==['"]https:['"]/);
  assert.match(worker,/a===10/);
  assert.match(worker,/a===192&&b===168/);
});

test('critical public and admin routes exist',()=>{
  for(const p of ['/health','/bootstrap/status','/bootstrap/owner','/auth/login','/auth/logout','/public','/admin/dashboard','/admin/backup','/admin/restore','/admin/link-check','/admin/sessions/revoke'])assert.ok(worker.includes(p),p);
});

test('frontend contains redesigned public and admin flows',()=>{
  for(const symbol of ['publicSite','dashboard','subjectModal','resourceModal','announcementModal','downloadBackup','restoreBackup','previewResource'])assert.match(app,new RegExp(symbol));
  assert.match(css,/\.admin-shell/);
  assert.match(css,/\.catalog-layout/);
  assert.match(css,/\.login-shell/);
});

test('no Firebase, R2, old D1 id, or stale secret setup flow',()=>{
  assert.doesNotMatch(worker,/firebase|e\.FILES|env\.FILES/i);
  assert.equal(config.r2_buckets,undefined);
  assert.equal(fs.existsSync('scripts/setup-owner.mjs'),false);
  assert.doesNotMatch(JSON.stringify(config),/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
