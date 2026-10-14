import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('diagnostics guide is explicitly shipped with frontmatter',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 assert.ok(pkg.files.includes('docs/notification-diagnostics.md'));
 assert.ok((await readFile(new URL('../docs/notification-diagnostics.md',import.meta.url),'utf8')).startsWith('---\n'));
});
