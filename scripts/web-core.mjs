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

  // Generate the Web Core app/shortcut icons from the original target mark.
  // The generated PNGs replace the legacy GEV eye/globe artwork in the deployed artifact.
  try {
    const iconGenerator = resolve(scriptDir, 'generate-web-core-icons.mjs');
    const iconProcess = spawn(process.execPath, [iconGenerator], {
      stdio: 'inherit',
      shell: false,
    });

    await new Promise((resolvePromise, rejectPromise) => {
      iconProcess.on('error', rejectPromise);
      iconProcess.on('exit', (iconCode, iconSignal) => {
        if (iconSignal) rejectPromise(new Error(`Icon generation terminated by ${iconSignal}`));
        else if ((iconCode ?? 1) !== 0) rejectPromise(new Error(`Icon generation exited with ${iconCode}`));
        else resolvePromise();
      });
    });

    await copyFile('dist-web-core/web-core.html', 'dist-web-core/index.html');
    console.log('Web Core Pages entry created: dist-web-core/index.html');
  } catch (error) {
    console.error(`Unable to finalize Web Core artifact: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
});
