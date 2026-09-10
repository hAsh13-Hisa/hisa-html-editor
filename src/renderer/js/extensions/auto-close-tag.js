import { monaco } from '../monaco-setup.js';

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Monaco Editorに「自動閉じタグ」および「終了タグ補完」を追加
 */
export function registerAutoCloseTag(editor) {
  let isInternalEdit = false;

  editor.onDidChangeModelContent((event) => {
    if (isInternalEdit) return;

    for (const change of event.changes) {
      const text = change.text;

      // 1. '>' が入力された時：自動閉じタグ挿入 (例: <div> -> <div></div>)
      if (text === '>') {
        const model = editor.getModel();
        if (!model) continue;

        const pos = editor.getPosition();
        if (!pos) continue;

        const lineContent = model.getLineContent(pos.lineNumber);
        const textBefore = lineContent.slice(0, pos.column - 1);

        // 直前のタグを正規表現で検出 (例: <div class="test">)
        const match = textBefore.match(/<([a-zA-Z0-9:-]+)(?:\s+[^<>]*)?$/);
        if (match) {
          const tagName = match[1].toLowerCase();

          // VOID要素、自己終了タグ (/>)、またはコメント/doctypeなどは除外
          if (VOID_ELEMENTS.has(tagName) || textBefore.endsWith('/')) {
            continue;
          }

          const closeTag = `</${tagName}>`;
          isInternalEdit = true;
          editor.executeEdits('auto-close-tag', [
            {
              range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
              text: closeTag,
              forceMoveMarkers: false
            }
          ]);
          // カーソルを開始タグと終了タグの間に保つ
          editor.setPosition(pos);
          isInternalEdit = false;
        }
      }

      // 2. '</' が入力された時：直近の未閉じタグを自動補完
      if (text === '/' || text === '</') {
        const model = editor.getModel();
        if (!model) continue;

        const pos = editor.getPosition();
        if (!pos) continue;

        const lineContent = model.getLineContent(pos.lineNumber);
        const textBefore = lineContent.slice(0, pos.column - 1);

        if (textBefore.endsWith('</')) {
          const fullText = model.getValue();
          const offset = model.getOffsetAt(pos) - 2; // '</' の直前のオフセット
          const unclosedTag = findLastUnclosedTag(fullText.slice(0, offset));

          if (unclosedTag) {
            isInternalEdit = true;
            editor.executeEdits('auto-close-tag', [
              {
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                text: `${unclosedTag}>`,
                forceMoveMarkers: true
              }
            ]);
            isInternalEdit = false;
          }
        }
      }
    }
  });
}

/**
 * テキストから最も内側にある未閉じタグ名を検索
 */
function findLastUnclosedTag(html) {
  const stack = [];
  const tagRegex = /<\/?([a-zA-Z0-9:-]+)(?:\s+[^<>]*)?>/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const full = match[0];
    const tagName = match[1].toLowerCase();

    if (full.startsWith('<!') || full.startsWith('<?')) continue;
    if (VOID_ELEMENTS.has(tagName) || full.endsWith('/>')) continue;

    if (full.startsWith('</')) {
      // 終了タグ：スタックから一致するものをポップ
      const lastIdx = stack.lastIndexOf(tagName);
      if (lastIdx !== -1) {
        stack.splice(lastIdx, 1);
      }
    } else {
      // 開始タグ
      stack.push(tagName);
    }
  }

  return stack.length > 0 ? stack[stack.length - 1] : null;
}
