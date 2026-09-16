const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ファイルダイアログ
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),

  // ファイル読み書き・パス指定オープン・D&Dパス取得
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openFilePath: (filePath) => ipcRenderer.invoke('file:openPath', filePath),
  readFile: (targetPath) => ipcRenderer.invoke('file:read', targetPath),
  writeFile: (filePath, content, encoding) => ipcRenderer.invoke('file:write', { filePath, content, encoding }),

  // サーバー・プレビュー制御
  getServerInfo: () => ipcRenderer.invoke('server:getInfo'),
  updateLiveContent: (html) => ipcRenderer.invoke('server:updateLiveContent', html),
  setRootDir: (dirPath) => ipcRenderer.invoke('server:setRootDir', dirPath),

  // 画像情報・サムネイル
  getImageInfo: (imagePath, baseDir) => ipcRenderer.invoke('image:getInfo', imagePath, baseDir),

  // メインメニューからのアクション受信
  onMenuAction: (callback) => {
    const handler = (event, action) => callback(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },

  // イメージMAPビジュアルエディター連携
  openImageMap: (data) => ipcRenderer.invoke('image-map:open', data),
  getImageMapInitData: () => ipcRenderer.invoke('image-map:get-init-data'),
  selectImageFile: () => ipcRenderer.invoke('image-map:select-image'),
  insertImageMapCode: (code) => ipcRenderer.invoke('image-map:insert-code', code),
  updateImageMapCode: (data) => ipcRenderer.invoke('image-map:update-code', data),
  onInsertImageMapCode: (callback) => {
    const handler = (event, code) => callback(code);
    ipcRenderer.on('image-map:do-insert', handler);
    return () => ipcRenderer.removeListener('image-map:do-insert', handler);
  },
  onUpdateImageMapCode: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('image-map:do-update', handler);
    return () => ipcRenderer.removeListener('image-map:do-update', handler);
  },
  onLoadImageMapData: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('image-map:load-data', handler);
    return () => ipcRenderer.removeListener('image-map:load-data', handler);
  },

  // 外部ブラウザプレビュー
  openInBrowser: (options) => ipcRenderer.invoke('preview:openInBrowser', options),
  detectInstalledBrowsers: () => ipcRenderer.invoke('browser:detectInstalled'),
  selectBrowserExe: () => ipcRenderer.invoke('dialog:selectBrowserExe'),

  // アプリケーションメニューポップアップ (HTMLメニューバー用)
  popupMenu: (menuType, rect) => ipcRenderer.invoke('menu:popup', { menuType, x: rect.x, y: rect.y })
});
