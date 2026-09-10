import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distPackageDir = path.join(rootDir, 'dist-package');
const unpackedDir = path.join(distPackageDir, 'win-unpacked');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '2.2.0';
const zipFile = path.join(distPackageDir, `Hisa-HTML-Editor-${version}-win-portable.zip`);

console.log(`[Zip] Creating portable zip archive (${version})...`);

if (!fs.existsSync(unpackedDir)) {
  console.error('[Zip] win-unpacked directory does not exist:', unpackedDir);
  process.exit(1);
}

if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

// 7za.exe または PowerShell Compress-Archive を利用
const sevenZipPath = path.join(rootDir, 'node_modules/7zip-bin/win/x64/7za.exe');

if (fs.existsSync(sevenZipPath)) {
  console.log('[Zip] Using 7za for ultra-fast compression...');
  execSync(`"${sevenZipPath}" a -tzip "${zipFile}" "${unpackedDir}\\*" -mx=5`, { stdio: 'inherit' });
} else {
  console.log('[Zip] Using PowerShell Compress-Archive...');
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${unpackedDir}/*' -DestinationPath '${zipFile}' -Force"`, { stdio: 'inherit' });
}

console.log('[Zip] Portable zip successfully created at:', zipFile);
