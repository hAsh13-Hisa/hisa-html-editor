import { monaco } from '../monaco-setup.js';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif)$/i;

export function registerImagePreview() {
  monaco.languages.registerHoverProvider('html', {
    async provideHover(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);

      // 行内の src="..." や href="..." や url(...) または文字列リテラル内の画像URLを検出
      const regex = /(?:src|href)=["']([^"']+\.(?:png|jpe?g|gif|svg|webp|ico|bmp|avif)(?:\?[^"']*)?)["']|url\(["']?([^"')]+\.(?:png|jpe?g|gif|svg|webp|ico|bmp|avif)(?:\?[^"']*)?)["']?|["']([^"']+\.(?:png|jpe?g|gif|svg|webp|ico|bmp|avif)(?:\?[^"']*)?)["']/gi;

      let match;
      let targetUrl = null;
      let targetRange = null;

      while ((match = regex.exec(lineContent)) !== null) {
        const url = match[1] || match[2] || match[3];
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // カーソルがこの画像URLの範囲内にあるか
        if (position.column >= matchStart + 1 && position.column <= matchEnd + 1) {
          targetUrl = url;
          targetRange = new monaco.Range(
            position.lineNumber,
            matchStart + 1,
            position.lineNumber,
            matchEnd + 1
          );
          break;
        }
      }

      if (!targetUrl) return null;

      // 1. Web URLの場合
      if (/^https?:\/\//i.test(targetUrl)) {
        return {
          range: targetRange,
          contents: [
            { value: `**画像プレビュー** (${targetUrl})` },
            { value: `![プレビュー](${targetUrl})` }
          ]
        };
      }

      // 2. ローカル相対パスの場合（IPC経由で画像情報・DataURIを取得）
      try {
        if (window.electronAPI?.getImageInfo) {
          const info = await window.electronAPI.getImageInfo(targetUrl);
          if (info && info.exists && info.dataUri) {
            const sizeKb = (info.sizeBytes / 1024).toFixed(1);
            return {
              range: targetRange,
              contents: [
                { value: `**画像プレビュー**: \`${info.fileName}\` (${sizeKb} KB)` },
                { value: `![${info.fileName}](${info.dataUri})` }
              ]
            };
          }
        }
      } catch (err) {
        console.warn('Image preview error:', err);
      }

      return null;
    }
  });
}
