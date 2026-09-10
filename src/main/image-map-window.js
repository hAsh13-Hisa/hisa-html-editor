import { BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let imageMapWindow = null;
let currentInitData = null;

export function getImageMapInitData() {
  return currentInitData;
}

export async function openImageMapWindow(initData = null) {
  if (initData) {
    currentInitData = initData;
  }

  if (imageMapWindow && !imageMapWindow.isDestroyed()) {
    imageMapWindow.focus();
    if (initData) {
      imageMapWindow.webContents.send('image-map:load-data', initData);
    }
    return imageMapWindow;
  }

  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../assets/icon.ico')
    : path.join(__dirname, '../../assets/icon.png');

  imageMapWindow = new BrowserWindow({
    width: 1040,
    height: 740,
    minWidth: 800,
    minHeight: 560,
    title: 'イメージMAPビジュアルエディター',
    icon: iconPath,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  imageMapWindow.setMenu(null); // ミニツール専用ウィンドウなので標準メニューバーは非表示（ツールバー内に完備）

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const url = `${devUrl}/image-map.html`;
    await imageMapWindow.loadURL(url);
  } else {
    const distPath = path.join(__dirname, '../../dist/image-map.html');
    await imageMapWindow.loadFile(distPath);
  }

  imageMapWindow.on('closed', () => {
    imageMapWindow = null;
  });

  return imageMapWindow;
}

export function getImageMapWindow() {
  return imageMapWindow;
}
