// Entry point for the Docker image and this repo (`pnpm fortest`): the published CLI plus `serve`.
import { start } from '@codegrenade/fortest-cli';

start({
  serve: () => import('./server'),
  // pnpm runs the root `fortest` script from the repo root; INIT_CWD is where it was invoked.
  cwd: process.env['INIT_CWD'] || process.cwd(),
});
