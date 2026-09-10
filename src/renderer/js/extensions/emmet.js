import { emmetHTML } from 'emmet-monaco-es';
import { monaco } from '../monaco-setup.js';

export function setupEmmet(editor) {
  // Monaco EditorにEmmet補完（HTML/CSS）を登録
  try {
    emmetHTML(monaco, ['html']);
  } catch (err) {
    console.warn('Emmet setup warning:', err);
  }

  const dialog = document.getElementById('wrapTagDialog');
  const form = document.getElementById('wrapTagForm');
  const input = document.getElementById('wrapTagInput');
  const cancelBtn = document.getElementById('wrapTagCancel');

  if (!dialog || !form || !input || !cancelBtn) return;

  // タグ囲みダイアログを開く
  const openWrapTagDialog = () => {
    input.value = '';
    dialog.showModal();
    input.focus();
  };

  cancelBtn.addEventListener('click', () => {
    dialog.close();
    editor.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawTag = input.value.trim();
    dialog.close();
    editor.focus();

    if (!rawTag) return;

    // タグの展開・解析 (例: div.card#main -> <div class="card" id="main">...</div>)
    const { openTag, closeTag } = parseWrapAbbreviation(rawTag);

    const selection = editor.getSelection();
    if (!selection) return;

    const model = editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    const wrappedText = `${openTag}${selectedText}${closeTag}`;

    editor.executeEdits('wrap-tag', [
      {
        range: selection,
        text: wrappedText,
        forceMoveMarkers: true
      }
    ]);
  });

  // Alt+W ショートカット登録
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, () => {
    openWrapTagDialog();
  });

  return { openWrapTagDialog };
}

/**
 * 簡易的なタグ略記（div.class, p, a[href=...]等）のパース
 */
function parseWrapAbbreviation(abbr) {
  // すでに <p> のように書かれている場合
  const fullMatch = abbr.match(/^<([a-zA-Z0-9:-]+)(?:\s+([^>]*))?>$/);
  if (fullMatch) {
    return {
      openTag: abbr,
      closeTag: `</${fullMatch[1]}>`
    };
  }

  // クラス名 (.class) や ID (#id)、属性 ([attr=val]) の簡易解析
  let tagName = 'div';
  let classes = [];
  let ids = [];
  let attrs = [];

  // 属性 [key=val] を抽出
  let remaining = abbr.replace(/\[(.*?)\]/g, (_, attrStr) => {
    attrs.push(attrStr);
    return '';
  });

  // タグ名抽出
  const tagMatch = remaining.match(/^([a-zA-Z0-9:-]+)/);
  if (tagMatch) {
    tagName = tagMatch[1];
    remaining = remaining.slice(tagName.length);
  }

  // クラス・ID抽出
  const parts = remaining.match(/[.#][a-zA-Z0-9_-]+/g) || [];
  for (const part of parts) {
    if (part.startsWith('.')) {
      classes.push(part.slice(1));
    } else if (part.startsWith('#')) {
      ids.push(part.slice(1));
    }
  }

  let attrParts = [];
  if (ids.length > 0) {
    attrParts.push(`id="${ids[0]}"`);
  }
  if (classes.length > 0) {
    attrParts.push(`class="${classes.join(' ')}"`);
  }
  if (attrs.length > 0) {
    attrParts.push(...attrs);
  }

  const attrString = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';
  return {
    openTag: `<${tagName}${attrString}>`,
    closeTag: `</${tagName}>`
  };
}
