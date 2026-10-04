import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const parts = ['easyApply third-party notices', 'The following production dependencies retain their respective copyrights and licenses.'];
for (const [folder, entry] of Object.entries(lock.packages)) {
  if (!folder || entry.dev || entry.optional) continue;
  const files = await readdir(folder);
  const licenses = files.filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file));
  if (!licenses.length) throw new Error(`Review missing license text: ${folder}`);
  parts.push(`\n=== ${folder.replace(/^node_modules\//, '')} ${entry.version} (${entry.license || 'see below'}) ===\n`);
  for (const file of licenses) parts.push(await readFile(path.join(folder, file), 'utf8'));
}
await writeFile('public/THIRD-PARTY-NOTICES.txt', parts.join('\n\n'));
console.log('Third-party notices generated from installed production dependencies.');
