import { readFileWithAutoEncoding, writeFileWithEncoding } from '../src/main/encoding-helper.js';
import Encoding from 'encoding-japanese';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.resolve(__dirname, '../test-temp');

async function testEncoding() {
  await fs.mkdir(testDir, { recursive: true });

  console.log('[Test] Testing Encoding Detection and Conversion...');

  // 1. EUC-JP テストファイル作成
  const eucHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="EUC-JP">
  <title>EUC-JPテスト</title>
</head>
<body>
  <h1>これはEUC-JPの漢字テストです。</h1>
  <p>吾輩は猫である。名前はまだ無い。</p>
</body>
</html>`;

  const eucPath = path.join(testDir, 'test-euc.html');
  const eucCode = Encoding.stringToCode(eucHtml);
  const eucArray = Encoding.convert(eucCode, { to: 'EUCJP', from: 'UNICODE' });
  await fs.writeFile(eucPath, Buffer.from(eucArray));

  // 読み込みテスト
  const readEuc = await readFileWithAutoEncoding(eucPath);
  console.log('EUC-JP Detected:', readEuc.encoding);
  if (readEuc.content.includes('これはEUC-JPの漢字テストです。') && readEuc.encoding === 'EUCJP') {
    console.log('✓ EUC-JP read passed!');
  } else {
    throw new Error('EUC-JP read failed: ' + readEuc.content);
  }

  // 2. Shift_JIS テストファイル作成
  const sjisHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="Shift_JIS">
  <title>Shift_JISテスト</title>
</head>
<body>
  <h1>これはShift_JISの漢字テストです。</h1>
  <p>国境の長いトンネルを抜けると雪国であった。</p>
</body>
</html>`;

  const sjisPath = path.join(testDir, 'test-sjis.html');
  const sjisCode = Encoding.stringToCode(sjisHtml);
  const sjisArray = Encoding.convert(sjisCode, { to: 'SJIS', from: 'UNICODE' });
  await fs.writeFile(sjisPath, Buffer.from(sjisArray));

  // 読み込みテスト
  const readSjis = await readFileWithAutoEncoding(sjisPath);
  console.log('Shift_JIS Detected:', readSjis.encoding);
  if (readSjis.content.includes('これはShift_JISの漢字テストです。') && readSjis.encoding === 'SJIS') {
    console.log('✓ Shift_JIS read passed!');
  } else {
    throw new Error('Shift_JIS read failed: ' + readSjis.content);
  }

  // 3. 書き込みテスト（EUC-JPで保存）
  const modifiedEuc = readEuc.content.replace('吾輩は猫である', '我輩は虎である');
  await writeFileWithEncoding(eucPath, modifiedEuc, 'EUCJP');
  const reReadEuc = await readFileWithAutoEncoding(eucPath);
  if (reReadEuc.content.includes('我輩は虎である') && reReadEuc.encoding === 'EUCJP') {
    console.log('✓ EUC-JP write and re-read passed!');
  } else {
    throw new Error('EUC-JP write failed');
  }

  // クリーンアップ
  await fs.rm(testDir, { recursive: true, force: true });
  console.log('[Test] ALL ENCODING TESTS PASSED!');
}

testEncoding().catch((err) => {
  console.error('[Test] FAILED:', err);
  process.exit(1);
});
