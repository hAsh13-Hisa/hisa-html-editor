import { monaco } from './monaco-setup.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

// プレビューiframe内で動作する連動スクリプト（インライン注入用）
const PREVIEW_BRIDGE_CODE = `
(() => {
  const HIGHLIGHT_CLASS = 'preview-selection-highlight';

  const ensureStyle = () => {
    if (document.getElementById('preview-selection-style')) return;
    const style = document.createElement('style');
    style.id = 'preview-selection-style';
    style.textContent = \`
      .\${HIGHLIGHT_CLASS} {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 1px !important;
        background-color: rgba(59, 130, 246, 0.12) !important;
        transition: outline 0.15s ease, background-color 0.15s ease;
      }
      .\${HIGHLIGHT_CLASS} * {
        pointer-events: none;
      }
    \`;
    (document.head || document.documentElement).appendChild(style);
  };

  const findTarget = (node) => {
    let current = node;
    while (current && !current.dataset?.sourceId) {
      current = current.parentElement;
    }
    return current ?? null;
  };

  const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const dispatchSelection = (target) => {
    const startLine = toNumberOrNull(target.dataset.sourceStartLine);
    const startCh = toNumberOrNull(target.dataset.sourceStartCh);
    const endLine = toNumberOrNull(target.dataset.sourceEndLine);
    const endCh = toNumberOrNull(target.dataset.sourceEndCh);

    if ([startLine, startCh, endLine, endCh].some((v) => v === null)) return;

    window.parent.postMessage(
      {
        type: 'preview-source-select',
        sourceId: target.dataset.sourceId,
        startLine,
        startCh,
        endLine,
        endCh
      },
      '*'
    );
  };

  const handlePointer = (event) => {
    const target = findTarget(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchSelection(target);
  };

  document.addEventListener('click', handlePointer, true);
  document.addEventListener('auxclick', handlePointer, true);

  const neutralizeInteractiveElements = () => {
    try {
      Object.defineProperty(window, 'open', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => null
      });
    } catch (e) {
      window.open = () => null;
    }

    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
      anchor.dataset.originalHref = anchor.getAttribute('href') ?? '';
      anchor.setAttribute('href', '#');
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.removeAttribute('target');
    });

    const forms = document.querySelectorAll('form');
    forms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
      form.setAttribute('action', '#');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', neutralizeInteractiveElements, { once: true });
  } else {
    neutralizeInteractiveElements();
  }

  ensureStyle();

  let currentHighlightedElement = null;

  const escapeSelector = (value) => {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\\\"');
  };

  const clearHighlight = () => {
    if (currentHighlightedElement) {
      currentHighlightedElement.classList.remove(HIGHLIGHT_CLASS);
      currentHighlightedElement = null;
    }
  };

  const highlightElementById = (sourceId) => {
    clearHighlight();
    if (!sourceId) return;
    const element = document.querySelector(\`[data-source-id="\${escapeSelector(sourceId)}"]\`);
    if (!element) return;
    element.classList.add(HIGHLIGHT_CLASS);
    currentHighlightedElement = element;
    try {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch (e) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.type !== 'source-preview-highlight') return;
    if (!data.sourceId) {
      clearHighlight();
      return;
    }
    highlightElementById(String(data.sourceId));
  });
})();
`;

export class PreviewSync {
  constructor(editor, previewIframe) {
    this.editor = editor;
    this.preview = previewIframe;
    this.metadataList = [];
    this.serverPort = 0;
    this.setupMessageListener();
  }

  setServerPort(port) {
    this.serverPort = port;
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== this.preview.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== 'preview-source-select') return;

      const startLine = Number(data.startLine);
      const startCh = Number(data.startCh);
      const endLine = Number(data.endLine);
      const endCh = Number(data.endCh);

      if ([startLine, startCh, endLine, endCh].some((v) => !Number.isFinite(v))) {
        return;
      }

