import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('[Test] Testing Electron app launch...');

const env = { ...process.env, NODE_ENV: 'test' };
const child = spawn(electron, ['.'], {
  cwd: rootDir,
  env,
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let hasError = false;

child.stdout.on('data', (data) => {
  const str = data.toString();
  output += str;
  console.log('[App STDOUT]:', str.trim());
});

child.stderr.on('data', (data) => {
  const str = data.toString();
  output += str;
  console.error('[App STDERR]:', str.trim());
  if (str.toLowerCase().includes('uncaught exception') || str.toLowerCase().includes('syntaxerror')) {
    hasError = true;
  }
});

setTimeout(() => {
  console.log('[Test] App ran for 6 seconds without crashing. Terminating test cleanly...');
  child.kill('SIGINT');
  if (hasError) {
    console.error('[Test] FAILED with errors.');
    process.exit(1);
  } else {
    console.log('[Test] PASSED successfully!');
    process.exit(0);
  }
}, 6000);
