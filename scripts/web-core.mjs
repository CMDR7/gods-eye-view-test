import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const commandArgs = args[0] === 'dev'
  ? ['--config', 'vite.web-core.config.js']
  : ['build', '--config', 'vite.web-core.config.js'];

// Invoke the locally installed Vite CLI directly instead of relying on PATH.
// This keeps CI and local execution deterministic across npm/OS environments.
const scriptDir = dirname(fileURLToPath(import.meta.url));
const viteCli = resolve(scriptDir, '../node_modules/vite/bin/vite.js');

const child = spawn(process.execPath, [viteCli, ...commandArgs], {
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(`Unable to start Vite: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
