import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, [cliPath, 'watch', 'src/server.ts'], {
  cwd,
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
  stdio: 'inherit'
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
