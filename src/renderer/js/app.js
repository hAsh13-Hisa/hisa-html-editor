import { createMonacoEditor, setMonacoTheme, updateMonacoSettings, monaco } from './monaco-setup.js';
import { registerAutoCloseTag } from './extensions/auto-close-tag.js';
import { setupEmmet } from './extensions/emmet.js';
import { registerImagePreview } from './extensions/image-preview.js';
import { registerCssIntellisense, cssManager } from './extensions/css-intellisense.js';
import { QuickEditManager } from './extensions/quick-edit.js';
import { PreviewSync } from './preview-sync.js';
import { setupContextMenuJa } from './extensions/context-menu-ja.js';
import { TabManager } from './tab-manager.js';

class App {
  constructor() {
    this.editor = null;
    this.previewSync = null;
    this.quickEditManager = null;
    this.wrapTagApi = null;
    this.tabManager = null;
    this.settings = this.loadSettings();

    this.initElements();
    this.initTheme();
    this.initLayout();
    this.initMonaco();
    this.initSplitter();
    this.initToolbarEvents();
    this.initMenuListener();
    this.initKeyBindings();
    this.initDragAndDrop();
    this.initShortcutsModal();
    this.initServerConnection();
    this.initImageMapListener();
  }

  loadSettings() {
    const defaults = {
      theme: 'dark',
      fontSize: 14,
      tabSize: 2,
      lineNumbers: true,
      lineWrapping: true,
      layout: 'split-h',
      responsive: 'full'
    };
    try {
      const stored = localStorage.getItem('hisa-editor-settings');
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch {
      return defaults;
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('hisa-editor-settings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  initElements() {
    this.workspace = document.getElementById('workspace');
    this.previewPane = document.getElementById('previewPane');
    this.editorPane = document.getElementById('editorPane');
    this.splitter = document.getElementById('paneSplitter');
    this.previewIframe = document.getElementById('preview');
    this.responsiveWrapper = document.getElementById('responsiveWrapper');
    this.currentFileLabel = document.getElementById('currentFile');

    // ボタン
    this.newBtn = document.getElementById('newFile');
    this.openBtn = document.getElementById('openFile');
    this.saveBtn = document.getElementById('saveFile');
    this.saveAsBtn = document.getElementById('saveAsFile');
    this.settingsBtn = document.getElementById('settingsButton');
    this.settingsMenu = document.getElementById('settingsMenu');

    // レイアウト・レスポンシブボタン
    this.layoutBtns = Array.from(document.querySelectorAll('.layout-btn'));
    this.responsiveBtns = Array.from(document.querySelectorAll('.responsive-btn'));

    // 設定コントロール
    this.themeInputs = Array.from(document.querySelectorAll('input[name="theme"]'));
    this.fontSizeSelect = document.getElementById('editorFontSize');
    this.tabSizeSelect = document.getElementById('editorTabSize');
    this.lineNumbersToggle = document.getElementById('editorLineNumbers');
    this.lineWrapToggle = document.getElementById('editorLineWrap');
  }

  initTheme() {
    const applyTheme = (theme) => {
      let resolved = theme;
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        resolved = prefersDark ? 'dark' : 'light';
      }
      document.body.setAttribute('data-theme', resolved);
      setMonacoTheme(resolved);
    };

    applyTheme(this.settings.theme);

    // 設定UIの反映
    this.themeInputs.forEach((input) => {
      input.checked = input.value === this.settings.theme;
      input.addEventListener('change', () => {
        if (input.checked) {
          this.settings.theme = input.value;
          this.saveSettings();
          applyTheme(input.value);
        }
      });
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.settings.theme === 'system') {
        applyTheme('system');
      }
    });
  }

  initLayout() {
    this.setLayout(this.settings.layout);
    this.setResponsive(this.settings.responsive);
  }

  setLayout(layout) {
    this.settings.layout = layout;
    this.saveSettings();

    this.workspace.className = `workspace layout-${layout}`;
    this.layoutBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layout === layout);
    });

    // スプリッターによるインラインスタイルをリセットしてCSS定義のサイズを復元
    this.previewPane.style.flex = '';
    this.previewPane.style.width = '';
    this.previewPane.style.height = '';
    this.editorPane.style.flex = '';
    this.editorPane.style.width = '';
    this.editorPane.style.height = '';

    // Monaco Editorのサイズ再計算
    setTimeout(() => {
      this.editor?.layout();
    }, 50);
  }

  setResponsive(device) {
    this.settings.responsive = device;
    this.saveSettings();

    this.responsiveWrapper.className = `responsive-wrapper device-${device}`;
    this.responsiveBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.device === device);
    });
  }

  initMonaco() {
    const container = document.getElementById('monacoEditorContainer');
    const initialHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>新規ドキュメント</title>
  <style>
    :root {
      --accent: #2563eb;
      --accent-light: #eff6ff;
      --text: #1e293b;
      --text-sub: #64748b;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --kbd-bg: #f8fafc;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --accent: #3b82f6;
        --accent-light: rgba(59, 130, 246, 0.15);
        --text: #f1f5f9;
        --text-sub: #94a3b8;
        --card-bg: #1e293b;
        --border: #334155;
        --kbd-bg: #0f172a;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 32px 24px;
      color: var(--text);
      background-color: transparent;
      line-height: 1.6;
    }
    .hero {
      max-width: 840px;
      margin: 0 auto 24px;
    }
    .hero-title {
      color: var(--accent);
      font-size: 24px;
      font-weight: 700;
      margin: 0 0 6px;
    }
    .hero-desc {
      color: var(--text-sub);
      font-size: 13px;
      margin: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      max-width: 840px;
      margin: 0 auto;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }
    .card-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
      margin: 0 0 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
    }
    .key-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .key-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      gap: 8px;
    }
    .key-label {
      color: var(--text);
    }
    .key-combo {
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
    }
    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 11px;
      font-weight: 600;
      color: var(--text);
      background-color: var(--kbd-bg);
      border: 1px solid var(--border);
      border-bottom: 2px solid var(--border);
      border-radius: 4px;
    }
    .tip-box {
      max-width: 840px;
      margin: 20px auto 0;
      padding: 12px 16px;
      background: var(--accent-light);
      border-left: 4px solid var(--accent);
      border-radius: 4px;
      font-size: 12px;
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1 class="hero-title">ようこそ Hisa HTML Editor へ！</h1>
    <p class="hero-desc">左側のエディタでHTMLを編集すると、リアルタイムでプレビューが反映されます。エクスプローラーからファイルをドラッグ＆ドロップしてタブ追加も可能です。</p>
  </div>

  <div class="grid">
    <div class="card">
      <h2 class="card-title">ファイル & タブ操作</h2>
      <ul class="key-list">
        <li class="key-item"><span class="key-label">新規タブ作成</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>N</kbd></span></li>
        <li class="key-item"><span class="key-label">ファイルを開く</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>O</kbd></span></li>
        <li class="key-item"><span class="key-label">上書き保存</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>S</kbd></span></li>
        <li class="key-item"><span class="key-label">別名で保存</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></span></li>
        <li class="key-item"><span class="key-label">現在のタブを閉じる</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>W</kbd></span></li>
        <li class="key-item"><span class="key-label">タブ切り替え</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>Tab</kbd></span></li>
      </ul>
    </div>

    <div class="card">
      <h2 class="card-title">編集 & コーディング支援</h2>
      <ul class="key-list">
        <li class="key-item"><span class="key-label">Emmet 展開</span><span class="key-combo"><kbd>Tab</kbd></span></li>
        <li class="key-item"><span class="key-label">タグで囲む</span><span class="key-combo"><kbd>Alt</kbd>+<kbd>W</kbd></span></li>
        <li class="key-item"><span class="key-label">CSSクイック編集</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>E</kbd></span></li>
        <li class="key-item"><span class="key-label">検索</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>F</kbd></span></li>
        <li class="key-item"><span class="key-label">置換</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>R</kbd></span></li>
        <li class="key-item"><span class="key-label">コメント切替</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>/</kbd></span></li>
      </ul>
    </div>

    <div class="card">
      <h2 class="card-title">画面レイアウト切替</h2>
      <ul class="key-list">
        <li class="key-item"><span class="key-label">左右分割</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>1</kbd></span></li>
        <li class="key-item"><span class="key-label">上下分割</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>2</kbd></span></li>
        <li class="key-item"><span class="key-label">エディタのみ全画面</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>3</kbd></span></li>
        <li class="key-item"><span class="key-label">プレビューのみ全画面</span><span class="key-combo"><kbd>Ctrl</kbd>+<kbd>4</kbd></span></li>
        <li class="key-item"><span class="key-label">ショートカット一覧</span><span class="key-combo"><kbd>F1</kbd></span></li>
      </ul>
    </div>
  </div>

  <div class="tip-box">
    💡 <strong>ヒント</strong>: メニューバーの「ヘルプ」&gt;「ショートカットキー一覧...」（または <kbd>F1</kbd> キー）からいつでもこの一覧を確認できます。
  </div>
</body>
</html>`;

    this.editor = createMonacoEditor(container, '', this.settings);

    // 各拡張の登録
    registerAutoCloseTag(this.editor);
    this.wrapTagApi = setupEmmet(this.editor);
    registerImagePreview();
    registerCssIntellisense(this.editor);
    setupContextMenuJa(this.editor);

    this.previewSync = new PreviewSync(this.editor, this.previewIframe);

    this.quickEditManager = new QuickEditManager(this.editor, () => {
      this.handleActiveContentChange();
    });
    this.quickEditManager.register();

    // Ctrl+Rで置換ウィジェットを起動（ブラウザのリロードを抑止して置換を実行）
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      this.editor.getAction('editor.action.startFindReplaceAction')?.run();
    });

    // イメージMAPビジュアルエディター起動アクション (Alt+M / 右クリックメニュー)
    this.editor.addAction({
      id: 'hisa.openImageMap',
      label: 'イメージMAPビジュアルエディターで編集...',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyM],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: () => {
        this.openImageMapEditor();
      }
    });

    // カーソル位置連動
    this.editor.onDidChangeCursorPosition(() => {
      this.previewSync.notifySelection();
    });

    this.previewIframe.addEventListener('load', () => {
      this.previewSync.notifySelection();
    });

    // タブマネージャー初期化
    this.tabManager = new TabManager(this.editor, {
      onTabSwitch: async (tab) => {
        this.quickEditManager?.closeQuickEdit();
        cssManager.setDocumentDir(tab.dir);
        if (window.electronAPI?.setRootDir && tab.dir) {
          await window.electronAPI.setRootDir(tab.dir);
        }
        await this.handleActiveContentChange();
        this.updateStatus(tab);
      },
      onContentChange: async (tab) => {
        await this.handleActiveContentChange();
        this.updateStatus(tab);
      },
      onModifiedChange: (tab) => {
        const active = this.tabManager.getActiveTab();
        if (active && active.id === tab.id) {
          this.updateStatus(tab);
        }
      },
      onTabInfoUpdated: (tab) => {
        const active = this.tabManager.getActiveTab();
        if (active && active.id === tab.id) {
          this.updateStatus(tab);
        }
      }
    });

    // 初期タブの作成
    const firstTab = this.tabManager.createTab({
      title: '新規ドキュメント',
      content: initialHtml
    });
    this.updateStatus(firstTab);
  }

  handleActiveContentChange(immediate = false) {
    if (this._contentChangeTimer) {
      clearTimeout(this._contentChangeTimer);
      this._contentChangeTimer = null;
    }

    const doUpdate = async () => {
      const activeTab = this.tabManager?.getActiveTab();
      if (!activeTab) return;

      const content = activeTab.model.getValue();
      await cssManager.parseHtml(content);
      await this.previewSync.updatePreview(content);
    };

    if (immediate) {
      return doUpdate();
    } else {
      this._contentChangeTimer = setTimeout(doUpdate, 50);
    }
  }

  initSplitter() {
    let isDragging = false;

    const onPointerDown = (e) => {
      isDragging = true;
      this.workspace.classList.add('is-resizing');
      this.splitter.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const rect = this.workspace.getBoundingClientRect();

      if (this.settings.layout === 'split-h') {
        const offset = e.clientX - rect.left;
        const ratio = Math.max(0.15, Math.min(0.85, offset / rect.width));
        this.previewPane.style.flex = `0 0 ${ratio * 100}%`;
        this.previewPane.style.width = `${ratio * 100}%`;
      } else if (this.settings.layout === 'split-v') {
        const offset = e.clientY - rect.top;
        const ratio = Math.max(0.15, Math.min(0.85, offset / rect.height));
        this.previewPane.style.flex = `0 0 ${ratio * 100}%`;
        this.previewPane.style.height = `${ratio * 100}%`;
      }

      this.editor?.layout();
      e.preventDefault();
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      this.workspace.classList.remove('is-resizing');
      this.splitter.releasePointerCapture(e.pointerId);
    };

    this.splitter.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  initToolbarEvents() {
    this.newBtn.addEventListener('click', () => this.newFile());
    this.openBtn.addEventListener('click', () => this.openFile());
    this.saveBtn.addEventListener('click', () => this.saveFile());
    this.saveAsBtn.addEventListener('click', () => this.saveAsFile());

    // レイアウトボタン
    this.layoutBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.setLayout(btn.dataset.layout));
    });

    // レスポンシブボタン
    this.responsiveBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.setResponsive(btn.dataset.device));
    });

    // 設定メニュー開閉
    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = this.settingsMenu.classList.toggle('is-open');
      this.settingsBtn.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!this.settingsMenu.contains(e.target) && e.target !== this.settingsBtn) {
        this.settingsMenu.classList.remove('is-open');
        this.settingsBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // 設定コントロール反映
    this.fontSizeSelect.value = String(this.settings.fontSize);
    this.fontSizeSelect.addEventListener('change', () => {
      this.settings.fontSize = Number(this.fontSizeSelect.value);
      this.saveSettings();
      updateMonacoSettings(this.editor, { fontSize: this.settings.fontSize });
    });

    this.tabSizeSelect.value = String(this.settings.tabSize);
    this.tabSizeSelect.addEventListener('change', () => {
      this.settings.tabSize = Number(this.tabSizeSelect.value);
      this.saveSettings();
      updateMonacoSettings(this.editor, { tabSize: this.settings.tabSize });
    });

    this.lineNumbersToggle.checked = this.settings.lineNumbers;
    this.lineNumbersToggle.addEventListener('change', () => {
      this.settings.lineNumbers = this.lineNumbersToggle.checked;
      this.saveSettings();
      updateMonacoSettings(this.editor, { lineNumbers: this.settings.lineNumbers });
    });

    this.lineWrapToggle.checked = this.settings.lineWrapping;
    this.lineWrapToggle.addEventListener('change', () => {
      this.settings.lineWrapping = this.lineWrapToggle.checked;
      this.saveSettings();
      updateMonacoSettings(this.editor, { lineWrapping: this.settings.lineWrapping });
    });

    const openImageMapBtn = document.getElementById('openImageMapBtn');
    if (openImageMapBtn) {
      openImageMapBtn.addEventListener('click', () => {
        this.openImageMapEditor();
      });
    }
  }

  initMenuListener() {
    if (!window.electronAPI?.onMenuAction) return;

    window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case 'newFile': this.newFile(); break;
        case 'openFile': this.openFile(); break;
        case 'saveFile': this.saveFile(); break;
        case 'saveAsFile': this.saveAsFile(); break;
        case 'closeTab': this.tabManager?.closeActiveTab(); break;
        case 'find':
          this.editor?.focus();
          this.editor?.getAction('actions.find')?.run();
          break;
        case 'replace':
          this.editor?.focus();
          this.editor?.getAction('editor.action.startFindReplaceAction')?.run();
          break;
        case 'replaceAll':
          this.editor?.focus();
          this.editor?.getAction('editor.action.startFindReplaceAction')?.run();
          this.editor?.getAction('editor.action.replaceAll')?.run();
          break;
        case 'wrapTag': this.wrapTagApi?.openWrapTagDialog(); break;
        case 'quickEdit': this.quickEditManager?.toggleQuickEdit(); break;
        case 'openImageMap': this.openImageMapEditor(); break;
        case 'layoutSplitH': this.setLayout('split-h'); break;
        case 'layoutSplitV': this.setLayout('split-v'); break;
        case 'layoutEditorOnly': this.setLayout('editor-only'); break;
        case 'layoutPreviewOnly': this.setLayout('preview-only'); break;
        case 'showShortcuts': this.openShortcutsModal(); break;
      }
    });
  }

  initKeyBindings() {
    window.addEventListener('keydown', (e) => {
      // F1: ショートカット一覧ダイアログ
      if (e.key === 'F1') {
        e.preventDefault();
        this.openShortcutsModal();
        return;
      }

      // Alt+M: イメージMAPビジュアルエディター
      if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        this.openImageMapEditor();
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd) {
        // Ctrl+R: 置換ウィジェットを開く (リロード誤爆防止 & 置換実行)
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          this.editor?.focus();
          this.editor?.getAction('editor.action.startFindReplaceAction')?.run();
          return;
        }

        // Ctrl+F: 検索ウィジェットを開く
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.editor?.focus();
          this.editor?.getAction('actions.find')?.run();
          return;
        }

        // Ctrl+W: タブを閉じる
        if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          this.tabManager?.closeActiveTab();
          return;
        }

        // Ctrl+Tab / Ctrl+Shift+Tab: タブ切り替え
        if (e.key === 'Tab') {
          e.preventDefault();
          if (e.shiftKey) {
            this.tabManager?.switchPrevTab();
          } else {
            this.tabManager?.switchNextTab();
          }
          return;
        }

        // Ctrl+PageDown / Ctrl+PageUp
        if (e.key === 'PageDown') {
          e.preventDefault();
          this.tabManager?.switchNextTab();
          return;
        }
        if (e.key === 'PageUp') {
          e.preventDefault();
          this.tabManager?.switchPrevTab();
          return;
        }
      }
    });
  }

  async initServerConnection() {
    if (window.electronAPI?.getServerInfo) {
      const info = await window.electronAPI.getServerInfo();
      if (info && info.port) {
        this.previewSync.setServerPort(info.port);
        const activeTab = this.tabManager?.getActiveTab();
        if (activeTab) {
          await this.previewSync.updatePreview(activeTab.model.getValue());
        }
      }
    }
  }

  // ファイル操作
  newFile() {
    this.tabManager.createTab({
      content: this.tabManager.getDefaultHtml()
    });
  }

  async openFile() {
    if (this._isOpeningFile) return;
    this._isOpeningFile = true;

    if (!window.electronAPI?.openFileDialog) {
      console.error('[App] electronAPI.openFileDialog is not defined');
      this._isOpeningFile = false;
      return;
    }

    document.body.classList.add('is-dialog-waiting');
    try {
      const file = await window.electronAPI.openFileDialog();
      if (!file || !file.filePath) {
        return;
      }

      // 既に同一ファイルが開かれていればそのタブをアクティブにする
      const existingTab = this.tabManager.getTabByPath(file.filePath);
      if (existingTab) {
        this.tabManager.switchTab(existingTab.id);
        return;
      }

      // 初期状態の未編集・未保存タブ（1つのみ）の場合はそのタブを置き換える
      const activeTab = this.tabManager.getActiveTab();
      if (this.tabManager.tabs.length === 1 && !activeTab.filePath && !activeTab.isModified) {
        activeTab._isInternalUpdating = true;
        activeTab.model.setValue(file.content);
        activeTab._isInternalUpdating = false;

        this.tabManager.updateTabFileInfo(activeTab.id, {
          title: file.fileName,
          filePath: file.filePath,
          dir: file.dir,
          encoding: file.encoding || 'UTF-8'
        });
        cssManager.setDocumentDir(file.dir);
        if (window.electronAPI?.setRootDir && file.dir) {
          await window.electronAPI.setRootDir(file.dir);
        }
        await this.handleActiveContentChange(true);
        this.updateStatus(activeTab);
        return;
      }

      // 新しいタブとして開く
      const newTab = this.tabManager.createTab({
        title: file.fileName,
        content: file.content,
        filePath: file.filePath,
        dir: file.dir,
        encoding: file.encoding || 'UTF-8'
      });
      this.updateStatus(newTab);
    } catch (err) {
      console.error('[App] openFile error:', err);
      alert(`ファイルを開けませんでした: ${err.message || err}`);
    } finally {
      this._isOpeningFile = false;
      document.body.classList.remove('is-dialog-waiting');
    }
  }

  // ドラッグ＆ドロップでのファイルパス受け取りによるオープン
  async openFileByPath(filePath) {
    if (!window.electronAPI?.openFilePath) return;

    try {
      // 既に同一ファイルが開かれていればそのタブをアクティブにする
      const existingTab = this.tabManager.getTabByPath(filePath);
      if (existingTab) {
        this.tabManager.switchTab(existingTab.id);
        return;
      }

      const file = await window.electronAPI.openFilePath(filePath);
      if (!file || !file.success) {
        console.warn('[App] Failed to open dropped file:', file?.error);
        alert(`ファイルを開けませんでした: ${file?.error || '読み込みに失敗しました'}`);
        return;
      }

      // 初期状態の未編集・未保存タブ（1つのみ）の場合はそのタブを置き換える
      const activeTab = this.tabManager.getActiveTab();
      if (this.tabManager.tabs.length === 1 && !activeTab.filePath && !activeTab.isModified) {
        activeTab._isInternalUpdating = true;
        activeTab.model.setValue(file.content);
        activeTab._isInternalUpdating = false;

        this.tabManager.updateTabFileInfo(activeTab.id, {
          title: file.fileName,
          filePath: file.filePath,
          dir: file.dir,
          encoding: file.encoding || 'UTF-8'
        });
        cssManager.setDocumentDir(file.dir);
        if (window.electronAPI?.setRootDir && file.dir) {
          await window.electronAPI.setRootDir(file.dir);
        }
        await this.handleActiveContentChange(true);
        this.updateStatus(activeTab);
        return;
      }

      // 新しいタブとして開く
      const newTab = this.tabManager.createTab({
        title: file.fileName,
        content: file.content,
        filePath: file.filePath,
        dir: file.dir,
        encoding: file.encoding || 'UTF-8'
      });
      this.updateStatus(newTab);
    } catch (err) {
      console.error('[App] openFileByPath error:', err);
    }
  }

  initDragAndDrop() {
    let dragCounter = 0;

    const resetDragState = () => {
      dragCounter = 0;
      document.body.classList.remove('is-dragging-file');
    };

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      document.body.classList.add('is-dragging-file');
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      if (!document.body.classList.contains('is-dragging-file')) {
        document.body.classList.add('is-dragging-file');
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        resetDragState();
      }
    });

    window.addEventListener('dragend', (e) => {
      resetDragState();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetDragState();

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const fileObj = files[i];
        let filePath = '';
        if (window.electronAPI?.getPathForFile) {
          try {
            filePath = window.electronAPI.getPathForFile(fileObj);
          } catch (err) {
            console.warn('[App] getPathForFile failed:', err);
          }
        }
        if (!filePath && fileObj.path) {
          filePath = fileObj.path;
        }

        if (!filePath) {
          console.warn('[App] Could not resolve file path for dropped item:', fileObj.name);
          continue;
        }

        await this.openFileByPath(filePath);
      }
    });
  }

  async saveFile() {
    const tab = this.tabManager?.getActiveTab();
    if (!tab) return;

    if (!tab.filePath) {
      return this.saveAsFile();
    }

    if (!window.electronAPI?.writeFile) return;

    const res = await window.electronAPI.writeFile(
      tab.filePath,
      tab.model.getValue(),
      tab.encoding
    );
    if (res && res.success) {
      this.tabManager.markModified(tab.id, false);
      this.updateStatus(tab);
      console.log(`[App] File saved: ${tab.filePath} [${tab.encoding}]`);
    } else {
      alert(`保存に失敗しました: ${res?.error || '不明なエラー'}`);
    }
  }

  async saveAsFile() {
    const tab = this.tabManager?.getActiveTab();
    if (!tab) return;

    if (!window.electronAPI?.saveFileDialog) return;

    const target = await window.electronAPI.saveFileDialog(tab.title || 'index.html');
    if (!target) return;

    this.tabManager.updateTabFileInfo(tab.id, {
      title: target.fileName,
      filePath: target.filePath,
      dir: target.dir,
      encoding: tab.encoding || 'UTF-8'
    });

    cssManager.setDocumentDir(target.dir);
    if (window.electronAPI?.setRootDir && target.dir) {
      await window.electronAPI.setRootDir(target.dir);
    }

    await this.saveFile();
  }

  updateStatus(tab) {
    if (!tab) {
      if (this.currentFileLabel) this.currentFileLabel.textContent = '';
      document.title = 'Hisa HTML Editor';
      return;
    }
    const star = tab.isModified ? ' *' : '';
    const enc = tab.encoding ? `[${tab.encoding}]` : '';
    if (this.currentFileLabel) {
      this.currentFileLabel.textContent = enc;
    }
    document.title = `${tab.title}${enc ? ' ' + enc : ''}${star} - Hisa HTML Editor`;
  }

  /* イメージMAPビジュアルエディター連携 */
  initImageMapListener() {
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'preview-image-open-map' && event.data?.outerHTML) {
        this.openImageMapEditor(event.data.outerHTML);
      }
    });

    // タグを挿入（カーソル位置への新規挿入）
    if (window.electronAPI?.onInsertImageMapCode) {
      window.electronAPI.onInsertImageMapCode((code) => {
        if (!this.editor || !code) return;
        const selection = this.editor.getSelection();
        if (selection) {
          this.editor.executeEdits('image-map', [
            {
              range: selection,
              text: code,
              forceMoveMarkers: true
            }
          ]);
          this.editor.focus();
        }
      });
    }

    // タグを更新（既存の該当タグを特定して置換）
    if (window.electronAPI?.onUpdateImageMapCode) {
      window.electronAPI.onUpdateImageMapCode((data) => {
        this.handleUpdateImageMapCode(data);
      });
    }
  }

  handleUpdateImageMapCode(data) {
    if (!this.editor || !data) return false;
    const model = this.editor.getModel();
    if (!model) return false;

    const fullContent = model.getValue();
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 1. 更新対象の <map> タグを検索
    let mapMatch = null;
    const mapNamesToTry = [data.originalMapName, data.mapName, this.imageMapContext?.originalMapName].filter(Boolean);
    for (const name of mapNamesToTry) {
      const reg = new RegExp(`<map\\b[^>]*\\bname=["']${escapeRegex(name)}["'][^>]*>[\\s\\S]*?<\\/map>`, 'i');
      const m = reg.exec(fullContent);
      if (m) {
        mapMatch = { startOffset: m.index, endOffset: m.index + m[0].length, code: m[0], name };
        break;
      }
    }

    // 名前で見つからず、ドキュメント全体で <map> が1つだけある場合
    if (!mapMatch) {
      const allMaps = [...fullContent.matchAll(/<map\b[^>]*>[\s\S]*?<\/map>/gi)];
      if (allMaps.length === 1) {
        mapMatch = { startOffset: allMaps[0].index, endOffset: allMaps[0].index + allMaps[0][0].length, code: allMaps[0][0] };
      }
    }

    // 2. 更新対象の <img> タグを検索
    let imgMatch = null;
    for (const name of mapNamesToTry) {
      const reg = new RegExp(`<img\\b[^>]*\\busemap=["']#?${escapeRegex(name)}["'][^>]*>`, 'i');
      const m = reg.exec(fullContent);
      if (m) {
        imgMatch = { startOffset: m.index, endOffset: m.index + m[0].length, code: m[0] };
        break;
      }
    }

    // imageSrc による <img> 検索（もし usemap で見つからなかった場合）
    if (!imgMatch && data.imageSrc) {
      const reg = new RegExp(`<img\\b[^>]*\\bsrc=["']${escapeRegex(data.imageSrc)}["'][^>]*>`, 'i');
      const m = reg.exec(fullContent);
      if (m) {
        imgMatch = { startOffset: m.index, endOffset: m.index + m[0].length, code: m[0] };
      }
    }

    // 3. 置換エディットの生成
    const edits = [];
    let focusRange = null;

    if (mapMatch && imgMatch) {
      // <img> と <map> の位置関係を判定（連続しているかどうか）
      const isImgFirst = imgMatch.endOffset <= mapMatch.startOffset;
      const isMapFirst = mapMatch.endOffset <= imgMatch.startOffset;
      let isContiguous = false;

      if (isImgFirst) {
        const between = fullContent.substring(imgMatch.endOffset, mapMatch.startOffset);
        if (/^\s*$/.test(between)) isContiguous = true;
      } else if (isMapFirst) {
        const between = fullContent.substring(mapMatch.endOffset, imgMatch.startOffset);
        if (/^\s*$/.test(between)) isContiguous = true;
      }

      if (data.includeImg && isContiguous) {
        // 連続している場合は <img> から </map> までを一括置換
        const startOffset = Math.min(imgMatch.startOffset, mapMatch.startOffset);
        const endOffset = Math.max(imgMatch.endOffset, mapMatch.endOffset);
        const startPos = model.getPositionAt(startOffset);
        const endPos = model.getPositionAt(endOffset);
        const range = new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
        edits.push({ range, text: data.fullCode, forceMoveMarkers: true });
        focusRange = range;
      } else {
        // 離れている、または includeImg が false の場合
        // <map> タグを置換
        const mapStart = model.getPositionAt(mapMatch.startOffset);
        const mapEnd = model.getPositionAt(mapMatch.endOffset);
        const mapRange = new monaco.Range(mapStart.lineNumber, mapStart.column, mapEnd.lineNumber, mapEnd.column);
        edits.push({ range: mapRange, text: data.mapOnlyCode, forceMoveMarkers: true });
        focusRange = mapRange;

        // <img> 側の usemap 属性の同期更新
        let updatedImgCode = imgMatch.code;
        if (/usemap=["']#?[^"']*["']/i.test(updatedImgCode)) {
          updatedImgCode = updatedImgCode.replace(/usemap=["']#?[^"']*["']/i, `usemap="#${data.mapName}"`);
        } else {
          updatedImgCode = updatedImgCode.replace(/<img\b/i, `<img usemap="#${data.mapName}"`);
        }
        if (data.includeImg && data.imageSrc) {
          updatedImgCode = updatedImgCode.replace(/src=["'][^"']*["']/i, `src="${data.imageSrc}"`);
        }
        if (updatedImgCode !== imgMatch.code) {
          const imgStart = model.getPositionAt(imgMatch.startOffset);
          const imgEnd = model.getPositionAt(imgMatch.endOffset);
          edits.push({
            range: new monaco.Range(imgStart.lineNumber, imgStart.column, imgEnd.lineNumber, imgEnd.column),
            text: updatedImgCode,
            forceMoveMarkers: true
          });
        }
      }
    } else if (mapMatch) {
      // <map> タグのみ見つかった場合
      const mapStart = model.getPositionAt(mapMatch.startOffset);
      const mapEnd = model.getPositionAt(mapMatch.endOffset);
      const mapRange = new monaco.Range(mapStart.lineNumber, mapStart.column, mapEnd.lineNumber, mapEnd.column);
      const replaceText = data.includeImg ? data.fullCode : data.mapOnlyCode;
      edits.push({ range: mapRange, text: replaceText, forceMoveMarkers: true });
      focusRange = mapRange;
    } else if (imgMatch) {
      // 元々 <map> がなく <img> だけだった位置を置換・拡張
      const imgStart = model.getPositionAt(imgMatch.startOffset);
      const imgEnd = model.getPositionAt(imgMatch.endOffset);
      const imgRange = new monaco.Range(imgStart.lineNumber, imgStart.column, imgEnd.lineNumber, imgEnd.column);

      if (data.includeImg) {
        edits.push({ range: imgRange, text: data.fullCode, forceMoveMarkers: true });
      } else {
        let updatedImgCode = imgMatch.code;
        if (/usemap=["']#?[^"']*["']/i.test(updatedImgCode)) {
          updatedImgCode = updatedImgCode.replace(/usemap=["']#?[^"']*["']/i, `usemap="#${data.mapName}"`);
        } else {
          updatedImgCode = updatedImgCode.replace(/<img\b/i, `<img usemap="#${data.mapName}"`);
        }
        edits.push({
          range: imgRange,
          text: `${updatedImgCode}\n\n${data.mapOnlyCode}`,
          forceMoveMarkers: true
        });
      }
      focusRange = imgRange;
    } else {
      // 対象が全く見つからなかった場合
      return false;
    }

    if (edits.length > 0) {
      this.editor.executeEdits('image-map', edits);
      if (focusRange) {
        this.editor.setSelection(focusRange);
        this.editor.revealRangeInCenter(focusRange);
      }
      this.editor.focus();

      // コンテキスト更新
      this.imageMapContext = {
        originalMapName: data.mapName,
        hasExistingMap: true
      };
      return true;
    }

    return false;
  }

  openImageMapEditor(codeOverride = null) {
    if (!window.electronAPI?.openImageMap) return;

    let targetCode = codeOverride || null;
    let hasExistingMap = false;
    let foundMapName = null;
    const selection = this.editor?.getSelection();
    const model = this.editor?.getModel();

    if (!targetCode && selection && model) {
      const selectedText = model.getValueInRange(selection).trim();
      if (selectedText) {
        targetCode = selectedText;
        if (/<map\b/i.test(targetCode)) {
          hasExistingMap = true;
          const nm = targetCode.match(/name=["']([^"']+)["']/i);
          if (nm) foundMapName = nm[1];
        }
      } else {
        const fullContent = model.getValue();
        const cursorOffset = model.getOffsetAt(selection.getPosition());

        // 1. カーソル位置を内包する <map ...>...</map> を優先検索
        const mapRegex = /<map\b[^>]*>[\s\S]*?<\/map>/gi;
        let match;
        while ((match = mapRegex.exec(fullContent)) !== null) {
          const startOffset = match.index;
          const endOffset = match.index + match[0].length;
          if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
            targetCode = match[0];
            hasExistingMap = true;
            const nm = match[0].match(/name=["']([^"']+)["']/i);
            if (nm) foundMapName = nm[1];
            break;
          }
        }

        // 2. カーソル位置を内包する <img ...> を検索
        if (!targetCode) {
          const imgRegex = /<img\b[^>]*>/gi;
          while ((match = imgRegex.exec(fullContent)) !== null) {
            const startOffset = match.index;
            const endOffset = match.index + match[0].length;
            if (cursorOffset >= startOffset && cursorOffset <= endOffset) {
              targetCode = match[0];
              break;
            }
          }
        }

        // 3. カーソル行または前後1行にある <img ...> または <map ...> を検索
        if (!targetCode) {
          const lineNumber = selection.positionLineNumber;
          const checkLines = [lineNumber, lineNumber - 1, lineNumber + 1].filter(
            (l) => l >= 1 && l <= model.getLineCount()
          );
          for (const l of checkLines) {
            const lineContent = model.getLineContent(l);
            const mapMatch = lineContent.match(/<map\b[^>]*>[\s\S]*?<\/map>/i);
            if (mapMatch) {
              targetCode = mapMatch[0];
              hasExistingMap = true;
              const nm = mapMatch[0].match(/name=["']([^"']+)["']/i);
              if (nm) foundMapName = nm[1];
              break;
            }
            const imgMatch = lineContent.match(/<img\b[^>]*>/i);
            if (imgMatch) {
              targetCode = imgMatch[0];
              break;
            }
          }
        }

        // 4. ドキュメント全体で <map ...> が1つだけある場合
        if (!targetCode) {
          const allMapMatches = [...fullContent.matchAll(/<map\b[^>]*>[\s\S]*?<\/map>/gi)];
          if (allMapMatches.length === 1) {
            targetCode = allMapMatches[0][0];
            hasExistingMap = true;
            const nm = targetCode.match(/name=["']([^"']+)["']/i);
            if (nm) foundMapName = nm[1];
          }
        }

        // 5. ドキュメント全体で <img ...> が1つだけある場合
        if (!targetCode) {
          const allImgMatches = [...fullContent.matchAll(/<img\b[^>]*>/gi)];
          if (allImgMatches.length === 1) {
            targetCode = allImgMatches[0][0];
          }
        }
      }
    }

    // 6. コードが特定できた場合の関連タグ結合
    if (targetCode && model) {
      const fullContent = model.getValue();

      // もし <img> で usemap 属性がある場合、対応する <map> もドキュメントから探して結合
      const usemapMatch = targetCode.match(/usemap=["']#?([^"']+)["']/i);
      if (usemapMatch && !targetCode.includes('<map')) {
        const mapName = usemapMatch[1];
        foundMapName = mapName;
        const mapRegex = new RegExp(`<map\\b[^>]*name=["']${mapName}["'][^>]*>[\\s\\S]*?<\\/map>`, 'i');
        const mapMatch = fullContent.match(mapRegex);
        if (mapMatch) {
          targetCode = `${targetCode}\n\n${mapMatch[0]}`;
          hasExistingMap = true;
        }
      }

      // 逆に <map> が特定されたが <img> が含まれていない場合、対応する <img> も探して結合
      if (targetCode.includes('<map') && !targetCode.includes('<img')) {
        const nmMatch = targetCode.match(/<map\b[^>]*name=["']([^"']+)["']/i);
        if (nmMatch) {
          const mapName = nmMatch[1];
          foundMapName = mapName;
          hasExistingMap = true;
          const imgRegex = new RegExp(`<img\\b[^>]*usemap=["']#?${mapName}["'][^>]*>`, 'i');
          const imgMatch = fullContent.match(imgRegex);
          if (imgMatch) {
            targetCode = `${imgMatch[0]}\n\n${targetCode}`;
          }
        }
      }
    }

    // コンテキストの保持
    this.imageMapContext = {
      originalMapName: foundMapName || null,
      hasExistingMap: Boolean(hasExistingMap)
    };

    const activeTab = this.tabManager?.activeTab;
    const payload = {
      html: targetCode || '',
      baseDir: activeTab?.dir || '',
      hasExistingMap: Boolean(hasExistingMap),
      originalMapName: foundMapName || ''
    };

    window.electronAPI.openImageMap(payload);
  }

  /* ショートカットキーモーダル */
  initShortcutsModal() {
    this.shortcutsDialog = document.getElementById('shortcutsDialog');
    this.shortcutsCloseBtn = document.getElementById('shortcutsCloseBtn');
    this.shortcutsSearchInput = document.getElementById('shortcutsSearchInput');
    this.shortcutsBody = document.getElementById('shortcutsBody');

    if (this.shortcutsCloseBtn) {
      this.shortcutsCloseBtn.addEventListener('click', () => this.closeShortcutsModal());
    }

    if (this.shortcutsDialog) {
      // ダイアログ背景クリックで閉じる
      this.shortcutsDialog.addEventListener('click', (e) => {
        if (e.target === this.shortcutsDialog) {
          this.closeShortcutsModal();
        }
      });
    }

    if (this.shortcutsSearchInput) {
      this.shortcutsSearchInput.addEventListener('input', (e) => {
        this.renderShortcutsList(e.target.value);
      });
    }
  }

  openShortcutsModal() {
    if (!this.shortcutsDialog) return;
    if (this.shortcutsSearchInput) {
      this.shortcutsSearchInput.value = '';
    }
    this.renderShortcutsList('');
    this.shortcutsDialog.showModal();
    setTimeout(() => this.shortcutsSearchInput?.focus(), 50);
  }

  closeShortcutsModal() {
    if (!this.shortcutsDialog) return;
    this.shortcutsDialog.close();
    this.editor?.focus();
  }

  renderShortcutsList(filterQuery = '') {
    if (!this.shortcutsBody) return;
    this.shortcutsBody.innerHTML = '';

    const query = filterQuery.trim().toLowerCase();
    let totalMatches = 0;

    for (const group of SHORTCUTS_DATA) {
      const filteredItems = group.items.filter((item) => {
        if (!query) return true;
        const descMatch = item.desc.toLowerCase().includes(query);
        const keysMatch = item.keys.some(k => k.toLowerCase().includes(query));
        const noteMatch = item.note ? item.note.toLowerCase().includes(query) : false;
        const catMatch = group.category.toLowerCase().includes(query);
        return descMatch || keysMatch || noteMatch || catMatch;
      });

      if (filteredItems.length === 0) continue;
      totalMatches += filteredItems.length;

      const groupEl = document.createElement('div');
      groupEl.className = 'shortcut-category';

      const titleEl = document.createElement('div');
      titleEl.className = 'shortcut-category-title';
      titleEl.textContent = group.category;
      groupEl.appendChild(titleEl);

      const tableEl = document.createElement('div');
      tableEl.className = 'shortcut-table';

      for (const item of filteredItems) {
        const rowEl = document.createElement('div');
        rowEl.className = 'shortcut-row';

        const descEl = document.createElement('div');
        descEl.className = 'shortcut-desc';
        descEl.innerHTML = `
          <span>${item.desc}</span>
          ${item.note ? `<span class="shortcut-note">(${item.note})</span>` : ''}
        `;

        const keysEl = document.createElement('div');
        keysEl.className = 'shortcut-keys';

        item.keys.forEach((key, idx) => {
          if (idx > 0) {
            const plusEl = document.createElement('span');
            plusEl.className = 'shortcut-key-plus';
            plusEl.textContent = '+';
            keysEl.appendChild(plusEl);
          }
          const badgeEl = document.createElement('span');
          badgeEl.className = 'shortcut-key-badge';
          badgeEl.textContent = key;
          keysEl.appendChild(badgeEl);
        });

        rowEl.appendChild(descEl);
        rowEl.appendChild(keysEl);
        tableEl.appendChild(rowEl);
      }

      groupEl.appendChild(tableEl);
      this.shortcutsBody.appendChild(groupEl);
    }

    if (totalMatches === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'shortcuts-empty';
      emptyEl.textContent = `「${filterQuery}」に一致するショートカットは見つかりませんでした。`;
      this.shortcutsBody.appendChild(emptyEl);
    }
  }
}

