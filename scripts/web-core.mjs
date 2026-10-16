import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const isDev = args[0] === 'dev';
const commandArgs = isDev
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

child.on('exit', async (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if ((code ?? 1) !== 0 || isDev) {
    process.exit(code ?? 1);
  }

  // GitHub Pages requires the deployed artifact to expose its entry document
  // as index.html at the artifact root. Keep web-core.html as the Vite input,
  // then provide the Pages-compatible entry point in the generated artifact.
  try {
    await copyFile('dist-web-core/web-core.html', 'dist-web-core/index.html');
    console.log('Web Core Pages entry created: dist-web-core/index.html');
  } catch (error) {
    console.error(`Unable to create Pages entry point: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
});
