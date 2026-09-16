import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPreviewServer } from './local-server.js';
import { setupIpc } from './ipc.js';
import { loadWindowState, trackWindowState } from './window-state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

async function createWindow() {
  // ローカルプレビューサーバー起動
  await localPreviewServer.start();

  // 前回のウィンドウ位置・サイズを復元
  const windowState = loadWindowState();

  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, '../../assets/icon.ico')
    : path.join(__dirname, '../../assets/icon.png');

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: windowState.minWidth,
    minHeight: windowState.minHeight,
    title: 'Hisa HTML Editor',
    icon: iconPath,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // 前回復了時に最大化されていた場合は最大化
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // 位置・サイズの変更および終了時の保存を追跡
  trackWindowState(mainWindow);

  setupIpc(mainWindow);
  setupMenu(mainWindow);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    // 開発時はDevToolsを開く
    // mainWindow.webContents.openDevTools();
  } else {
    const distPath = path.join(__dirname, '../../dist/index.html');
    await mainWindow.loadFile(distPath);
  }

  // 外部ファイル等のドロップによる予期せぬ画面遷移をブロック
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (devUrl && url.startsWith(devUrl)) return;
    if (url.includes('dist/index.html')) return;
    event.preventDefault();
  });

  // リンククリック等による別ウィンドウ生成を抑制
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.platform !== 'darwin') {
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  }
}