      // Monaco Editorの選択範囲を更新（Monacoは1-indexed）
      const range = new monaco.Range(startLine + 1, startCh + 1, endLine + 1, endCh + 1);
      this.editor.focus();
      this.editor.setSelection(range);
      this.editor.revealRangeInCenter(range);
    });
  }

  /**
   * HTMLにdata-source-*属性を付加してプレビュー用HTMLを作成
   */
  annotateHtmlWithSource(source) {
    if (!source) return '';

    // 巨大ファイル（300KB以上）は連動アノテーションの過負荷・フリーズを防ぐためスキップ
    if (source.length > 300000) {
      this.metadataList = [];
      return source;
    }

    const elementRanges = [];
    try {
      const lineOffsets = [0];
      for (let i = 0; i < source.length; i++) {
        if (source.charCodeAt(i) === 10) lineOffsets.push(i + 1);
      }

      const indexToPos = (idx) => {
        let low = 0;
        let high = lineOffsets.length - 1;
        while (low <= high) {
          const mid = (low + high) >> 1;
          if (lineOffsets[mid] <= idx) low = mid + 1;
          else high = mid - 1;
        }
        const line = Math.max(0, high);
        return { line, ch: idx - lineOffsets[line] };
      };

      const modifications = [];
      const stack = [];
      let nextElementId = 1;
      const tagRegex = /<\/?([A-Za-z][\w:-]*)\b[^<>]*?>/g;
      let match;

      while ((match = tagRegex.exec(source))) {
        const full = match[0];
        const matchIndex = match.index;
        if (full.startsWith('<!')) continue;

        const isClosing = full[1] === '/';
        const rawTagName = match[1] || '';
        const tagName = rawTagName.toLowerCase();

        const parent = stack[stack.length - 1];
        if (parent && parent.skipContent && !(isClosing && tagName === parent.tagName)) {
          continue;
        }

        const selfClosing = full.endsWith('/>') || VOID_ELEMENTS.has(tagName);
        const closingAdjustment = full.endsWith('/>') ? 2 : 1;

        if (!isClosing) {
          const startIndex = matchIndex;
          const insertIndex = matchIndex + full.length - closingAdjustment;
          const startPos = indexToPos(startIndex);
          const elementId = nextElementId++;

          if (selfClosing) {
            const endIndex = matchIndex + full.length;
            const endPos = indexToPos(endIndex);
            const attrText =
              ` data-source-id="${elementId}"` +
              ` data-source-start-line="${startPos.line}"` +
              ` data-source-start-ch="${startPos.ch}"` +
              ` data-source-end-line="${endPos.line}"` +
              ` data-source-end-ch="${endPos.ch}"`;
            modifications.push({ index: insertIndex, text: attrText });
            elementRanges.push({
              sourceId: String(elementId),
              startIndex,
              endIndex
            });
          } else {
            const skipContent = tagName === 'script' || tagName === 'style';
            stack.push({
              tagName,
              startIndex,
              insertIndex,
              startPos,
              elementId,
              skipContent
            });
          }
        } else {
          const closingLength = full.length;
          const closingEndIndex = matchIndex + closingLength;

          let entryIndex = -1;
          for (let i = stack.length - 1; i >= 0; i--) {
            if (stack[i].tagName === tagName) {
              entryIndex = i;
              break;
            }
          }

          if (entryIndex === -1) continue;

          const entry = stack.splice(entryIndex, 1)[0];
          const endPos = indexToPos(closingEndIndex);
          const attrText =
            ` data-source-id="${entry.elementId}"` +
            ` data-source-start-line="${entry.startPos.line}"` +
            ` data-source-start-ch="${entry.startPos.ch}"` +
            ` data-source-end-line="${endPos.line}"` +
            ` data-source-end-ch="${endPos.ch}"`;
          modifications.push({ index: entry.insertIndex, text: attrText });
          elementRanges.push({
            sourceId: String(entry.elementId),
            startIndex: entry.startIndex,
            endIndex: closingEndIndex
          });
        }
      }

      modifications.sort((a, b) => a.index - b.index);

      let result = '';
      let cursor = 0;
      for (const mod of modifications) {
        result += source.slice(cursor, mod.index) + mod.text;
        cursor = mod.index;
      }
      result += source.slice(cursor);
      this.metadataList = elementRanges;
      return result;
    } catch (err) {
      console.warn('Annotation error:', err);
      this.metadataList = [];
      return source;
    }
  }

  /**
   * baseタグおよびインライン連動スクリプトを注入
   */
  injectBaseAndBridge(html) {
    let result = html;

    // プレビュー用に文字コード宣言をUTF-8に正規化（EUC-JPやShift_JISファイルでプレビューが文字化けするのを防ぐ）
    result = result.replace(/<meta\b[^>]*charset=["']?[^"'>\s]+["']?[^>]*>/gi, '<meta charset="UTF-8">');
    result = result.replace(/(content=["'][^"']*charset=)[^"';\s]+/gi, '$1UTF-8');

    // 1. 相対パス解決用の <base href="...">
    if (this.serverPort) {
      const baseTag = `<base href="http://127.0.0.1:${this.serverPort}/">`;
      if (/<head\b[^>]*>/i.test(result)) {
        result = result.replace(/<head\b[^>]*>/i, `$&${baseTag}`);
      } else {
        result = `${baseTag}${result}`;
      }
    }

    // 2. インライン連動スクリプトの注入
    const scriptTag = `<script>${PREVIEW_BRIDGE_CODE}<\/script>`;
    if (/<\/body>/i.test(result)) {
      result = result.replace(/<\/body>/i, `${scriptTag}$&`);
    } else {
      result = `${result}${scriptTag}`;
    }

    return result;
  }

  /**
   * プレビューを即時更新 (srcdoc方式)
   */
  async updatePreview(content) {
    try {
      const annotated = this.annotateHtmlWithSource(content);
      const finalHtml = this.injectBaseAndBridge(annotated);

      // 同期的にiframeのsrcdocを更新（クロスオリジン例外が一切起きず瞬時に描画）
      this.preview.srcdoc = finalHtml;

      this.notifySelection();
    } catch (err) {
      console.error('[PreviewSync] updatePreview error:', err);
    }
  }

  /**
   * 現在のエディタカーソル位置に基づき、プレビュー側に対応要素のハイライトを通知
   */
  notifySelection() {
    try {
      if (!this.preview.contentWindow) return;

      const pos = this.editor.getPosition();
      if (!pos) return;

      const model = this.editor.getModel();
      if (!model) return;

      const offset = model.getOffsetAt(pos);

      let bestMeta = null;
      let minRange = Infinity;

      for (const meta of this.metadataList) {
        if (offset >= meta.startIndex && offset <= meta.endIndex) {
          const range = meta.endIndex - meta.startIndex;
          if (range < minRange) {
            bestMeta = meta;
            minRange = range;
          }
        }
      }

      this.preview.contentWindow.postMessage(
        {
          type: 'source-preview-highlight',
          sourceId: bestMeta?.sourceId ?? null
        },
        '*'
      );
    } catch (err) {
      // 読み込み直後などの一時的エラーを無視
    }
  }
}
