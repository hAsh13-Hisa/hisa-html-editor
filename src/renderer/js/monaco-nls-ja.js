/*---------------------------------------------------------------------------------------------
 *  Monaco Editor NLS 日本語ローカライズモジュール
 *--------------------------------------------------------------------------------------------*/
import { getNLSLanguage, getNLSMessages } from 'monaco-editor/esm/vs/nls.messages.js';
export { getNLSLanguage, getNLSMessages } from 'monaco-editor/esm/vs/nls.messages.js';

export const JA_MESSAGES = {
  // 右クリックコンテキストメニュー（最頻出）
  'Go to Definition': '定義へ移動',
  'Go to Declaration': '宣言へ移動',
  'Go to Type Definition': '型定義へ移動',
  'Go to Implementation': '実装へ移動',
  'Go to Implementations': '実装へ移動',
  'Go to Symbol...': 'シンボルへ移動...',
  'Go to Line/Column...': '行/列へ移動...',
  'Peek': 'クイック表示',
  'Peek Definition': '定義をここに表示',
  'Peek Declaration': '宣言をここに表示',
  'Peek Type Definition': '型定義をここに表示',
  'Peek Implementation': '実装をここに表示',
  'Peek References': '参照をここに表示',
  'Find All References': 'すべての参照を検索',
  'Rename Symbol': 'シンボルの名前変更',
  'Change All Occurrences': 'すべての出現箇所を変更',
  'Format Document': 'ドキュメントのフォーマット',
  'Format Selection': '選択範囲のフォーマット',
  'Cut': '切り取り',
  'Copy': 'コピー',
  'Paste': '貼り付け',
  'Copy As': '形式を選択してコピー',
  'Share': '共有',
  'Command Palette': 'コマンド パレット',
  'Undo': '元に戻す',
  'Redo': 'やり直す',
  'Select All': 'すべて選択',
  'Refactor...': 'リファクタリング...',
  'Source Action...': 'ソース アクション...',
  'Organize Imports': 'インポートの整理',
  'Fold': '折りたたむ',
  'Unfold': '展開',
  'Fold All': 'すべて折りたたむ',
  'Unfold All': 'すべて展開',
  'Show or Focus Hover': 'ホバーの表示またはフォーカス',
  'Trigger Suggest': '候補を表示',
  'Trigger Parameter Hints': 'パラメーター ヒントの表示',

  // 検索・置換ウィジェット
  'Find': '検索',
  'Replace': '置換',
  'Replace All': 'すべて置き換え',
  'Find next': '次を検索',
  'Find previous': '前を検索',
  'Previous Match': '前の一致',
  'Next Match': '次の一致',
  'Find in Selection': '選択範囲内を検索',
  'Toggle Replace': '置換の切り替え',
  'Match Case': '大文字と小文字を区別',
  'Match Whole Word': '単語全体に一致',
  'Use Regular Expression': '正規表現を使用',
  'Preserve Case': '大文字/小文字を保持',
  'Close': '閉じる',
  'label.findDialog': '検索 / 置換',
  'label.find': '検索',
  'placeholder.find': '検索',
  'label.replace': '置換',
  'placeholder.replace': '置換',
  'label.replaceButton': '置換',
  'label.replaceAllButton': 'すべて置き換え',
  'label.toggleReplaceButton': '置換の切り替え',
  'label.toggleSelectionFind': '選択範囲内を検索',
  'label.previousMatchButton': '前の一致',
  'label.nextMatchButton': '次の一致',
  'label.closeButton': '閉じる',

  // エラー・診断・メッセージ
  'No definition found': '定義が見つかりません',
  'No references found': '参照が見つかりません',
  'No results': '結果なし',
  'Loading...': '読み込み中...'
};

const isPseudo = getNLSLanguage() === 'pseudo' || (typeof document !== 'undefined' && document.location && document.location.hash.indexOf('pseudo=true') >= 0);

function _format(message, args) {
  let result;
  if (!args || args.length === 0) {
    result = message;
  } else {
    result = message.replace(/\{(\d+)\}/g, (match, rest) => {
      const index = rest[0];
      const arg = args[index];
      let res = match;
      if (typeof arg === 'string') {
        res = arg;
      } else if (typeof arg === 'number' || typeof arg === 'boolean' || arg === void 0 || arg === null) {
        res = String(arg);
      }
      return res;
    });
  }
  if (isPseudo) {
    result = '\uFF3B' + result.replace(/[aouei]/g, '$&$&') + '\uFF3D';
  }
  return result;
}

function lookupMessage(index, fallback) {
  const message = getNLSMessages()?.[index];
  if (typeof message !== 'string') {
    if (typeof fallback === 'string') {
      return fallback;
    }
    throw new Error(`!!! NLS MISSING: ${index} !!!`);
  }
  return message;
}

function translate(text) {
  if (typeof text !== 'string') return text;
  // 1. 完全一致
  if (JA_MESSAGES[text]) {
    return JA_MESSAGES[text];
  }
  // 2. ニーモニック (&& または &) を除去して照合
  const clean = text.replace(/&&/g, '').replace(/&/g, '').trim();
  if (JA_MESSAGES[clean]) {
    return JA_MESSAGES[clean];
  }
  return text;
}

/**
 * 日本語化された localize 関数
 */
export function localize(data, message, ...args) {
  let text = message;
  if (typeof data === 'number') {
    text = lookupMessage(data, message);
  }
  const translated = translate(text);
  return _format(translated, args);
}

/**
 * 日本語化された localize2 関数
 */
export function localize2(data, originalMessage, ...args) {
  let message;
  if (typeof data === 'number') {
    message = lookupMessage(data, originalMessage);
  } else {
    message = originalMessage;
  }
  const translated = translate(message);
  const value = _format(translated, args);
  return {
    value,
    original: originalMessage === message ? value : _format(originalMessage, args)
  };
}
