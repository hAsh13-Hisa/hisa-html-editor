import fs from 'node:fs/promises';
import Encoding from 'encoding-japanese';

/**
 * 日本語文字コード（UTF-8, Shift_JIS, EUC-JP 等）を自動判定してファイルを読み込む
 */
export async function readFileWithAutoEncoding(filePath) {
  const buffer = await fs.readFile(filePath);

  // 1. encoding-japanese によるバイナリ自動判定
  let detected = Encoding.detect(buffer);

  // 2. HTMLのメタタグ（meta charset）からのヒント抽出
  // （ASCII範囲の英数字からmetaタグを簡易スキャン）
  const asciiSnippet = buffer.slice(0, Math.min(buffer.length, 2048)).toString('binary');
  const metaCharsetMatch = asciiSnippet.match(/<meta\b[^>]*charset=["']?([a-zA-Z0-9_-]+)["']?/i) ||
                           asciiSnippet.match(/content=["'][^"']*charset=([a-zA-Z0-9_-]+)["']/i);

  if (metaCharsetMatch) {
    const metaEnc = metaCharsetMatch[1].toUpperCase().replace(/-/g, '');
    if (metaEnc.includes('EUC') || metaEnc === 'EUCJP') {
      detected = 'EUCJP';
    } else if (metaEnc.includes('SJIS') || metaEnc.includes('SHIFTJIS') || metaEnc === 'CP932' || metaEnc === 'WINDOWS31J') {
      detected = 'SJIS';
    } else if (metaEnc.includes('UTF8')) {
      detected = 'UTF8';
    }
  }

  // 判定できなかった場合やASCIIの場合はUTF8をデフォルトに
  if (!detected || detected === 'ASCII') {
    detected = 'UTF8';
  }

  // Unicode文字列にデコード
  let content = '';
  if (detected === 'UTF8' || detected === 'UNICODE') {
    content = buffer.toString('utf-8');
  } else {
    const unicodeArray = Encoding.convert(buffer, {
      to: 'UNICODE',
      from: detected
    });
    content = Encoding.codeToString(unicodeArray);
  }

  return {
    content,
    encoding: detected // 'UTF8', 'SJIS', 'EUCJP' など
  };
}

/**
 * 指定エンコーディングでファイルを書き込む
 */
export async function writeFileWithEncoding(filePath, content, encoding = 'UTF8') {
  const targetEnc = (encoding || 'UTF8').toUpperCase();

  if (targetEnc === 'UTF8' || targetEnc === 'UTF-8' || targetEnc === 'UNICODE') {
    await fs.writeFile(filePath, content, 'utf-8');
    return;
  }

  // Shift_JIS または EUC-JP へ変換
  const unicodeArray = Encoding.stringToCode(content);
  const encodedArray = Encoding.convert(unicodeArray, {
    to: targetEnc,
    from: 'UNICODE'
  });

  const buffer = Buffer.from(encodedArray);
  await fs.writeFile(filePath, buffer);
}
