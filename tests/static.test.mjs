import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const worker=fs.readFileSync('src/index.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
const css=fs.readFileSync('public/style.css','utf8');
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const migration=fs.readFileSync('migrations/0001_initial.sql','utf8');

test('v8 package is existing-D1 and No-R2',()=>{
  assert.equal(pkg.version,'8.0.2');
  assert.equal(config.r2_buckets,undefined);
  assert.equal(config.d1_databases?.[0]?.binding,'DB');
  assert.equal(config.d1_databases?.[0]?.database_id,'5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a');
  assert.ok(fs.existsSync('START.bat'));
  assert.ok(fs.existsSync('RESET-D1-AND-DEPLOY.ps1'));
  assert.ok(fs.existsSync('START-KEEP-DATA.bat'));
  assert.ok(fs.existsSync('START-NO-R2.ps1'));
  assert.match(worker,/r2:false/);
});



test('fresh-start script targets only the requested D1 and resets app tables',()=>{
  const reset=fs.readFileSync('RESET-D1-AND-DEPLOY.ps1','utf8');
  const resetSql=fs.readFileSync('migrations/0000_reset_app.sql','utf8');
  assert.match(reset,/5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a/);
  assert.doesNotMatch(reset,/wrangler\s+d1\s+create/i);
  for(const table of ['sessions','audit_logs','resources','announcements','subjects','settings','admins']) {
    assert.match(resetSql,new RegExp(`DROP TABLE IF EXISTS ${table}`));
  }
});

test('clean schema includes v8 No-R2 fields',()=>{
  for(const table of ['admins','sessions','subjects','resources','announcements','settings','audit_logs'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  for(const field of ['mirror_url_1','mirror_url_2','tags','pinned','expires_at','deleted_at'])assert.match(migration,new RegExp(field));
  assert.doesNotMatch(worker,/v3_/);
  assert.doesNotMatch(migration,/v3_/);
});

test('PBKDF2 stays inside Cloudflare WebCrypto limit',()=>{
  const n=Number(worker.match(/iterations:(\d+)/)?.[1]);
  assert.equal(n,100000);
});

test('external links require HTTPS and block local/private targets',()=>{
  assert.match(worker,/url\.protocol!==['"]https:['"]/);
  assert.match(worker,/a===10/);
  assert.match(worker,/a===192&&b===168/);
  assert.match(worker,/redirect:'manual'/);
});

test('v8 routes include No-R2 management features',()=>{
  for(const p of ['/health','/bootstrap/status','/public','/admin/dashboard','/admin/resources/bulk','/admin/link-check','/admin/trash','/admin/team','/admin/backup','/admin/restore','/admin/settings'])assert.ok(worker.includes(p),p);
});

test('frontend contains all requested v8 flows',()=>{
  for(const symbol of ['renderPublicCatalog','toggleFavorite','showQR','showResourceLinks','renderImport','renderTrash','renderTeam','renderSettings','resourceModal'])assert.match(app,new RegExp(symbol));
  assert.match(app,/mirror_url_1/);
  assert.match(app,/maintenance_mode/);
  assert.match(css,/\.quick-switch/);
  assert.match(css,/\.trash-item/);
});

test('each resource opens in its own dedicated browser window with fallback',()=>{
  assert.match(app,/name=`bfa_file_\$\{Number\(id\)\|\|0\}_\$\{which\}`/);
  assert.match(app,/popup=yes,width=\$\{width\},height=\$\{height\}/);
  assert.match(app,/fileWindow\.focus\(\)/);
  assert.match(app,/window\.open\(url,'_blank','noopener,noreferrer'\)/);
});

test('PWA service worker does not cache API responses',()=>{
  assert.match(sw,/startsWith\('\/api\/'\)/);
  assert.match(sw,/CACHE='bfa-v8-shell'/);
});

test('project contains no R2 binding or upload API',()=>{
  assert.equal(config.r2_buckets,undefined);
  assert.doesNotMatch(JSON.stringify(config),/R2_BUCKET|r2_buckets/i);
  assert.doesNotMatch(worker,/e\.FILES|env\.FILES|put\(.*file|multipart\/form-data/i);
  const setup=fs.readFileSync('START-NO-R2.ps1','utf8');
  assert.doesNotMatch(setup,/wrangler\s+d1\s+create/i);
  assert.match(setup,/wrangler d1 list --json/);
  assert.match(setup,/5bcf36c6-e1fc-47d4-8431-6d1fc1c8aa5a/);
});

test('student-facing metadata hides infrastructure branding',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const manifest=fs.readFileSync('public/manifest.webmanifest','utf8');
  assert.doesNotMatch(html,/Cloudflare|D1|No R2/i);
  assert.doesNotMatch(manifest,/Cloudflare|D1|No R2/i);
});