function setupMenu(win) {
  const isMac = process.platform === 'darwin';

  const sendAction = (action, focusedWindow) => {
    const targetWin = focusedWindow || win || BrowserWindow.getFocusedWindow();
    if (targetWin && targetWin.webContents) {
      targetWin.webContents.send('menu:action', action);
    }
  };

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'ファイル (&F)',
      submenu: [
        {
          label: '新規作成 (&N)',
          accelerator: 'CmdOrCtrl+N',
          click: (item, focusedWindow) => sendAction('newFile', focusedWindow)
        },
        {
          label: '開く... (&O)',
          accelerator: 'CmdOrCtrl+O',
          click: (item, focusedWindow) => sendAction('openFile', focusedWindow)
        },
        { type: 'separator' },
        {
          label: '上書き保存 (&S)',
          accelerator: 'CmdOrCtrl+S',
          click: (item, focusedWindow) => sendAction('saveFile', focusedWindow)
        },
        {
          label: '名前を付けて保存... (&A)',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: (item, focusedWindow) => sendAction('saveAsFile', focusedWindow)
        },
        { type: 'separator' },
        {
          label: 'ブラウザでプレビュー (&P)',
          accelerator: 'F12',
          click: (item, focusedWindow) => sendAction('browserPreview', focusedWindow)
        },
        { type: 'separator' },
        {
          label: 'タブを閉じる (&W)',
          accelerator: 'CmdOrCtrl+W',
          click: (item, focusedWindow) => sendAction('closeTab', focusedWindow)
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: '終了 (&X)' }
      ]
    },
    {
      label: '編集 (&E)',
      submenu: [
        { role: 'undo', label: '元に戻す' },
        { role: 'redo', label: 'やり直す' },
        { type: 'separator' },
        { role: 'cut', label: '切り取り' },
        { role: 'copy', label: 'コピー' },
        { role: 'paste', label: '貼り付け' },
        { role: 'selectAll', label: 'すべて選択' },
        { type: 'separator' },
        {
          label: '検索 (&F)',
          accelerator: 'CmdOrCtrl+F',
          click: (item, focusedWindow) => sendAction('find', focusedWindow)
        },
        {
          label: '置換 (&R)',
          accelerator: 'CmdOrCtrl+R',
          click: (item, focusedWindow) => sendAction('replace', focusedWindow)
        },
        {
          label: '置換 (別名) (&H)',
          accelerator: 'CmdOrCtrl+H',
          click: (item, focusedWindow) => sendAction('replace', focusedWindow)
        },
        {
          label: 'すべて置き換え (&A)',
          accelerator: 'CmdOrCtrl+Alt+Enter',
          click: (item, focusedWindow) => sendAction('replaceAll', focusedWindow)
        },
        {
          label: '複数行の検索・置換 (&M)...',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: (item, focusedWindow) => sendAction('multilineFindReplace', focusedWindow)
        },
        { type: 'separator' },
        {
          label: '対応するタグへジャンプ',
          accelerator: 'Alt+J',
          click: (item, focusedWindow) => sendAction('jumpToMatchingTag', focusedWindow)
        },
        {
          label: 'タグ整合性チェック',
          accelerator: 'F7',
          click: (item, focusedWindow) => sendAction('checkTagIntegrity', focusedWindow)
        },
        {
          label: 'タグで囲む (Wrap Tag)',
          accelerator: 'Alt+W',
          click: (item, focusedWindow) => sendAction('wrapTag', focusedWindow)
        },
        {
          label: 'CSSクイック編集 (Quick Edit)',
          accelerator: 'CmdOrCtrl+E',
          click: (item, focusedWindow) => sendAction('quickEdit', focusedWindow)
        },
        { type: 'separator' },
        {
          label: 'イメージMAPビジュアルエディター (&M)...',
          accelerator: 'Alt+M',
          click: (item, focusedWindow) => sendAction('openImageMap', focusedWindow)
        }
      ]
    },
    {
      label: '表示 (&V)',
      submenu: [
        {
          label: '左右分割 (Horizontal)',
          accelerator: 'CmdOrCtrl+1',
          click: (item, focusedWindow) => sendAction('layoutSplitH', focusedWindow)
        },
        {
          label: '上下分割 (Vertical)',
          accelerator: 'CmdOrCtrl+2',
          click: (item, focusedWindow) => sendAction('layoutSplitV', focusedWindow)
        },
        {
          label: 'エディタのみ全画面',
          accelerator: 'CmdOrCtrl+3',
          click: (item, focusedWindow) => sendAction('layoutEditorOnly', focusedWindow)
        },
        {
          label: 'プレビューのみ全画面',
          accelerator: 'CmdOrCtrl+4',
          click: (item, focusedWindow) => sendAction('layoutPreviewOnly', focusedWindow)
        },
        { type: 'separator' },
        {
          label: '再読み込み',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (item, focusedWindow) => {
            if (focusedWindow) focusedWindow.reload();
          }
        },
        { role: 'forceReload', label: '強制再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
        { type: 'separator' },
        { role: 'resetZoom', label: '実際のサイズ' },
        { role: 'zoomIn', label: '拡大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'フルスクリーン切替' }
      ]
    },
    {
      label: 'ヘルプ (&H)',
      submenu: [
        {
          label: 'ショートカットキー一覧 (&K)...',
          accelerator: 'F1',
          click: (item, focusedWindow) => sendAction('showShortcuts', focusedWindow)
        },
        { type: 'separator' },
        {
          label: 'Hisa HTML Editor について',
          click: (item, focusedWindow) => {
            const targetWin = focusedWindow || win || mainWindow;
            dialog.showMessageBox(targetWin, {
              type: 'info',
              title: 'Hisa HTML Editor について',
              message: `Hisa HTML Editor v${app.getVersion()}`,
              detail: `バージョン: ${app.getVersion()} (Update 12)\nElectron: ${process.versions.electron}\nChromium: ${process.versions.chrome}\nNode.js: ${process.versions.node}\n\nDreamweaver代替のマルチタブHTMLエディタ\n© 2026 Hisa`,
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // HTML側メニューバーからのポップアップ表示用
  const fileMenuItem = template.find((i) => i.label && i.label.includes('ファイル'));
  const editMenuItem = template.find((i) => i.label && i.label.includes('編集'));
  const viewMenuItem = template.find((i) => i.label && i.label.includes('表示'));
  const helpMenuItem = template.find((i) => i.label && i.label.includes('ヘルプ'));

  const menuMap = {
    file: fileMenuItem?.submenu ? Menu.buildFromTemplate(fileMenuItem.submenu) : null,
    edit: editMenuItem?.submenu ? Menu.buildFromTemplate(editMenuItem.submenu) : null,
    view: viewMenuItem?.submenu ? Menu.buildFromTemplate(viewMenuItem.submenu) : null,
    help: helpMenuItem?.submenu ? Menu.buildFromTemplate(helpMenuItem.submenu) : null
  };

  ipcMain.removeHandler('menu:popup');
  ipcMain.handle('menu:popup', (event, { menuType, x, y }) => {
    const targetSubmenu = menuMap[menuType];
    const targetWin = win || mainWindow;
    if (targetSubmenu && targetWin && !targetWin.isDestroyed()) {
      targetSubmenu.popup({
        window: targetWin,
        x: Math.round(x),
        y: Math.round(y)
      });
      return true;
    }
    return false;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  localPreviewServer.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