const SHORTCUTS_DATA = [
  {
    category: 'ファイル & タブ操作',
    items: [
      { desc: '新規タブ作成', keys: ['Ctrl', 'N'] },
      { desc: 'ファイルを開く', keys: ['Ctrl', 'O'] },
      { desc: '上書き保存', keys: ['Ctrl', 'S'] },
      { desc: '名前を付けて保存', keys: ['Ctrl', 'Shift', 'S'] },
      { desc: '現在のタブを閉じる', keys: ['Ctrl', 'W'] },
      { desc: '次のタブへ切り替え', keys: ['Ctrl', 'Tab'], note: 'または Ctrl+PageDown' },
      { desc: '前のタブへ切り替え', keys: ['Ctrl', 'Shift', 'Tab'], note: 'または Ctrl+PageUp' }
    ]
  },
  {
    category: '編集 & コーディング支援',
    items: [
      { desc: 'Emmet 展開', keys: ['Tab'], note: '例: ul>li*3 + Tab' },
      { desc: 'タグで囲む (Wrap with Tag)', keys: ['Alt', 'W'] },
      { desc: 'CSSクイック編集 (Quick Edit)', keys: ['Ctrl', 'E'], note: 'クラス/IDのCSSをインライン編集' },
      { desc: 'イメージMAPビジュアルエディター', keys: ['Alt', 'M'], note: '画像の座標範囲指定・mapタグ生成' },
      { desc: 'コード補完・入力候補', keys: ['Ctrl', 'Space'] },
      { desc: '検索', keys: ['Ctrl', 'F'] },
      { desc: '置換', keys: ['Ctrl', 'R'], note: 'または Ctrl+H' },
      { desc: 'すべて置き換え', keys: ['Ctrl', 'Alt', 'Enter'], note: '置換入力時に一括実行' },
      { desc: '行コメントの切り替え', keys: ['Ctrl', '/'] },
      { desc: '元に戻す (Undo)', keys: ['Ctrl', 'Z'] },
      { desc: 'やり直す (Redo)', keys: ['Ctrl', 'Y'], note: 'または Ctrl+Shift+Z' },
      { desc: '行の複製', keys: ['Shift', 'Alt', '↓'] },
      { desc: '行の上下移動', keys: ['Alt', '↑ / ↓'] }
    ]
  },
  {
    category: '画面表示 & レイアウト切替',
    items: [
      { desc: '左右分割 (Horizontal)', keys: ['Ctrl', '1'] },
      { desc: '上下分割 (Vertical)', keys: ['Ctrl', '2'] },
      { desc: 'エディタのみ全画面', keys: ['Ctrl', '3'] },
      { desc: 'プレビューのみ全画面', keys: ['Ctrl', '4'] },
      { desc: 'ショートカットキー一覧', keys: ['F1'] }
    ]
  }
];

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
