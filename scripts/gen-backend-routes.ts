/** Regenerates backend/src/routes.ts from the API route files. Run after adding/removing a route: npm run backend:routes */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (n === 'route.ts') out.push(p);
  }
  return out;
}
const root = join(process.cwd(), 'src', 'app', 'api');
const files = walk(root).sort();
const imports: string[] = [];
const entries: string[] = [];
files.forEach((f, i) => {
  const relToSrc = relative(join(process.cwd(), 'src'), f).split(sep).join('/').replace(/\.ts$/, '');
  const url = '/api/' + relative(root, dirname(f)).split(sep).join('/').replace(/\[([^\]]+)\]/g, ':$1');
  imports.push(`import * as r${i} from '@/${relToSrc}';`);
  entries.push(`  ['${url.replace(/\/$/, '')}', r${i} as unknown as RouteModule],`);
});
writeFileSync(
  join(process.cwd(), 'backend', 'src', 'routes.ts'),
  `// GENERATED from src/app/api/**/route.ts by \`npm run backend:routes\`. Do not edit by hand.\nimport type { RouteModule } from './adapter';\n${imports.join('\n')}\n\nexport const ROUTES: [string, RouteModule][] = [\n${entries.join('\n')}\n];\n`,
);
console.log(`✓ ${files.length} routes written to backend/src/routes.ts`);
