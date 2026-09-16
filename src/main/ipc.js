import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mime from 'mime-types';
import { localPreviewServer } from './local-server.js';
import { readFileWithAutoEncoding, writeFileWithEncoding } from './encoding-helper.js';
import { openImageMapWindow, getImageMapInitData, getImageMapWindow } from './image-map-window.js';

let isFileDialogOpen = false;

// ネットワークドライブ等の遅延でダイアログ起動がフリーズしないよう高速検証
async function fastCheckDir(dirPath, timeoutMs = 150) {
  if (!dirPath || typeof dirPath !== 'string') return null;
  try {
    const checkPromise = fs.stat(dirPath);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs));
    const stat = await Promise.race([checkPromise, timeoutPromise]);
    return stat.isDirectory() ? dirPath : null;
  } catch {
    return null;
  }
}

export function setupIpc(mainWindow) {
  // ファイルを開く
  ipcMain.handle('dialog:openFile', async (event) => {
    if (isFileDialogOpen) {
      console.log('[IPC] dialog:openFile already open, ignoring duplicate call');
      return null;
    }
    isFileDialogOpen = true;

    try {
      const options = {
        title: 'HTMLファイルを開く',
        filters: [
          { name: 'HTML Files', extensions: ['html', 'htm', 'xhtml'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      };

      // 直近のプロジェクト/ドキュメントディレクトリを高速検証してセット
      if (localPreviewServer.rootDir) {
        const checkedDir = await fastCheckDir(localPreviewServer.rootDir, 150);
        if (checkedDir) {
          options.defaultPath = checkedDir;
        }
      }

      // 親ウィンドウを指定しないことで、Windowsネイティブメッセージループの同期フリーズを防止
      const result = await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const { content, encoding } = await readFileWithAutoEncoding(filePath);
      const dir = path.dirname(filePath);
      const fileName = path.basename(filePath);

      localPreviewServer.setRootDir(dir);

      console.log(`[IPC] File opened: ${fileName} (Detected encoding: ${encoding})`);

      return {
        success: true,
        filePath,
        fileName,
        dir,
        content,
        encoding
      };
    } catch (err) {
      console.error('[IPC] dialog:openFile error:', err);
      return { success: false, error: err.message };
    } finally {
      isFileDialogOpen = false;
    }
  });

  // パス指定でファイルを開く (ドラッグ&ドロップ用)
  ipcMain.handle('file:openPath', async (event, filePath) => {
    try {
      const { content, encoding } = await readFileWithAutoEncoding(filePath);
      const dir = path.dirname(filePath);
      const fileName = path.basename(filePath);

      localPreviewServer.setRootDir(dir);

      console.log(`[IPC] File opened by path: ${fileName} (${encoding})`);

      return {
        success: true,
        filePath,
        fileName,
        dir,
        content,
        encoding
      };
    } catch (err) {
      console.error('[IPC] file:openPath error:', err);
      return { success: false, error: err.message };
    }
  });

  // 名前を付けて保存
  ipcMain.handle('dialog:saveFile', async (event, defaultName) => {
    try {
      const safeDefaultName = defaultName || 'index.html';
      let defaultPath = safeDefaultName;

      if (localPreviewServer.rootDir) {
        const checkedDir = await fastCheckDir(localPreviewServer.rootDir, 150);
        if (checkedDir) {
          defaultPath = path.join(checkedDir, safeDefaultName);
        }
      }

      const options = {
        title: 'HTMLファイルを保存',
        defaultPath,
        filters: [
          { name: 'HTML Files', extensions: ['html', 'htm', 'xhtml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      };

      const result = await dialog.showSaveDialog(options);

      if (result.canceled || !result.filePath) {
        return null;
      }

      const filePath = result.filePath;
      const dir = path.dirname(filePath);
      const fileName = path.basename(filePath);

      localPreviewServer.setRootDir(dir);

      return {
        success: true,
        filePath,
        fileName,
        dir
      };
    } catch (err) {
      console.error('[IPC] dialog:saveFile error:', err);
      return { success: false, error: err.message };
    }
  });

  // ファイル直接読み込み
  ipcMain.handle('file:read', async (event, targetPath) => {
    try {
      let resolved = targetPath;
      if (localPreviewServer.rootDir && !path.isAbsolute(targetPath)) {
        resolved = path.resolve(localPreviewServer.rootDir, targetPath);
      }
      const { content, encoding } = await readFileWithAutoEncoding(resolved);
      return { success: true, content, encoding };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ファイル直接書き込み
  ipcMain.handle('file:write', async (event, { filePath, content, encoding }) => {
    try {
      await writeFileWithEncoding(filePath, content, encoding);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // プレビュー用サーバー情報の取得
  ipcMain.handle('server:getInfo', () => {
    return {
      port: localPreviewServer.port,
      rootDir: localPreviewServer.rootDir
    };
  });

  // プレビューのリアルタイムコンテンツ更新
  ipcMain.handle('server:updateLiveContent', (event, html) => {
    localPreviewServer.setLiveContent(html);
    return true;
  });

  // プロジェクトルートディレクトリの設定
  ipcMain.handle('server:setRootDir', (event, dirPath) => {
    localPreviewServer.setRootDir(dirPath);
    return true;
  });

  // 画像サムネイル・情報取得
  ipcMain.handle('image:getInfo', async (event, imagePath, baseDir) => {
    try {
      if (!imagePath || typeof imagePath !== 'string') {
        return { exists: false };
      }

      // クエリ文字列やハッシュの除去 (例: banner.jpg?v=1)
      let cleanPath = imagePath.trim().split('?')[0].split('#')[0];
      let resolvedPath = cleanPath;

      if (cleanPath.startsWith('file://')) {
        try {
          resolvedPath = fileURLToPath(cleanPath);
        } catch {
          resolvedPath = cleanPath.replace(/^file:\/\/\/?/, '');
        }
      } else if (!path.isAbsolute(cleanPath)) {
        const root = baseDir || localPreviewServer.rootDir || process.cwd();
        resolvedPath = path.resolve(root, cleanPath);
      }

      let stat;
      try {
        stat = await fs.stat(resolvedPath);
      } catch {
        // 見つからない場合、baseDir が渡されていて localPreviewServer.rootDir もあるならそちらも試行
        if (localPreviewServer.rootDir && resolvedPath !== path.resolve(localPreviewServer.rootDir, cleanPath)) {
          try {
            resolvedPath = path.resolve(localPreviewServer.rootDir, cleanPath);
            stat = await fs.stat(resolvedPath);
          } catch {
            return { exists: false };
          }
        } else {
          return { exists: false };
        }
      }

      if (!stat.isFile()) {
        return { exists: false };
      }

      const mimeType = mime.lookup(resolvedPath) || 'image/png';
      if (!mimeType.startsWith('image/')) {
        return { exists: false };
      }

      const buffer = await fs.readFile(resolvedPath);
      const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

      return {
        exists: true,
        dataUri,
        sizeBytes: stat.size,
        fileName: path.basename(resolvedPath),
        resolvedPath
      };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  // --- イメージMAPビジュアルエディター連携 ---
  // ウィンドウを開く
  ipcMain.handle('image-map:open', async (event, data) => {
    await openImageMapWindow(data);
    return true;
  });

  // 初期データ取得
  ipcMain.handle('image-map:get-init-data', () => {
    return getImageMapInitData();
  });

  // 画像ファイル選択ダイアログ
  ipcMain.handle('image-map:select-image', async (event) => {
    try {
      const options = {
        title: 'イメージマップ用画像を選択',
        filters: [
          { name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
          { name: 'すべてのファイル', extensions: ['*'] }
        ],
        properties: ['openFile']
      };

      if (localPreviewServer.rootDir) {
        const checkedDir = await fastCheckDir(localPreviewServer.rootDir, 150);
        if (checkedDir) options.defaultPath = checkedDir;
      }

      const win = getImageMapWindow() || mainWindow;
      const result = await dialog.showOpenDialog(win, options);
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      const filePath = result.filePaths[0];
      const mimeType = mime.lookup(filePath) || 'image/png';
      const buffer = await fs.readFile(filePath);
      const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;

      // プロジェクトルートからの相対パスを計算（もし可能なら）
      let relativePath = path.basename(filePath);
      if (localPreviewServer.rootDir) {
        const rel = path.relative(localPreviewServer.rootDir, filePath).replace(/\\/g, '/');
        if (!rel.startsWith('..')) {
          relativePath = rel;
        }
      }

      return {
        filePath,
        fileName: path.basename(filePath),
        relativePath,
        dataUri
      };
    } catch (err) {
      console.error('[IPC] image-map:select-image error:', err);
      return null;
    }
  });

  // エディタへのHTMLコード挿入
  ipcMain.handle('image-map:insert-code', (event, code) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('image-map:do-insert', code);
      mainWindow.focus();
      return true;
    }
    return false;
  });

  // エディタの既存HTMLコード（MAPタグ）更新
  ipcMain.handle('image-map:update-code', (event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('image-map:do-update', data);
      mainWindow.focus();
      return true;
    }
    return false;
  });

  // --- 外部ブラウザプレビュー機能 ---
  // ブラウザで開く
  ipcMain.handle('preview:openInBrowser', async (event, { filePath, browserPath }) => {
    try {
      let targetUrl = '';
      if (filePath) {
        if (localPreviewServer.rootDir && localPreviewServer.port) {
          const rel = path.relative(localPreviewServer.rootDir, filePath).replace(/\\/g, '/');
          if (!rel.startsWith('..')) {
            targetUrl = `http://127.0.0.1:${localPreviewServer.port}/${encodeURI(rel)}`;
          }
        }
        if (!targetUrl) {
          targetUrl = pathToFileURL(filePath).href;
        }
      } else {
        // 未保存などの場合はライブプレビューURL
        targetUrl = `http://127.0.0.1:${localPreviewServer.port}/__preview_live.html`;
      }

      if (browserPath && browserPath.trim()) {
        const cleanPath = browserPath.trim();
        if (process.platform === 'darwin' && cleanPath.endsWith('.app')) {
          spawn('open', ['-a', cleanPath, targetUrl], { detached: true, stdio: 'ignore' }).unref();
        } else {
          spawn(cleanPath, [targetUrl], { detached: true, stdio: 'ignore' }).unref();
        }
      } else {
        await shell.openExternal(targetUrl);
      }
      return { success: true, url: targetUrl };
    } catch (err) {
      console.error('[IPC] preview:openInBrowser error:', err);
      return { success: false, error: err.message };
    }
  });

  // インストール済みブラウザの自動検出
  ipcMain.handle('browser:detectInstalled', async () => {
    const detected = [];
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';

    if (isWin) {
      const candidates = [
        {
          name: 'Google Chrome',
          paths: [
            path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
            path.join(process.env['LOCALAPPDATA'] || '', 'Google\\Chrome\\Application\\chrome.exe')
          ]
        },
        {
          name: 'Microsoft Edge',
          paths: [
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
            path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe')
          ]
        },
        {
          name: 'Mozilla Firefox',
          paths: [
            path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Mozilla Firefox\\firefox.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox\\firefox.exe'),
            path.join(process.env['LOCALAPPDATA'] || '', 'Mozilla Firefox\\firefox.exe')
          ]
        },
        {
          name: 'Brave',
          paths: [
            path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
            path.join(process.env['LOCALAPPDATA'] || '', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe')
          ]
        },
        {
          name: 'Vivaldi',
          paths: [
            path.join(process.env['LOCALAPPDATA'] || '', 'Vivaldi\\Application\\vivaldi.exe'),
            path.join(process.env['PROGRAMFILES'] || 'C:\\Program Files', 'Vivaldi\\Application\\vivaldi.exe')
          ]
        }
      ];

      for (const item of candidates) {
        for (const p of item.paths) {
          if (p && fsSync.existsSync(p)) {
            detected.push({
              id: item.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              name: item.name,
              path: p
            });
            break;
          }
        }
      }
    } else if (isMac) {
      const macCandidates = [
        { name: 'Google Chrome', path: '/Applications/Google Chrome.app' },
        { name: 'Mozilla Firefox', path: '/Applications/Firefox.app' },
        { name: 'Safari', path: '/Applications/Safari.app' },
        { name: 'Microsoft Edge', path: '/Applications/Microsoft Edge.app' },
        { name: 'Brave Browser', path: '/Applications/Brave Browser.app' }
      ];
      for (const item of macCandidates) {
        if (fsSync.existsSync(item.path)) {
          detected.push({
            id: item.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: item.name,
            path: item.path
          });
        }
      }
    }

    return detected;
  });

  // ブラウザ実行ファイル選択ダイアログ
  ipcMain.handle('dialog:selectBrowserExe', async () => {
    try {
      const isWin = process.platform === 'win32';
      const options = {
        title: 'ブラウザ実行ファイルを選択',
        filters: isWin
          ? [
              { name: '実行ファイル (*.exe)', extensions: ['exe'] },
              { name: 'すべてのファイル', extensions: ['*'] }
            ]
          : [
              { name: 'アプリケーション (*.app)', extensions: ['app'] },
              { name: 'すべてのファイル', extensions: ['*'] }
            ],
        properties: ['openFile']
      };

      const result = await dialog.showOpenDialog(mainWindow, options);
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    } catch (err) {
      console.error('[IPC] dialog:selectBrowserExe error:', err);
      return null;
    }
  });
}
