import { app, dialog, ipcMain } from 'electron';
import updaterPkg from 'electron-updater';
const { autoUpdater } = updaterPkg;

let isManualCheck = false;
let parentWindow = null;

export function setupAutoUpdater(win) {
  parentWindow = win;

  // 基本設定
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // ログ設定（開発・デバッグ用）
  autoUpdater.logger = {
    info: (...args) => console.log('[Updater]', ...args),
    warn: (...args) => console.warn('[Updater]', ...args),
    error: (...args) => console.error('[Updater]', ...args),
    debug: (...args) => console.debug('[Updater]', ...args)
  };

  // 1. 更新確認開始
  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for updates...');
  });

  // 2. 更新あり
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (isManualCheck && parentWindow && !parentWindow.isDestroyed()) {
      dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: 'アップデートが見つかりました',
        message: `新しいバージョン (v${info.version}) が見つかりました。`,
        detail: 'バックグラウンドでダウンロードを開始しました。完了次第、再起動のご案内を表示します。',
        buttons: ['OK']
      });
    }
  });

  // 3. 更新なし（最新）
  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Current version is up to date.');
    if (isManualCheck && parentWindow && !parentWindow.isDestroyed()) {
      dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: '最新バージョンです',
        message: `Hisa HTML Editor は最新です (v${app.getVersion()})。`,
        detail: 'ご利用中のバージョンは最新版です。',
        buttons: ['OK']
      });
      isManualCheck = false;
    }
  });

  // 4. ダウンロード進捗
  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0);
    console.log(`[Updater] Downloading update: ${percent}%`);
  });

  // 5. ダウンロード完了（適用準備完了）
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    isManualCheck = false;

    const targetWin = parentWindow && !parentWindow.isDestroyed() ? parentWindow : null;
    dialog.showMessageBox(targetWin, {
      type: 'question',
      title: 'アップデートの準備完了',
      message: `Hisa HTML Editor v${info.version} のダウンロードが完了しました。`,
      detail: '今すぐアプリを再起動してアップデートを適用しますか？\n（「後で」を選んだ場合は、次回アプリ終了時に自動適用されます）',
      buttons: ['今すぐ再起動して適用', '後で'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        setImmediate(() => {
          autoUpdater.quitAndInstall(false, true);
        });
      }
    });
  });

  // 6. エラー発生
  autoUpdater.on('error', (err) => {
    console.error('[Updater] Update error:', err);
    if (isManualCheck && parentWindow && !parentWindow.isDestroyed()) {
      dialog.showMessageBox(parentWindow, {
        type: 'warning',
        title: '更新の確認エラー',
        message: 'アップデートの確認中にエラーが発生しました。',
        detail: `ネットワーク接続をご確認いただくか、GitHubリポジトリをご確認ください。\n\n詳細: ${err.message || err}`,
        buttons: ['OK']
      });
      isManualCheck = false;
    }
  });

  // 手動更新チェック用 IPC ハンドラー
  ipcMain.removeHandler('updater:check');
  ipcMain.handle('updater:check', async () => {
    return checkForUpdates(true);
  });

  // パッケージ済み（本番実行時）の場合、起動後3秒後に自動チェック
  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdates(false);
    }, 3500);
  }
}

/**
 * 更新チェックを実行
 * @param {boolean} manual 手動クリックによる実行かどうか
 */
export function checkForUpdates(manual = false) {
  isManualCheck = manual;

  if (!app.isPackaged) {
    console.log('[Updater] App is not packaged. Skipping live update check.');
    if (manual && parentWindow && !parentWindow.isDestroyed()) {
      dialog.showMessageBox(parentWindow, {
        type: 'info',
        title: '更新チェック（開発環境）',
        message: '開発環境で実行中です。',
        detail: '自動アップデート機能は、パッケージ化（ビルド）されたアプリでのみ動作します。\n\n現在のバージョン: v' + app.getVersion(),
        buttons: ['OK']
      });
    }
    return Promise.resolve(null);
  }

  return autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] Failed to check for updates:', err);
  });
}
