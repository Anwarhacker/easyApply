import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve('dist');
const json = async name => JSON.parse(await readFile(name, 'utf8'));
const manifest = await json(path.join(root, 'manifest.json'));
const pkg = await json('package.json');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version, 'Manifest and package versions differ');
assert.deepEqual([...manifest.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage']);
assert.equal((manifest.host_permissions || []).length, 0, 'Production must not grant persistent website access');
assert.deepEqual(manifest.optional_host_permissions, ['https://api.groq.com/*']);
assert.equal(manifest.content_scripts, undefined, 'Content scripts must be user-activated');
assert.equal(manifest.externally_connectable, undefined);
assert.equal(manifest.key, undefined, 'Do not ship a development extension key');
assert.ok(!JSON.stringify(manifest.content_security_policy || {}).includes('unsafe-eval'));
const files = [];
async function walk(folder) { for (const entry of await readdir(folder, {withFileTypes:true})) {
  const target = path.join(folder, entry.name);
  assert.ok(!entry.isSymbolicLink(), 'Symlinks are not allowed in release output');
  if (entry.isDirectory()) await walk(target); else files.push(path.relative(root, target).replaceAll('\\', '/'));
} }
await walk(root);
for (const file of files) {
  assert.ok(/\.(m?js|css|html|json|png|svg|txt|woff2?)$/i.test(file), `Unexpected release file: ${file}`);
  assert.ok(!/(?:^|\/)(?:test|e2e|\.env|node_modules)|\.map$|\.spec\./i.test(file), `Test/private artifact: ${file}`);
  if (/\.(m?js|html)$/.test(file)) {
    const body = await readFile(path.join(root, file), 'utf8');
    assert.ok(!/qaActivatePage|@vite\/client|@react-refresh|__vite_plugin_react_preamble_installed__|gsk_[A-Za-z0-9]{20,}/.test(body), `Development hook or embedded credential: ${file}`);
    if (file.endsWith('.html')) assert.ok(!/<script[^>]+src=["']https?:/i.test(body), `Remote script: ${file}`);
  }
}
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, 'privacy.html', 'THIRD-PARTY-NOTICES.txt', ...Object.values(manifest.icons)]) {
  assert.ok(files.includes(file), `Missing package resource: ${file}`);
}
for (const [size, file] of Object.entries(manifest.icons)) {
  const data = await readFile(path.join(root, file));
  assert.equal(data.readUInt32BE(16), Number(size), `Icon width: ${file}`);
  assert.equal(data.readUInt32BE(20), Number(size), `Icon height: ${file}`);
}
for (const entry of manifest.web_accessible_resources || []) for (const file of entry.resources) assert.ok(files.includes(file), `Missing accessible resource: ${file}`);
const bytes = (await Promise.all(files.map(file => stat(path.join(root, file))))).reduce((sum, info) => sum + info.size, 0);
console.log(`Release checks passed: ${manifest.name} ${manifest.version}, ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB. No testing host permissions or development hooks.`);
console.log('Store submission still requires a hosted privacy URL, support details, current listing images, and dashboard disclosures.');
