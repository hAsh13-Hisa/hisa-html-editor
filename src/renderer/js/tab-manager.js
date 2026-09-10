import { monaco } from './monaco-setup.js';

let tabIdCounter = 1;
let untitledCounter = 1;

const HTML_ICON_SVG = `
<svg class="tab-icon" viewBox="0 0 16 16" fill="currentColor">
  <path d="M4 1h5.5L13 4.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm5 1v3h3L9 2zM5 8v1h6V8H5zm0 2.5v1h6v-1H5z"/>
</svg>
`;

const CLOSE_ICON_SVG = `
<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
  <line x1="3" y1="3" x2="13" y2="13"></line>
  <line x1="13" y1="3" x2="3" y2="13"></line>
</svg>
`;

export class TabManager {
  constructor(editor, callbacks = {}) {
    this.editor = editor;
    this.callbacks = callbacks;
    this.tabs = [];
    this.activeTabId = null;

    this.tabListEl = document.getElementById('tabList');
    this.newTabBtn = document.getElementById('newTabBtn');
    this.dropdownBtn = document.getElementById('tabDropdownBtn');
    this.dropdownMenu = document.getElementById('tabDropdownMenu');

    if (this.newTabBtn) {
      this.newTabBtn.addEventListener('click', () => {
        this.createTab();
      });
    }

    if (this.dropdownBtn) {
      this.dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    // ドロップダウンメニュー外クリックで閉じる
    document.addEventListener('click', (e) => {
      if (this.dropdownMenu && !this.dropdownMenu.contains(e.target) && !this.dropdownBtn?.contains(e.target)) {
        this.closeDropdown();
      }
    });

    // Escキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.dropdownMenu?.classList.contains('is-open')) {
        this.closeDropdown();
      }
    });

    // タブリストのマウスホイールで横スクロール
    if (this.tabListEl) {
      this.tabListEl.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          this.tabListEl.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }
  }

  getActiveTab() {
    return this.tabs.find((t) => t.id === this.activeTabId) || null;
  }

  getTabByPath(filePath) {
    if (!filePath) return null;
    return this.tabs.find((t) => t.filePath === filePath) || null;
  }

  /**
   * 新しいタブを作成
   */
  createTab({
    title = null,
    content = '',
    filePath = null,
    dir = null,
    encoding = 'UTF-8'
  } = {}) {
    const isUntitled = !filePath;
    const tabTitle = title || (isUntitled ? `未保存のファイル ${untitledCounter++}` : 'index.html');
    const id = `tab_${tabIdCounter++}`;

    // Monaco TextModelの作成 (URIを一意にする)
    const uri = monaco.Uri.parse(`inmemory://file/${id}/${encodeURIComponent(tabTitle)}`);
    const model = monaco.editor.createModel(content, 'html', uri);

    const tab = {
      id,
      title: tabTitle,
      filePath,
      dir,
      encoding,
      isModified: false,
      model,
      viewState: null
    };

    // モデル変更リスナー
    model.onDidChangeContent(() => {
      if (!tab._isInternalUpdating) {
        this.markModified(tab.id, true);
        if (this.activeTabId === tab.id) {
          this.callbacks.onContentChange?.(tab);
        }
      }
    });

    this.tabs.push(tab);
    this.renderTabs();
    this.switchTab(tab.id);

    return tab;
  }

  /**
   * タブの切り替え
   */
  switchTab(tabId) {
    const targetTab = this.tabs.find((t) => t.id === tabId);
    if (!targetTab) return;

    if (this.activeTabId === tabId) {
      // 既にアクティブな場合はエディタへフォーカス
      this.editor.focus();
      return;
    }

    // 現在のアクティブタブの表示状態（カーソル・スクロール位置）を保存
    const currentTab = this.getActiveTab();
    if (currentTab && this.editor.getModel() === currentTab.model) {
      currentTab.viewState = this.editor.saveViewState();
    }

    this.activeTabId = tabId;

    // エディタに新しいモデルをセット
    this.editor.setModel(targetTab.model);

    // 保存されていた表示状態を復元
    if (targetTab.viewState) {
      this.editor.restoreViewState(targetTab.viewState);
    }

    this.editor.focus();
    this.renderTabs();

    // コールバック通知
    this.callbacks.onTabSwitch?.(targetTab);
  }

  /**
   * タブを閉じる
   */
  async closeTab(tabId) {
    const tabIndex = this.tabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = this.tabs[tabIndex];

    // 未保存変更がある場合の確認
    if (tab.isModified) {
      const ok = window.confirm(`「${tab.title}」には未保存の変更があります。破棄して閉じますか？`);
      if (!ok) return false;
    }

    const wasActive = this.activeTabId === tabId;

    // モデル解放
    tab.model.dispose();
    this.tabs.splice(tabIndex, 1);

    // 全てのタブが閉じられた場合は新しい空のタブを作成
    if (this.tabs.length === 0) {
      this.callbacks.onAllTabsClosed?.();
      this.createTab({
        content: this.getDefaultHtml()
      });
      return true;
    }

    // 閉じたタブがアクティブだった場合は隣のタブを選択
    if (wasActive) {
      const nextIndex = Math.min(tabIndex, this.tabs.length - 1);
      const nextTab = this.tabs[nextIndex];
      this.activeTabId = null; // リセットして switchTab を強制実行
      this.switchTab(nextTab.id);
    } else {
      this.renderTabs();
    }

    this.callbacks.onTabClose?.(tab);
    return true;
  }

  /**
   * 現在のアクティブタブを閉じる (Ctrl+W)
   */
  closeActiveTab() {
    if (this.activeTabId) {
      return this.closeTab(this.activeTabId);
    }
  }

  /**
   * 次のタブへ切り替え (Ctrl+Tab, Ctrl+PageDown)
   */
  switchNextTab() {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const nextIndex = (currentIndex + 1) % this.tabs.length;
    this.switchTab(this.tabs[nextIndex].id);
  }

  /**
   * 前のタブへ切り替え (Ctrl+Shift+Tab, Ctrl+PageUp)
   */
  switchPrevTab() {
    if (this.tabs.length <= 1) return;
    const currentIndex = this.tabs.findIndex((t) => t.id === this.activeTabId);
    const prevIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
    this.switchTab(this.tabs[prevIndex].id);
  }

  /**
   * 変更状態のマーク
   */
  markModified(tabId, isModified) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.isModified !== isModified) {
      tab.isModified = isModified;
      this.updateTabElementState(tab);
      if (this.isDropdownOpen()) {
        this.renderDropdownMenu();
      }
      this.callbacks.onModifiedChange?.(tab);
    }
  }

  /**
   * 保存後のファイル情報更新
   */
  updateTabFileInfo(tabId, { title, filePath, dir, encoding }) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (title !== undefined) tab.title = title;
    if (filePath !== undefined) tab.filePath = filePath;
    if (dir !== undefined) tab.dir = dir;
    if (encoding !== undefined) tab.encoding = encoding;
    tab.isModified = false;

    this.renderTabs();
    this.callbacks.onTabInfoUpdated?.(tab);
  }

  /**
   * タブバーのDOM再描画
   */
  renderTabs() {
    if (!this.tabListEl) return;
    this.tabListEl.innerHTML = '';

    for (const tab of this.tabs) {
      const tabEl = document.createElement('div');
      tabEl.className = `tab-item${tab.id === this.activeTabId ? ' active' : ''}${tab.isModified ? ' is-modified' : ''}`;
      tabEl.dataset.tabId = tab.id;
      tabEl.title = tab.filePath || tab.title;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', String(tab.id === this.activeTabId));

      tabEl.innerHTML = `
        ${HTML_ICON_SVG}
        <span class="tab-title">${this.escapeHtml(tab.title)}</span>
        <button type="button" class="tab-close-btn" title="閉じる" aria-label="${tab.title}を閉じる">
          ${CLOSE_ICON_SVG}
        </button>
      `;

      // クリックで切り替え
      tabEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close-btn')) {
          this.switchTab(tab.id);
        }
      });

      // マウス中クリックでタブを閉じる
      tabEl.addEventListener('auxclick', (e) => {
        if (e.button === 1) { // 中クリック
          e.preventDefault();
          this.closeTab(tab.id);
        }
      });

      // 閉じるボタン
      const closeBtn = tabEl.querySelector('.tab-close-btn');
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });

      this.tabListEl.appendChild(tabEl);

      // アクティブタブを視界内へスクロール
      if (tab.id === this.activeTabId) {
        tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }

    if (this.isDropdownOpen()) {
      this.renderDropdownMenu();
    }
  }

  /**
   * 特定のタブの変更状態クラスのみを高速更新
   */
  updateTabElementState(tab) {
    if (!this.tabListEl) return;
    const tabEl = this.tabListEl.querySelector(`[data-tab-id="${tab.id}"]`);
    if (tabEl) {
      tabEl.classList.toggle('is-modified', tab.isModified);
    }
  }

  /* ドロップダウンメニュー制御 */

  isDropdownOpen() {
    return this.dropdownMenu?.classList.contains('is-open') || false;
  }

  toggleDropdown() {
    if (this.isDropdownOpen()) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    if (!this.dropdownMenu) return;
    this.renderDropdownMenu();
    this.dropdownMenu.classList.add('is-open');
    this.dropdownBtn?.setAttribute('aria-expanded', 'true');
    const activeItem = this.dropdownMenu.querySelector('.tab-dropdown-item.active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  closeDropdown() {
    if (!this.dropdownMenu) return;
    this.dropdownMenu.classList.remove('is-open');
    this.dropdownBtn?.setAttribute('aria-expanded', 'false');
  }

  renderDropdownMenu() {
    if (!this.dropdownMenu) return;
    this.dropdownMenu.innerHTML = '';

    // ヘッダー（件数表示）
    const headerEl = document.createElement('div');
    headerEl.className = 'tab-dropdown-header';
    headerEl.innerHTML = `
      <span>開いているタブ</span>
      <span class="tab-dropdown-count">${this.tabs.length} 件</span>
    `;
    this.dropdownMenu.appendChild(headerEl);

    // 各タブアイテム
    for (const tab of this.tabs) {
      const itemEl = document.createElement('div');
      itemEl.className = `tab-dropdown-item${tab.id === this.activeTabId ? ' active' : ''}${tab.isModified ? ' is-modified' : ''}`;
      itemEl.setAttribute('role', 'menuitem');

      // ディレクトリ名ヒント
      let dirHint = '';
      if (tab.dir) {
        const parts = tab.dir.replace(/\\/g, '/').split('/');
        dirHint = parts[parts.length - 1] || tab.dir;
      }

      itemEl.innerHTML = `
        ${HTML_ICON_SVG}
        <span class="tab-dropdown-item-title" title="${this.escapeHtml(tab.filePath || tab.title)}">${this.escapeHtml(tab.title)}</span>
        ${dirHint ? `<span class="tab-dropdown-item-path" title="${this.escapeHtml(tab.dir)}">${this.escapeHtml(dirHint)}</span>` : ''}
        <button type="button" class="tab-dropdown-close-btn" title="閉じる" aria-label="${tab.title}を閉じる">
          ${CLOSE_ICON_SVG}
        </button>
      `;

      // クリックで切り替え
      itemEl.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-dropdown-close-btn')) {
          this.switchTab(tab.id);
          this.closeDropdown();
        }
      });

      // 閉じるボタン
      const closeBtn = itemEl.querySelector('.tab-dropdown-close-btn');
      closeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.closeTab(tab.id);
      });

      this.dropdownMenu.appendChild(itemEl);
    }
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getDefaultHtml() {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>新規ドキュメント</title>
</head>
<body>
  
</body>
</html>`;
  }
}
