/**
 * browser-preview.js
 * 外部Webブラウザでのプレビュー機能
 * - ショートカットキー (F12: 既定ブラウザ, Alt+F12: ブラウザ選択)
 * - ツールバーボタン & ドロップダウンメニュー
 * - 未保存変更がある場合の保存確認フロー
 * - 複数ブラウザの登録・編集・削除・自動検出
 */

const STORAGE_KEY = 'hisa-browser-preview-settings';

export class BrowserPreviewManager {
  constructor(app) {
    this.app = app;
    this.settings = this.loadSettings();
    this.initUI();
  }

  loadSettings() {
    const defaults = {
      defaultBrowserId: 'system-default',
      browsers: [
        {
          id: 'system-default',
          name: 'システム既定のブラウザ',
          path: '',
          isDefault: true
        }
      ]
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed.browsers) && parsed.browsers.length > 0) {
          return { ...defaults, ...parsed };
        }
      }
    } catch (e) {
      console.warn('[BrowserPreview] Failed to load settings:', e);
    }
    return defaults;
  }

  saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('[BrowserPreview] Failed to save settings:', e);
    }
  }

  initUI() {
    this.previewBtn = document.getElementById('browserPreviewBtn');
    this.dropdownBtn = document.getElementById('browserPreviewDropdownBtn');
    this.dropdownMenu = document.getElementById('browserPreviewDropdownMenu');
    this.confirmDialog = document.getElementById('browserPreviewConfirmDialog');

    // ツールバーのプレビューボタン（既定ブラウザで開く）
    if (this.previewBtn) {
      this.previewBtn.addEventListener('click', () => {
        this.previewInDefaultBrowser();
      });
    }

    // ドロップダウン開閉
    if (this.dropdownBtn && this.dropdownMenu) {
      this.dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = this.dropdownMenu.classList.toggle('is-open');
        this.dropdownBtn.setAttribute('aria-expanded', String(isOpen));
        if (isOpen) {
          this.renderDropdownMenu();
        }
      });

      document.addEventListener('click', (e) => {
        if (!this.dropdownMenu.contains(e.target) && e.target !== this.dropdownBtn) {
          this.dropdownMenu.classList.remove('is-open');
          this.dropdownBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // 初回の自動検出（ブラウザリストがシステム既定のみの場合、自動検出を試みる）
    if (this.settings.browsers.length <= 1 && window.electronAPI?.detectInstalledBrowsers) {
      this.autoDetectBrowsers(true).catch(() => {});
    }
  }

  getDefaultBrowser() {
    const found = this.settings.browsers.find((b) => b.id === this.settings.defaultBrowserId);
    return found || this.settings.browsers[0];
  }

  renderDropdownMenu() {
    if (!this.dropdownMenu) return;
    this.dropdownMenu.innerHTML = '';

    const defaultBrowser = this.getDefaultBrowser();

    this.settings.browsers.forEach((browser) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'browser-menu-item';
      if (browser.id === defaultBrowser?.id) {
        item.classList.add('is-default');
      }

      const iconSvg = `
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1c3.86 0 7 3.14 7 7s-3.14 7-7 7-7-3.14-7-7 3.14-7 7-7z"/>
          <path d="M1 8a7 7 0 0 1 14 0c0 .67-.09 1.32-.26 1.94H1.26A6.97 6.97 0 0 1 1 8zm3.5-5.38A5.99 5.99 0 0 1 8 2c1.33 0 2.55.43 3.5 1.16-.38.86-.94 1.84-1.63 2.84H6.13c-.69-1-1.25-1.98-1.63-2.84z"/>
        </svg>
      `;

      item.innerHTML = `
        <span class="browser-menu-icon">${iconSvg}</span>
        <span class="browser-menu-name">${browser.name}</span>
        ${browser.id === defaultBrowser?.id ? '<span class="browser-menu-badge">既定 (F12)</span>' : ''}
      `;

      item.addEventListener('click', () => {
        this.dropdownMenu.classList.remove('is-open');
        this.dropdownBtn?.setAttribute('aria-expanded', 'false');
        this.previewInBrowser(browser);
      });

      this.dropdownMenu.appendChild(item);
    });

    const divider = document.createElement('div');
    divider.className = 'browser-menu-divider';
    this.dropdownMenu.appendChild(divider);

    const configItem = document.createElement('button');
    configItem.type = 'button';
    configItem.className = 'browser-menu-item browser-menu-config';
    configItem.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
      </svg>
      <span>ブラウザ設定の管理...</span>
    `;
    configItem.addEventListener('click', () => {
      this.dropdownMenu.classList.remove('is-open');
      this.dropdownBtn?.setAttribute('aria-expanded', 'false');
      this.openBrowserSettingsDialog();
    });
    this.dropdownMenu.appendChild(configItem);
  }

  /**
   * 既定のブラウザでプレビュー実行 (F12)
   */
  async previewInDefaultBrowser() {
    const browser = this.getDefaultBrowser();
    await this.previewInBrowser(browser);
  }

  /**
   * 指定したブラウザでプレビュー実行
   */
  async previewInBrowser(browser) {
    const tab = this.app.tabManager?.getActiveTab();
    if (!tab) return;

    // 未保存の変更がある場合の保存確認フロー
    if (tab.isModified) {
      const choice = await this.promptSaveBeforePreview(tab.title);
      if (choice === 'cancel') {
        return;
      }
      if (choice === 'save') {
        if (!tab.filePath) {
          // 新規未保存の場合は「名前を付けて保存」
          await this.app.saveAsFile();
          if (!tab.filePath) {
            // 保存キャンセルされたら中断
            return;
          }
        } else {
          await this.app.saveFile();
        }
      }
    } else if (!tab.filePath) {
      // 変更はないがファイルパス自体がない新規ファイルの場合、ローカル保存を促す
      const choice = await this.promptSaveBeforePreview(tab.title);
      if (choice === 'save') {
        await this.app.saveAsFile();
        if (!tab.filePath) return;
      } else if (choice === 'cancel') {
        return;
      }
    }

    if (!window.electronAPI?.openInBrowser) {
      console.warn('[BrowserPreview] electronAPI.openInBrowser not available');
      return;
    }

    const res = await window.electronAPI.openInBrowser({
      filePath: tab.filePath,
      browserPath: browser?.path || ''
    });

    if (!res || !res.success) {
      console.error('[BrowserPreview] Failed to open browser:', res?.error);
      alert(`ブラウザの起動に失敗しました: ${res?.error || '実行ファイルが見つかりません'}`);
    }
  }

  /**
   * プレビュー前の保存確認ダイアログ
   */
  promptSaveBeforePreview(fileName) {
    return new Promise((resolve) => {
      if (!this.confirmDialog) {
        // フォールバック: ネイティブ確認
        const save = confirm(`「${fileName}」には未保存の変更があります。保存してからブラウザで開きますか？\n[OK] 保存して開く\n[キャンセル] 保存せずに開く`);
        resolve(save ? 'save' : 'discard');
        return;
      }

      const titleEl = document.getElementById('browserPreviewConfirmFile');
      if (titleEl) {
        titleEl.textContent = fileName;
      }

      const saveBtn = document.getElementById('browserPreviewConfirmSave');
      const discardBtn = document.getElementById('browserPreviewConfirmDiscard');
      const cancelBtn = document.getElementById('browserPreviewConfirmCancel');

      const cleanup = () => {
        saveBtn?.removeEventListener('click', onSave);
        discardBtn?.removeEventListener('click', onDiscard);
        cancelBtn?.removeEventListener('click', onCancel);
        this.confirmDialog.removeEventListener('close', onClose);
      };

      const onSave = () => {
        cleanup();
        this.confirmDialog.close();
        resolve('save');
      };

      const onDiscard = () => {
        cleanup();
        this.confirmDialog.close();
        resolve('discard');
      };

      const onCancel = () => {
        cleanup();
        this.confirmDialog.close();
        resolve('cancel');
      };

      const onClose = () => {
        cleanup();
        resolve('cancel');
      };

      saveBtn?.addEventListener('click', onSave, { once: true });
      discardBtn?.addEventListener('click', onDiscard, { once: true });
      cancelBtn?.addEventListener('click', onCancel, { once: true });
      this.confirmDialog.addEventListener('close', onClose, { once: true });

      this.confirmDialog.showModal();
    });
  }

  /**
   * ブラウザ自動検出
   */
  async autoDetectBrowsers(silent = false) {
    if (!window.electronAPI?.detectInstalledBrowsers) return [];

    try {
      const detected = await window.electronAPI.detectInstalledBrowsers();
      if (!Array.isArray(detected) || detected.length === 0) {
        if (!silent) alert('インストールされているブラウザを自動検出できませんでした。');
        return [];
      }

      let addedCount = 0;
      for (const d of detected) {
        const existing = this.settings.browsers.find((b) => b.path === d.path);
        if (!existing) {
          this.settings.browsers.push({
            id: d.id || `browser-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: d.name,
            path: d.path,
            isDefault: false
          });
          addedCount++;
        }
      }

      // 既定ブラウザが「システム既定」のままで、ChromeまたはEdgeが検出されていれば既定にセット
      if (this.settings.defaultBrowserId === 'system-default') {
        const preferred = this.settings.browsers.find((b) => b.name.includes('Chrome')) || this.settings.browsers[1];
        if (preferred) {
          this.settings.defaultBrowserId = preferred.id;
        }
      }

      this.saveSettings();

      if (!silent) {
        alert(`${detected.length}件のブラウザを検出しました（新しく${addedCount}件を追加）。`);
        this.renderBrowserSettingsList();
      }
      return detected;
    } catch (err) {
      console.error('[BrowserPreview] autoDetect error:', err);
      if (!silent) alert(`ブラウザの検出中にエラーが発生しました: ${err.message}`);
      return [];
    }
  }

  /**
   * ブラウザ設定管理モーダルを開く
   */
  openBrowserSettingsDialog() {
    const dialog = document.getElementById('browserSettingsDialog');
    if (!dialog) return;

    this.renderBrowserSettingsList();

    const addBtn = document.getElementById('addBrowserBtn');
    const detectBtn = document.getElementById('detectBrowsersBtn');
    const closeBtn = document.getElementById('browserSettingsCloseBtn');

    if (addBtn && !addBtn._hasListener) {
      addBtn._hasListener = true;
      addBtn.addEventListener('click', () => this.promptAddBrowser());
    }

    if (detectBtn && !detectBtn._hasListener) {
      detectBtn._hasListener = true;
      detectBtn.addEventListener('click', () => this.autoDetectBrowsers(false));
    }

    if (closeBtn && !closeBtn._hasListener) {
      closeBtn._hasListener = true;
      closeBtn.addEventListener('click', () => dialog.close());
    }

    dialog.showModal();
  }

  renderBrowserSettingsList() {
    const listEl = document.getElementById('browserSettingsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.settings.browsers.forEach((browser) => {
      const row = document.createElement('div');
      row.className = 'browser-setting-row';

      const isDefault = browser.id === this.settings.defaultBrowserId;

      row.innerHTML = `
        <div class="browser-setting-info">
          <div class="browser-setting-title">
            <strong>${browser.name}</strong>
            ${isDefault ? '<span class="badge-default">主ブラウザ (F12)</span>' : ''}
          </div>
          <div class="browser-setting-path">${browser.path || '(システム既定)'}</div>
        </div>
        <div class="browser-setting-actions">
          ${
            !isDefault
              ? `<button type="button" class="btn btn-sm make-default-btn" data-id="${browser.id}" title="主ブラウザに設定">既定にする</button>`
              : ''
          }
          ${
            browser.id !== 'system-default'
              ? `<button type="button" class="btn btn-sm btn-danger delete-browser-btn" data-id="${browser.id}" title="削除">削除</button>`
              : ''
          }
        </div>
      `;

      const defaultBtn = row.querySelector('.make-default-btn');
      if (defaultBtn) {
        defaultBtn.addEventListener('click', () => {
          this.settings.defaultBrowserId = browser.id;
          this.saveSettings();
          this.renderBrowserSettingsList();
        });
      }

      const deleteBtn = row.querySelector('.delete-browser-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          if (confirm(`「${browser.name}」をブラウザ一覧から削除しますか？`)) {
            this.settings.browsers = this.settings.browsers.filter((b) => b.id !== browser.id);
            if (this.settings.defaultBrowserId === browser.id) {
              this.settings.defaultBrowserId = 'system-default';
            }
            this.saveSettings();
            this.renderBrowserSettingsList();
          }
        });
      }

      listEl.appendChild(row);
    });
  }

  /**
   * 手動でのブラウザ追加
   */
  async promptAddBrowser() {
    let chosenPath = '';
    if (window.electronAPI?.selectBrowserExe) {
      chosenPath = await window.electronAPI.selectBrowserExe();
    }

    if (!chosenPath) return;

    // ファイル名から推測
    const fileName = chosenPath.split(/[/\\]/).pop().replace(/\.exe$/i, '');
    let defaultName = fileName;
    if (/chrome/i.test(fileName)) defaultName = 'Google Chrome';
    else if (/firefox/i.test(fileName)) defaultName = 'Mozilla Firefox';
    else if (/msedge|edge/i.test(fileName)) defaultName = 'Microsoft Edge';
    else if (/brave/i.test(fileName)) defaultName = 'Brave';
    else if (/vivaldi/i.test(fileName)) defaultName = 'Vivaldi';

    const browserName = prompt('ブラウザの表示名を入力してください:', defaultName);
    if (!browserName) return;

    const newBrowser = {
      id: `browser-${Date.now()}`,
      name: browserName.trim(),
      path: chosenPath,
      isDefault: false
    };

    this.settings.browsers.push(newBrowser);
    this.saveSettings();
    this.renderBrowserSettingsList();
  }
}
