import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0] === 'dev' ? 'vite' : 'vite';
const commandArgs = args[0] === 'dev'
  ? ['--config', 'vite.web-core.config.js']
  : ['build', '--config', 'vite.web-core.config.js'];

const child = spawn(command, commandArgs, { stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
