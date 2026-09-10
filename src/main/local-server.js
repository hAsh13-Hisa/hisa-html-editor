import http from 'node:http';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mime from 'mime-types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class LocalPreviewServer {
  constructor() {
    this.server = null;
    this.port = 0;
    this.rootDir = null;
    this.liveContent = '';
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          console.error('[LocalServer] Unhandled request error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
            res.end('Internal Server Error');
          }
        });
      });

      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server.address();
        this.port = typeof address === 'object' && address ? address.port : 0;
        console.log(`[LocalServer] Preview server running on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });

      this.server.on('error', (err) => {
        console.error('[LocalServer] Error:', err);
        reject(err);
      });
    });
  }

  setRootDir(dirPath) {
    this.rootDir = dirPath;
  }

  setLiveContent(content) {
    this.liveContent = content;
  }

  async handleRequest(req, res) {
    // CORSヘッダー
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      const parsedUrl = new URL(req.url, `http://127.0.0.1:${this.port}`);
      let pathname = decodeURIComponent(parsedUrl.pathname);

      // 動的ライブプレビュー配信エンドポイント
      if (pathname === '/__preview_live.html') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(this.liveContent || '<!DOCTYPE html><html><body></body></html>');
        return;
      }

      // preview-bridge.js 配信エンドポイント
      if (pathname === '/__preview_bridge.js' || pathname === '/preview-bridge.js') {
        const bridgeCandidates = [
          path.resolve(__dirname, '../../dist/preview-bridge.js'),
          path.resolve(__dirname, '../renderer/preview-bridge.js'),
          path.resolve(__dirname, '../renderer/public/preview-bridge.js')
        ];
        for (const bridgePath of bridgeCandidates) {
          try {
            await fsPromises.access(bridgePath);
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=UTF-8',
              'Cache-Control': 'no-cache'
            });
            fs.createReadStream(bridgePath).pipe(res);
            return;
          } catch {
            // continue to next candidate
          }
        }
      }

      // 静的ファイル配信
      if (!this.rootDir) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('No project root configured');
        return;
      }

      // ディレクトリトラバーサル防止
      let safePath = path.normalize(path.join(this.rootDir, pathname));
      if (!safePath.startsWith(path.resolve(this.rootDir))) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Access Denied');
        return;
      }

      // 非同期statでディレクトリ・ファイルの存在確認
      let stat;
      try {
        stat = await fsPromises.stat(safePath);
        if (stat.isDirectory()) {
          safePath = path.join(safePath, 'index.html');
          stat = await fsPromises.stat(safePath);
        }
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Not Found');
        return;
      }

      if (!stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Not Found');
        return;
      }

      const mimeType = mime.lookup(safePath) || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache'
      });

      const stream = fs.createReadStream(safePath);
      stream.pipe(res);
    } catch (err) {
      console.error('[LocalServer] Request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('Internal Server Error');
      }
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

export const localPreviewServer = new LocalPreviewServer();
