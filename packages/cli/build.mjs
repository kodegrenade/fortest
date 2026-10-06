// Builds the publishable package into dist/: one bundled file (engine, types, utils, zod and
// yaml included, so it installs with no dependencies), a clean package.json, README, licenses.
// This source package stays private: its workspace dependencies are for the repo and Docker image.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist');

await build({
  entryPoints: ['src/bin.ts'],
  outfile: 'dist/fortest.cjs',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'warning',
});

writeFileSync(
  'dist/package.json',
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      bin: { fortest: 'fortest.cjs' },
      engines: { node: '>=20.3.0' },
      repository: {
        type: 'git',
        url: 'git+https://github.com/kodegrenade/fortest.git',
        directory: 'packages/cli',
      },
      homepage: 'https://github.com/kodegrenade/fortest#readme',
      bugs: 'https://github.com/kodegrenade/fortest/issues',
      keywords: ['api', 'testing', 'cli', 'ci', 'junit', 'postman', 'load-testing'],
      publishConfig: { access: 'public' },
    },
    null,
    2,
  ) + '\n',
);
cpSync('README.md', 'dist/README.md');
cpSync('../../LICENSE', 'dist/LICENSE');

// Bundled third-party code keeps its license notices.
// Resolved the way the bundler did: yaml from this package, zod via @fortest/types.
const fromHere = createRequire(join(process.cwd(), 'package.json'));
const fromTypes = createRequire(fromHere.resolve('@fortest/types'));
const notices = [
  ['zod', fromTypes],
  ['yaml', fromHere],
].map(([name, resolver]) => {
  const dir = dirname(resolver.resolve(`${name}/package.json`));
  const { version, license } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  return `${name}@${version} (${license})\n\n${readFileSync(join(dir, 'LICENSE'), 'utf8').trim()}\n`;
});
writeFileSync(
  'dist/THIRD-PARTY-NOTICES.txt',
  `This package bundles the following software:\n\n${notices.join('\n---\n\n')}`,
);

console.log(`Built ${pkg.name}@${pkg.version} into dist/`);
