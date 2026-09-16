/**
 * tag-matcher.js
 * HTML開始タグ・閉じタグのペアジャンプ & タグ整合性チェック機能
 * - 閉じタグから開始タグへジャンプ (Alt+J / Ctrl+Shift+\)
 * - 開始タグから閉じタグへジャンプ (双方向トグル)
 * - 開始タグと閉じタグの過不足・整合性チェック (F7)
 * - エディタマーカー (赤波線) & 結果パネル一覧表示
 */

import { monaco } from '../monaco-setup.js';

// HTML5 Void要素 (終了タグを持たない自律要素)
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * HTML文字列を字句解析し、タグトークンのリストを生成
 * (コメント、スクリプト、スタイル、属性値クォートを適切に除外)
 */
export function tokenizeHtmlTags(html) {
  const tokens = [];
  const len = html.length;
  let i = 0;
  let line = 1;
  let col = 1;

  while (i < len) {
    const ch = html[i];

    // 改行の追跡
    if (ch === '\n') {
      line++;
      col = 1;
      i++;
      continue;
    }
    if (ch === '\r') {
      if (html[i + 1] === '\n') {
        i++;
      }
      line++;
      col = 1;
      i++;
      continue;
    }

    // HTMLコメント <!-- ... -->
    if (html.startsWith('<!--', i)) {
      const endIdx = html.indexOf('-->', i + 4);
      const skipTo = endIdx !== -1 ? endIdx + 3 : len;
      // 改行を数えながらスキップ
      while (i < skipTo) {
        if (html[i] === '\n') { line++; col = 1; }
        else { col++; }
        i++;
      }
      continue;
    }

    // DOCTYPE や CDATA 等 <! ... >
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      const endIdx = html.indexOf('>', i + 2);
      const skipTo = endIdx !== -1 ? endIdx + 1 : len;
      while (i < skipTo) {
        if (html[i] === '\n') { line++; col = 1; }
        else { col++; }
        i++;
      }
      continue;
    }

    // タグの開始 '<'
    if (ch === '<') {
      const tagStartOffset = i;
      const tagStartLine = line;
      const tagStartCol = col;

      i++;
      col++;

      const isClosing = html[i] === '/';
      if (isClosing) {
        i++;
        col++;
      }

      // タグ名の抽出
      const nameStart = i;
      while (i < len && /[a-zA-Z0-9:-]/.test(html[i])) {
        i++;
        col++;
      }
      const tagName = html.slice(nameStart, i).toLowerCase();

      if (!tagName) {
        // タグ名がない場合は通常の文字として次へ
        continue;
      }

      // 属性および '>' の走査 (引用符内の '>' を無視)
      let inQuote = null;
      let isSelfClosing = false;

      while (i < len) {
        const c = html[i];
        if (c === '\n') {
          line++;
          col = 1;
          i++;
          continue;
        }

        if (inQuote) {
          if (c === inQuote) {
            inQuote = null;
          }
        } else {
          if (c === '"' || c === "'") {
            inQuote = c;
          } else if (c === '/' && html[i + 1] === '>') {
            isSelfClosing = true;
          } else if (c === '>') {
            i++;
            col++;
            break;
          }
        }
        col++;
        i++;
      }

      const tagEndOffset = i;
      const raw = html.slice(tagStartOffset, tagEndOffset);

      // Void要素は自律終了としてマーク
      if (VOID_ELEMENTS.has(tagName)) {
        isSelfClosing = true;
      }

      const token = {
        type: isClosing ? 'close' : isSelfClosing ? 'self-closing' : 'open',
        tagName,
        startOffset: tagStartOffset,
        endOffset: tagEndOffset,
        startLine: tagStartLine,
        startCol: tagStartCol,
        endLine: line,
        endCol: col,
        raw
      };

      tokens.push(token);

      // <script> や <style> の場合、対応する </script> / </style> まで中身をスキップ
      if (token.type === 'open' && (tagName === 'script' || tagName === 'style')) {
        const closeTagStr = `</${tagName}`;
        let closeIdx = -1;
        let searchPos = i;
        while (searchPos < len) {
          const found = html.toLowerCase().indexOf(closeTagStr, searchPos);
          if (found === -1) break;
          closeIdx = found;
          break;
        }

        if (closeIdx !== -1) {
          while (i < closeIdx) {
            if (html[i] === '\n') { line++; col = 1; }
            else { col++; }
            i++;
          }
        }
      }

      continue;
    }

    col++;
    i++;
  }

  return tokens;
}

/**
 * タグジャンプおよび整合性検証マネージャー
 */
export class TagMatcher {
  constructor(app) {
    this.app = app;
    this.decorations = [];
    this.initUI();
  }

