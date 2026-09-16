/**
 * multiline-find-replace.js
 * 複数行対応の高度な検索・置換パネル
 * - 複数行テキストエリアによるブロック単位の検索・置換
 * - 大文字・小文字区別、単語単位、正規表現、改行差異(CRLF/LF)自動吸収
 * - 次を検索 / 前を検索 / 置換 / すべて置換 (Undo/Redo完全対応)
 * - マッチ一覧プレビュー & ダイレクトジャンプ
 */

import { monaco } from '../monaco-setup.js';

export class MultilineFindReplace {
  constructor(app) {
    this.app = app;
    this.matches = [];
    this.currentIndex = -1;
    this.decorations = [];
    this.initUI();
  }

  initUI() {
    this.panel = document.getElementById('multilineFindReplacePanel');
    if (!this.panel) return;

    this.searchInput = document.getElementById('mfrSearchInput');
    this.replaceInput = document.getElementById('mfrReplaceInput');

    this.optCase = document.getElementById('mfrOptCase');
    this.optWord = document.getElementById('mfrOptWord');
    this.optRegex = document.getElementById('mfrOptRegex');

    this.btnFindNext = document.getElementById('mfrBtnFindNext');
    this.btnFindPrev = document.getElementById('mfrBtnFindPrev');
    this.btnReplace = document.getElementById('mfrBtnReplace');
    this.btnReplaceAll = document.getElementById('mfrBtnReplaceAll');
    this.btnClose = document.getElementById('mfrBtnClose');
    this.matchCountEl = document.getElementById('mfrMatchCount');

    this.matchListToggle = document.getElementById('mfrToggleMatchList');
    this.matchListContainer = document.getElementById('mfrMatchListContainer');
    this.matchList = document.getElementById('mfrMatchList');

    // パネルヘッダーのドラッグ移動
    this.initDraggable();

    // イベント設定
    this.btnClose?.addEventListener('click', () => this.hide());
    this.btnFindNext?.addEventListener('click', () => this.findNext());
    this.btnFindPrev?.addEventListener('click', () => this.findPrevious());
    this.btnReplace?.addEventListener('click', () => this.replaceCurrent());
    this.btnReplaceAll?.addEventListener('click', () => this.replaceAll());

    // 入力変化時の自動再検索 (デバウンス)
    let searchDebounceTimer = null;
    const triggerSearch = () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        this.updateSearch();
      }, 150);
    };

    this.searchInput?.addEventListener('input', triggerSearch);
    this.optCase?.addEventListener('change', triggerSearch);
    this.optWord?.addEventListener('change', triggerSearch);
    this.optRegex?.addEventListener('change', triggerSearch);

    // テキストエリアでの Tab キー入力およびショートカット
    [this.searchInput, this.replaceInput].forEach((textarea) => {
      if (!textarea) return;
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          triggerSearch();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.findNext();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.hide();
        }
      });
    });

    // マッチ一覧トグル
    if (this.matchListToggle && this.matchListContainer) {
      this.matchListToggle.addEventListener('click', () => {
        const isOpen = this.matchListContainer.classList.toggle('is-open');
        this.matchListToggle.classList.toggle('active', isOpen);
        if (isOpen) {
          this.renderMatchList();
        }
      });
    }
  }

  initDraggable() {
    const header = document.getElementById('mfrHeader');
    if (!header || !this.panel) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = this.panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      // fixed 配置用の初期座標セット
      this.panel.style.right = 'auto';
      this.panel.style.left = `${initialLeft}px`;
      this.panel.style.top = `${initialTop}px`;

      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    header.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = Math.max(10, Math.min(window.innerWidth - this.panel.offsetWidth - 10, initialLeft + dx));
      const newTop = Math.max(40, Math.min(window.innerHeight - this.panel.offsetHeight - 10, initialTop + dy));

      this.panel.style.left = `${newLeft}px`;
      this.panel.style.top = `${newTop}px`;
    });

    const stopDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        header.releasePointerCapture(e.pointerId);
      } catch {}
    };

    header.addEventListener('pointerup', stopDrag);
    header.addEventListener('pointercancel', stopDrag);
  }

  show() {
    if (!this.panel) return;
    this.panel.classList.add('is-open');

    // 選択テキストがあれば検索フィールドに初期セット
    const editor = this.app.editor;
    if (editor) {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const model = editor.getModel();
        const selectedText = model.getValueInRange(selection);
        if (selectedText && selectedText.length < 2000 && this.searchInput) {
          this.searchInput.value = selectedText;
        }
      }
    }

    setTimeout(() => {
      this.searchInput?.focus();
      this.searchInput?.select();
      this.updateSearch();
    }, 50);
  }

  hide() {
    if (!this.panel) return;
    this.panel.classList.remove('is-open');
    this.clearDecorations();
    this.app.editor?.focus();
  }

  toggle() {
    if (this.panel?.classList.contains('is-open')) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * 検索クエリに基づいてエディタ内の一致箇所を更新
   */
  updateSearch() {
    const editor = this.app.editor;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const query = this.searchInput ? this.searchInput.value : '';
    if (!query) {
      this.matches = [];
      this.currentIndex = -1;
      this.updateMatchCount();
      this.clearDecorations();
      this.renderMatchList();
      return;
    }

    const isCase = this.optCase?.checked || false;
    const isWord = this.optWord?.checked || false;
    const isRegex = this.optRegex?.checked || false;

    let regex = null;
    try {
      if (isRegex) {
        // 正規表現モード (マルチライン 'm', グローバル 'g', 's' flag等)
        const flags = `g${isCase ? '' : 'i'}m`;
        regex = new RegExp(query, flags);
      } else {
        // 通常文字列モード: 改行コード(CRLF / LF)の差を吸収するため正規表現化
        let escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // \r\n, \r, \n のどれでもマッチするように正規化
        escaped = escaped.replace(/\r\n|\r|\n/g, '(?:\\r\\n|\\r|\\n)');
        if (isWord) {
          escaped = `\\b${escaped}\\b`;
        }
        const flags = `g${isCase ? '' : 'i'}`;
        regex = new RegExp(escaped, flags);
      }
    } catch (e) {
      this.matches = [];
      this.currentIndex = -1;
      if (this.matchCountEl) {
        this.matchCountEl.textContent = '正規表現エラー';
        this.matchCountEl.className = 'mfr-match-count error';
      }
      this.clearDecorations();
      return;
    }

    const fullText = model.getValue();
    const matches = [];
    let m;

    while ((m = regex.exec(fullText)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      const startOffset = m.index;
      const endOffset = startOffset + m[0].length;
      const startPos = model.getPositionAt(startOffset);
      const endPos = model.getPositionAt(endOffset);

      matches.push({
        range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        text: m[0],
        startOffset,
        endOffset
      });

      // 検索上限 (過度なパフォーマンス低下防止)
      if (matches.length >= 5000) break;
    }

    this.matches = matches;

    // 現在のカーソル位置に最も近いマッチを選択
    const currentPos = editor.getPosition();
    if (matches.length > 0) {
      let closestIdx = 0;
      if (currentPos) {
        const curOffset = model.getOffsetAt(currentPos);
        let minDiff = Infinity;
        matches.forEach((item, idx) => {
          const diff = Math.abs(item.startOffset - curOffset);
          if (diff < minDiff) {
            minDiff = diff;
            closestIdx = idx;
          }
        });
      }
      this.currentIndex = closestIdx;
    } else {
      this.currentIndex = -1;
    }

    this.updateMatchCount();
    this.highlightMatches();
    this.renderMatchList();
  }

  updateMatchCount() {
    if (!this.matchCountEl) return;
    this.matchCountEl.className = 'mfr-match-count';
    if (this.matches.length === 0) {
      this.matchCountEl.textContent = this.searchInput?.value ? '一致なし' : '';
    } else {
      this.matchCountEl.textContent = `${this.currentIndex + 1} / ${this.matches.length} 件`;
    }
  }

  highlightMatches() {
    const editor = this.app.editor;
    if (!editor) return;

    const newDecorations = this.matches.map((item, idx) => {
      const isCurrent = idx === this.currentIndex;
      return {
        range: item.range,
        options: {
          className: isCurrent ? 'mfr-match-current' : 'mfr-match-all',
          isWholeLine: false,
          overviewRuler: {
            color: isCurrent ? '#f59e0b' : '#3b82f6',
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      };
    });

    this.decorations = editor.deltaDecorations(this.decorations, newDecorations);
  }

  clearDecorations() {
    const editor = this.app.editor;
    if (!editor) return;
    this.decorations = editor.deltaDecorations(this.decorations, []);
  }

  findNext() {
    if (this.matches.length === 0) {
      this.updateSearch();
      if (this.matches.length === 0) return;
    }

    this.currentIndex = (this.currentIndex + 1) % this.matches.length;
    this.revealCurrentMatch();
  }

  findPrevious() {
    if (this.matches.length === 0) {
      this.updateSearch();
      if (this.matches.length === 0) return;
    }

    this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
    this.revealCurrentMatch();
  }

  revealCurrentMatch() {
    if (this.currentIndex < 0 || this.currentIndex >= this.matches.length) return;
    const match = this.matches[this.currentIndex];
    const editor = this.app.editor;
    if (!editor) return;

    editor.setSelection(match.range);
    editor.revealRangeInCenterIfOutsideViewport(match.range);
    this.updateMatchCount();
    this.highlightMatches();
  }

  /**
   * 現在の一致箇所を置換
   */
  replaceCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.matches.length) {
      this.findNext();
      if (this.currentIndex < 0 || this.currentIndex >= this.matches.length) return;
    }

    const editor = this.app.editor;
    if (!editor) return;

    const match = this.matches[this.currentIndex];
    const replaceText = this.getResolvedReplaceText(match.text);

    editor.executeEdits('multiline-replace', [
      {
        range: match.range,
        text: replaceText,
        forceMoveMarkers: true
      }
    ]);

    // 置換後に再検索し、次の一致へ進む
    this.updateSearch();
    if (this.matches.length > 0) {
      if (this.currentIndex >= this.matches.length) {
        this.currentIndex = 0;
      }
      this.revealCurrentMatch();
    }
  }

  /**
   * ドキュメント全体の一致箇所を一括置換
   */
  replaceAll() {
    const editor = this.app.editor;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    this.updateSearch();
    if (this.matches.length === 0) {
      this.showToast('置換対象の一致箇所が見つかりませんでした');
      return;
    }

    const count = this.matches.length;
    const edits = this.matches.map((match) => ({
      range: match.range,
      text: this.getResolvedReplaceText(match.text),
      forceMoveMarkers: true
    }));

    // executeEdits により一括実行（Ctrl+Z 1回でアンドゥ可能）
    editor.executeEdits('multiline-replace-all', edits);

    this.updateSearch();
    this.showToast(`${count}件の一致箇所を置換しました`);
  }

  getResolvedReplaceText(matchedText) {
    let replaceStr = this.replaceInput ? this.replaceInput.value : '';
    const isRegex = this.optRegex?.checked || false;

    if (isRegex) {
      // $1, $2 などのグループ参照の展開サポート
      try {
        const query = this.searchInput ? this.searchInput.value : '';
        const flags = `g${this.optCase?.checked ? '' : 'i'}m`;
        const reg = new RegExp(query, flags);
        replaceStr = matchedText.replace(reg, replaceStr);
      } catch (e) {
        // そのまま置換文字列を使用
      }
    }

    return replaceStr;
  }

  renderMatchList() {
    if (!this.matchListContainer?.classList.contains('is-open') || !this.matchList) return;
    this.matchList.innerHTML = '';

    if (this.matches.length === 0) {
      this.matchList.innerHTML = '<div class="mfr-list-empty">一致箇所はありません</div>';
      return;
    }

    this.matches.forEach((match, idx) => {
      const item = document.createElement('div');
      item.className = 'mfr-list-item';
      if (idx === this.currentIndex) item.classList.add('is-active');

      const snippet = match.text.replace(/\r?\n/g, ' ↵ ');
      const preview = snippet.length > 60 ? `${snippet.slice(0, 57)}...` : snippet;

      item.innerHTML = `
        <span class="mfr-item-line">行 ${match.range.startLineNumber}</span>
        <code class="mfr-item-text">${this.escapeHtml(preview)}</code>
      `;

      item.addEventListener('click', () => {
        this.currentIndex = idx;
        this.revealCurrentMatch();
      });

      this.matchList.appendChild(item);
    });
  }

  showToast(message) {
    let toast = document.getElementById('editorToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'editorToast';
      toast.className = 'editor-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
