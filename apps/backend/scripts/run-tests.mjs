import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const testDirectory = fileURLToPath(new URL('../src/tests/', import.meta.url));
const testFiles = readdirSync(testDirectory)
  .filter(file => file.endsWith('.test.ts'))
  .map(file => `src/tests/${file}`);

const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
  cwd,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: 'bokken_test_only_jwt_secret_for_unit_tests_2026'
  },
  stdio: 'inherit'
});

process.exitCode = result.status ?? 1;
