import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// 開発用のテストスクリプト：イメージMAPウィンドウを直接開いて検証
const testMainScript = `
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openImageMapWindow } from '../src/main/image-map-window.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  console.log('[Test Image Map] Launching image map window...');
  try {
    const win = await openImageMapWindow();
    console.log('[Test Image Map] Window opened successfully. URL:', win.webContents.getURL());
    setTimeout(() => {
      console.log('[Test Image Map] Test completed successfully.');
      app.quit();
    }, 4000);
  } catch (err) {
    console.error('[Test Image Map] Error opening window:', err);
    process.exit(1);
  }
});
`;

const tempScriptPath = path.join(rootDir, 'scripts/temp-test-image-map.js');
fs.writeFileSync(tempScriptPath, testMainScript, 'utf-8');

console.log('[Test] Running image-map window launch test with electron...');

const child = spawn(electron, [tempScriptPath], {
  cwd: rootDir,
  stdio: 'inherit'
});

child.on('close', (code) => {
  try {
    fs.unlinkSync(tempScriptPath);
  } catch {}
  if (code === 0) {
    console.log('✓ Image map window launched without errors!');
    process.exit(0);
  } else {
    console.error('✗ Image map window test failed with code', code);
    process.exit(code);
  }
});
