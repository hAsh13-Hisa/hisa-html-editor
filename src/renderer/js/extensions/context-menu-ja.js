/**
 * Monaco Editor のコンテキストメニュー（右クリックメニュー）および
 * 各種アクションを日本語化する辞書
 */
export const JA_DICTIONARY = {
  // 基本編集
  'Change All Occurrences': 'すべての出現箇所を変更',
  'Format Document': 'ドキュメントのフォーマット',
  'Format Selection': '選択範囲のフォーマット',
  'Cut': '切り取り',
  'Copy': 'コピー',
  'Paste': '貼り付け',
  'Command Palette': 'コマンド パレット',
  'Undo': '元に戻す',
  'Redo': 'やり直す',
  'Select All': 'すべて選択',

  // 定義・参照ジャンプ
  'Peek': 'クイック表示',
  'Peek Definition': '定義をここに表示',
  'Go to Definition': '定義へ移動',
  'Peek Declaration': '宣言をここに表示',
  'Go to Declaration': '宣言へ移動',
  'Peek Type Definition': '型定義をここに表示',
  'Go to Type Definition': '型定義へ移動',
  'Peek Implementation': '実装をここに表示',
  'Peek Implementations': '実装をここに表示',
  'Go to Implementation': '実装へ移動',
  'Go to Implementations': '実装へ移動',
  'Peek References': '参照をここに表示',
  'Go to References': '参照へ移動',
  'Find All References': 'すべての参照を検索',

  // リファクタリング
  'Rename Symbol': 'シンボルの名前変更',
  'Refactor...': 'リファクタリング...',
  'Source Action...': 'ソース アクション...',
  'Organize Imports': 'インポートの整理',

  // 折りたたみ
  'Fold': '折りたたむ',
  'Unfold': '展開',
  'Fold All': 'すべて折りたたむ',
  'Unfold All': 'すべて展開',

  // その他
  'Open Link': 'リンクを開く',
  'Color Picker': 'カラー ピッカー'
};

/**
 * Monaco Editor インスタンスのアクションラベルと
 * コンテキストメニューDOMを日本語化する
 */
export function setupContextMenuJa(editor) {
  // 1. Monaco Editor の登録アクションの label を日本語に書き換え
  try {
    const actions = editor.getActions();
    for (const action of actions) {
      if (action && action.label && JA_DICTIONARY[action.label]) {
        const jaLabel = JA_DICTIONARY[action.label];
        // 内部プロパティとプロトタイプ両方の書き換え
        action.label = jaLabel;
        if (action._label) action._label = jaLabel;
        if (action._action?.label) action._action.label = jaLabel;
      }
    }
  } catch (err) {
    console.warn('Action label update warning:', err);
  }

  // 2. コンテキストメニューDOMの動的日本語化（最速置換）
  const translateMenuElements = (root) => {
    if (!root) return;

    // .action-label 要素
    const labels = root.querySelectorAll('.action-label, .monaco-menu .monaco-action-bar .action-item a');
    labels.forEach((el) => {
      const text = el.textContent?.trim();
      if (text && JA_DICTIONARY[text]) {
        el.textContent = JA_DICTIONARY[text];
      }
      const title = el.getAttribute('title');
      if (title && JA_DICTIONARY[title]) {
        el.setAttribute('title', JA_DICTIONARY[title]);
      }
      const aria = el.getAttribute('aria-label');
      if (aria && JA_DICTIONARY[aria]) {
        el.setAttribute('aria-label', JA_DICTIONARY[aria]);
      }
    });

    // キーバインド表示などがある場合の子テキストノード対応
    const menuItems = root.querySelectorAll('.monaco-menu .action-item');
    menuItems.forEach((item) => {
      const aria = item.getAttribute('aria-label');
      if (aria && JA_DICTIONARY[aria]) {
        item.setAttribute('aria-label', JA_DICTIONARY[aria]);
      }
    });
  };

  // 3. MutationObserver でコンテキストメニューの出現を常時監視
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.classList.contains('context-view') ||
              node.classList.contains('monaco-menu-container') ||
              node.querySelector?.('.monaco-menu-container')) {
            translateMenuElements(node);
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 4. 右クリックイベント時に事前準備 & 即時反映
  document.addEventListener('contextmenu', () => {
    requestAnimationFrame(() => {
      const contextViews = document.querySelectorAll('.context-view, .monaco-menu-container');
      contextViews.forEach((cv) => translateMenuElements(cv));
    });
    setTimeout(() => {
      const contextViews = document.querySelectorAll('.context-view, .monaco-menu-container');
      contextViews.forEach((cv) => translateMenuElements(cv));
    }, 10);
  }, true);
}
