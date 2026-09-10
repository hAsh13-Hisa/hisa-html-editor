import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Web Workerの設定
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  }
};

// HTML言語設定の調整
if (monaco.languages.html && monaco.languages.html.htmlDefaults) {
  monaco.languages.html.htmlDefaults.setOptions({
    format: {
      tabSize: 2,
      insertSpaces: true,
      wrapLineLength: 120,
      unformatted: 'wbr'
    },
    suggest: {
      html5: true
    }
  });
}

/**
 * Monaco Editorインスタンスを生成
 */
export function createMonacoEditor(container, initialValue = '', settings = {}) {
  const isDark = document.body.getAttribute('data-theme') !== 'light';

  const editor = monaco.editor.create(container, {
    value: initialValue,
    language: 'html',
    theme: isDark ? 'vs-dark' : 'vs',
    fontSize: settings.fontSize || 14,
    tabSize: settings.tabSize || 2,
    lineNumbers: settings.lineNumbers ? 'on' : 'off',
    wordWrap: settings.lineWrapping ? 'on' : 'off',
    automaticLayout: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    autoClosingDelete: 'always',
    autoClosingOvertype: 'always',
    formatOnPaste: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    colorDecorators: true,
    fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
    suggestSelection: 'first',
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true
    },
    cursorBlinking: 'smooth',
    smoothScrolling: true
  });

  return editor;
}

/**
 * テーマ変更の反映
 */
export function setMonacoTheme(theme) {
  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
  monaco.editor.setTheme(monacoTheme);
}

/**
 * 設定の部分更新反映
 */
export function updateMonacoSettings(editor, settings) {
  if (!editor) return;

  const options = {};
  if (typeof settings.fontSize === 'number') {
    options.fontSize = settings.fontSize;
  }
  if (typeof settings.tabSize === 'number') {
    options.tabSize = settings.tabSize;
  }
  if (typeof settings.lineNumbers === 'boolean') {
    options.lineNumbers = settings.lineNumbers ? 'on' : 'off';
  }
  if (typeof settings.lineWrapping === 'boolean') {
    options.wordWrap = settings.lineWrapping ? 'on' : 'off';
  }

  editor.updateOptions(options);
}

export { monaco };