  initUI() {
    this.resultPanel = document.getElementById('tagIntegrityPanel');
    this.resultList = document.getElementById('tagIntegrityList');
    this.resultSummary = document.getElementById('tagIntegritySummary');
    this.closeBtn = document.getElementById('tagIntegrityCloseBtn');
    this.checkToolbarBtn = document.getElementById('checkTagIntegrityBtn');

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => {
        this.hideResultPanel();
      });
    }

    if (this.checkToolbarBtn) {
      this.checkToolbarBtn.addEventListener('click', () => {
        this.checkTagIntegrity();
      });
    }
  }

  /**
   * カーソル位置のタグから対応するペアタグへジャンプ
   */
  jumpToMatchingTag() {
    const editor = this.app.editor;
    if (!editor) return false;

    const model = editor.getModel();
    if (!model) return false;

    const pos = editor.getPosition();
    if (!pos) return false;

    const offset = model.getOffsetAt(pos);
    const text = model.getValue();
    const tokens = tokenizeHtmlTags(text);

    // 1. カーソルが直接タグ上にあるか判定
    let activeIndex = tokens.findIndex((t) => offset >= t.startOffset && offset <= t.endOffset);

    // タグ境界または直前にカーソルがある場合の微調整
    if (activeIndex === -1) {
      activeIndex = tokens.findIndex(
        (t) => Math.abs(offset - t.startOffset) <= 1 || Math.abs(offset - t.endOffset) <= 1
      );
    }

    // タグ外の場合、カーソルを囲む親の開始タグまたは最も近いタグを探す
    if (activeIndex === -1) {
      // 直前にあるタグ
      for (let i = tokens.length - 1; i >= 0; i--) {
        if (tokens[i].endOffset <= offset) {
          activeIndex = i;
          break;
        }
      }
    }

    if (activeIndex === -1) {
      this.showToast('カーソル付近に対応するタグが見つかりませんでした');
      return false;
    }

    const currentToken = tokens[activeIndex];

    if (currentToken.type === 'self-closing') {
      this.showToast(`自律終了タグ <${currentToken.tagName}> のため対応する閉じタグはありません`);
      this.highlightToken(currentToken);
      return true;
    }

    // 2. 閉じタグ -> 開始タグ へのジャンプ
    if (currentToken.type === 'close') {
      let depth = 0;
      let targetToken = null;

      for (let i = activeIndex - 1; i >= 0; i--) {
        const t = tokens[i];
        if (t.tagName === currentToken.tagName) {
          if (t.type === 'close') {
            depth++;
          } else if (t.type === 'open') {
            if (depth === 0) {
              targetToken = t;
              break;
            } else {
              depth--;
            }
          }
        }
      }

      if (targetToken) {
        this.jumpToToken(targetToken, `開始タグ <${targetToken.tagName}> へジャンプ`);
        return true;
      } else {
        this.showToast(`対応する開始タグ <${currentToken.tagName}> が見つかりません (閉じタグ過剰)`);
        return false;
      }
    }

    // 3. 開始タグ -> 閉じタグ へのジャンプ
    if (currentToken.type === 'open') {
      let depth = 0;
      let targetToken = null;

      for (let i = activeIndex + 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.tagName === currentToken.tagName) {
          if (t.type === 'open') {
            depth++;
          } else if (t.type === 'close') {
            if (depth === 0) {
              targetToken = t;
              break;
            } else {
              depth--;
            }
          }
        }
      }

      if (targetToken) {
        this.jumpToToken(targetToken, `閉じタグ </${targetToken.tagName}> へジャンプ`);
        return true;
      } else {
        this.showToast(`対応する閉じタグ </${currentToken.tagName}> が見つかりません (未終了タグ)`);
        return false;
      }
    }

    return false;
  }

  jumpToToken(token, msg = '') {
    const editor = this.app.editor;
    if (!editor) return;

    editor.setPosition({ lineNumber: token.startLine, column: token.startCol });
    editor.revealPositionInCenter({ lineNumber: token.startLine, column: token.startCol });
    editor.focus();

    this.highlightToken(token);
    if (msg) {
      this.showToast(msg);
    }
  }

  highlightToken(token) {
    const editor = this.app.editor;
    if (!editor) return;

    const range = new monaco.Range(token.startLine, token.startCol, token.endLine, token.endCol);

    this.decorations = editor.deltaDecorations(this.decorations, [
      {
        range,
        options: {
          className: 'tag-jump-highlight',
          isWholeLine: false
        }
      }
    ]);

    // 1.5秒後にハイライト消去
    setTimeout(() => {
      this.decorations = editor.deltaDecorations(this.decorations, []);
    }, 1500);
  }

  /**
   * 開始タグと閉じタグの整合性チェック (過不足・未終了・ネスト異常の検査)
   */
  checkTagIntegrity() {
    const editor = this.app.editor;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const tokens = tokenizeHtmlTags(text);

    const errors = [];
    const stack = [];

    // ループ走査
    for (const token of tokens) {
      if (token.type === 'open') {
        stack.push(token);
      } else if (token.type === 'close') {
        if (stack.length === 0) {
          // スタックが空なのに閉じタグが出現：余分な閉じタグ
          errors.push({
            id: `err-${errors.length + 1}`,
            type: 'extra_close',
            token,
            tagName: token.tagName,
            lineNumber: token.startLine,
            column: token.startCol,
            message: `対応する開始タグが存在しない余分な閉じタグです: </${token.tagName}>`
          });
          continue;
        }

        const top = stack[stack.length - 1];
        if (top.tagName === token.tagName) {
          // 正常マッチ
          stack.pop();
        } else {
          // タグ不一致：スタック内に該当する開始タグがあるか遡って探索
          let foundIndex = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tagName === token.tagName) {
              foundIndex = i;
              break;
            }
          }

          if (foundIndex !== -1) {
            // 見つかった位置より上のスタック要素は「閉じられていない開始タグ」
            for (let i = stack.length - 1; i > foundIndex; i--) {
              const unclosed = stack[i];
              errors.push({
                id: `err-${errors.length + 1}`,
                type: 'unclosed',
                token: unclosed,
                tagName: unclosed.tagName,
                lineNumber: unclosed.startLine,
                column: unclosed.startCol,
                message: `閉じタグが見つかりません (未終了の開始タグ): <${unclosed.tagName}>`
              });
            }
            // 該当位置まで pop
            stack.splice(foundIndex);
          } else {
            // スタック内に開始タグが全くない：余剰閉じタグ
            errors.push({
              id: `err-${errors.length + 1}`,
              type: 'extra_close',
              token,
              tagName: token.tagName,
              lineNumber: token.startLine,
              column: token.startCol,
              message: `対応する開始タグが存在しない余分な閉じタグです: </${token.tagName}>`
            });
          }
        }
      }
    }

    // 全文終了後、スタックに残っているタグはすべて未終了タグ
    while (stack.length > 0) {
      const unclosed = stack.pop();
      errors.push({
        id: `err-${errors.length + 1}`,
        type: 'unclosed',
        token: unclosed,
        tagName: unclosed.tagName,
        lineNumber: unclosed.startLine,
        column: unclosed.startCol,
        message: `閉じタグが見つかりません (未終了の開始タグ): <${unclosed.tagName}>`
      });
    }

    // 行番号昇順にソート
    errors.sort((a, b) => a.lineNumber - b.lineNumber || a.column - b.column);

    // Monaco マーカー (エディタの赤波線) を設定
    this.updateMonacoMarkers(model, errors);

    // 結果パネルに表示
    this.renderResults(errors);
  }

  updateMonacoMarkers(model, errors) {
    const markers = errors.map((err) => {
      const token = err.token;
      return {
        severity: monaco.MarkerSeverity.Error,
        message: err.message,
        startLineNumber: token.startLine,
        startColumn: token.startCol,
        endLineNumber: token.endLine,
        endColumn: token.endCol,
        source: 'HTMLタグ整合性チェック'
      };
    });

    monaco.editor.setModelMarkers(model, 'html-tag-validator', markers);
  }

  renderResults(errors) {
    if (!this.resultPanel || !this.resultList || !this.resultSummary) return;

    this.resultList.innerHTML = '';

    if (errors.length === 0) {
      this.resultSummary.innerHTML = `
        <span class="integrity-status-ok">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
          </svg>
          すべてのタグの整合性が保たれています（不整合エラー: 0件）
        </span>
      `;
      const okItem = document.createElement('div');
      okItem.className = 'tag-integrity-empty';
      okItem.textContent = '閉じタグの過不足や未終了タグは見つかりませんでした。HTMLの構造は正常です。';
      this.resultList.appendChild(okItem);
    } else {
      const unclosedCount = errors.filter((e) => e.type === 'unclosed').length;
      const extraCount = errors.filter((e) => e.type === 'extra_close').length;

      this.resultSummary.innerHTML = `
        <span class="integrity-status-error">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
          </svg>
          タグ不整合を <strong>${errors.length}件</strong> 検出しました
          (未終了タグ: ${unclosedCount}件 / 余剰閉じタグ: ${extraCount}件)
        </span>
      `;

      for (const err of errors) {
        const item = document.createElement('div');
        item.className = `tag-integrity-item is-${err.type}`;

        const badgeText = err.type === 'unclosed' ? '未終了タグ' : '余分な閉じタグ';
        const rawSnippet = err.token.raw.length > 50 ? `${err.token.raw.slice(0, 47)}...` : err.token.raw;

        item.innerHTML = `
          <div class="integrity-item-header">
            <span class="integrity-badge badge-${err.type}">${badgeText}</span>
            <span class="integrity-pos">行 ${err.lineNumber}, 列 ${err.column}</span>
            <code class="integrity-code">${this.escapeHtml(rawSnippet)}</code>
          </div>
          <div class="integrity-item-desc">${this.escapeHtml(err.message)}</div>
        `;

        item.addEventListener('click', () => {
          this.jumpToToken(err.token);
        });

        this.resultList.appendChild(item);
      }
    }

    this.showResultPanel();
  }

  showResultPanel() {
    if (!this.resultPanel) return;
    this.resultPanel.classList.add('is-open');
    this.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  hideResultPanel() {
    if (!this.resultPanel) return;
    this.resultPanel.classList.remove('is-open');
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
