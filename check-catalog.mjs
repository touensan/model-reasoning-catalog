import fs from 'node:fs';
import assert from 'node:assert/strict';
const c = JSON.parse(fs.readFileSync(new URL('catalog.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''));
assert.equal(c.schemaVersion, 1);
assert(Number.isSafeInteger(c.revision) && c.revision > 0);
const allowed = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
for (const r of [c.fallback, ...c.rules]) {
  assert.equal(new Set(r.efforts).size, r.efforts.length);
  assert(r.efforts.every(e => allowed.has(e)));
  assert(!r.efforts.length || r.efforts.includes(r.defaultEffort));
  assert([...(r.ids ?? []), ...(r.prefixes ?? [])].every(s => typeof s === 'string' && s.trim()));
}
assert(c.rules.find(r => r.prefixes?.includes('gpt-6')).efforts.includes('medium'));
for (const model of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-5.6-sol', 'gpt-5.6-terra']) {
  assert(c.rules.find(r => r.prefixes?.includes(model)).efforts.includes('ultra'));
}
assert(!c.rules.find(r => r.prefixes?.includes('gpt-6')).efforts.includes('ultra'));
assert(!c.rules.find(r => r.prefixes?.includes('gpt-4')).efforts.length);
console.log('Catalog validated');
