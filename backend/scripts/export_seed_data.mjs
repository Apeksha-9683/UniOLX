/**
 * Converts the TypeScript mock data in `src/data` into JSON the Python
 * seeder can read. Run from the repo root:
 *
 *   node backend/scripts/export_seed_data.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const outDir = join(repoRoot, 'backend', 'app', 'seed');

/** Evaluates a `export const x: T[] = [...]` module and returns the value. */
function loadArray(file, exportName) {
  const source = readFileSync(file, 'utf8');
  const stripped = source
    .replace(/^\s*import[^;]+;\s*$/gm, '')
    .replace(new RegExp(`export\\s+const\\s+${exportName}\\s*(:[^=]+)?=`, 'g'), `const ${exportName} =`);

  const factory = new Function(`${stripped}\nreturn ${exportName};`);
  return factory();
}

const colleges = loadArray(join(repoRoot, 'src', 'data', 'colleges.ts'), 'colleges');
const listings = loadArray(join(repoRoot, 'src', 'data', 'listings.ts'), 'mockListings');
const users = loadArray(join(repoRoot, 'src', 'data', 'user.ts'), 'currentUser');

mkdirSync(outDir, { recursive: true });

writeFileSync(join(outDir, 'colleges.json'), JSON.stringify(colleges, null, 2));
writeFileSync(join(outDir, 'listings.json'), JSON.stringify(listings, null, 2));
writeFileSync(join(outDir, 'users.json'), JSON.stringify(users, null, 2));

console.log(
  `wrote ${colleges.length} colleges, ${listings.length} listings and 1 demo user to ${outDir}`
);
