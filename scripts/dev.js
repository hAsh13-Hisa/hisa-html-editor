import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function startDev() {
  // 1. Vite開発サーバー起動
  const viteServer = await createServer({
    configFile: path.resolve(rootDir, 'vite.config.js'),
    mode: 'development'
  });
  await viteServer.listen();
  const address = viteServer.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const devUrl = `http://localhost:${port}`;
  console.log(`[Vite] Server started at ${devUrl}`);

  // 2. Electron起動
  const env = { ...process.env, VITE_DEV_SERVER_URL: devUrl };
  const electronProcess = spawn(electron, ['.'], {
    cwd: rootDir,
    env,
    stdio: 'inherit'
  });

  electronProcess.on('close', () => {
    viteServer.close();
    process.exit();
  });
}

startDev().catch((err) => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
