import { monaco } from '../monaco-setup.js';
import { cssManager } from './css-intellisense.js';

/**
 * クイック編集 (Ctrl+E / Quick Edit) マネージャー
 * HTMLタグ・クラス・IDの位置でCtrl+Eを押すと、該当CSSルールをインライン展開して直接編集可能にする
 */
export class QuickEditManager {
  constructor(editor, onContentChanged) {
    this.editor = editor;
    this.onContentChanged = onContentChanged;
    this.activeZoneId = null;
    this.activeWidget = null;
    this.subEditor = null;
    this.currentRule = null;
    this.targetLine = 0;
  }

  register() {
    // Ctrl+E / Cmd+E ショートカットを登録
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
      this.toggleQuickEdit();
    });

    // Escで閉じる
    this.editor.addCommand(monaco.KeyCode.Escape, () => {
      if (this.activeZoneId) {
        this.closeQuickEdit();
      }
    });
  }

  toggleQuickEdit() {
    if (this.activeZoneId) {
      this.closeQuickEdit();
      return;
    }

    const pos = this.editor.getPosition();
    if (!pos) return;

    const model = this.editor.getModel();
    if (!model) return;

    const lineContent = model.getLineContent(pos.lineNumber);
    const tokenInfo = this.detectTokenAtPosition(lineContent, pos.column);

    if (!tokenInfo) {
      console.info('Quick Edit: No class, id, or tag detected at cursor.');
      return;
    }

    // 関連するCSSルールを検索
    let rules = cssManager.findRulesForToken(tokenInfo.selector);

    if (rules.length === 0) {
      // ルールが存在しない場合、内部<style>に自動で骨組みを作成して編集開始
      rules = [this.createNewInternalRule(tokenInfo.selector, model)];
    }

    if (rules.length > 0) {
      this.openQuickEditZone(pos.lineNumber, rules[0], tokenInfo.selector);
    }
  }

  /**
   * カーソル位置のタグ、クラス、IDを判定
   */
  detectTokenAtPosition(line, col) {
    // 1. class="..." の中
    const classMatch = line.match(/class=["']([^"']+)["']/);
    if (classMatch) {
      const idx = line.indexOf(classMatch[0]);
      if (col >= idx + 7 && col <= idx + classMatch[0].length) {
        // カーソル下の単語
        const sub = line.slice(idx + 7, col - 1);
        const words = classMatch[1].split(/\s+/);
        const targetWord = words[0] || '';
        return { type: 'class', selector: `.${targetWord}` };
      }
    }

    // 2. id="..." の中
    const idMatch = line.match(/id=["']([^"']+)["']/);
    if (idMatch) {
      const idx = line.indexOf(idMatch[0]);
      if (col >= idx + 4 && col <= idx + idMatch[0].length) {
        return { type: 'id', selector: `#${idMatch[1]}` };
      }
    }

    // 3. タグ名 (<div ...>)
    const tagMatch = line.match(/<([a-zA-Z0-9:-]+)/);
    if (tagMatch) {
      return { type: 'tag', selector: tagMatch[1] };
    }

    return null;
  }

  /**
   * ルールが存在しない場合、<style> 内に新規ルールを追加して返す
   */
  createNewInternalRule(selector, model) {
    let fullHtml = model.getValue();
    let newRuleText = `\n${selector} {\n  \n}\n`;

    if (fullHtml.includes('</style>')) {
      // 既存の <style> の直前に挿入
      const idx = fullHtml.lastIndexOf('</style>');
      const lineBefore = fullHtml.slice(0, idx).split('\n').length;
      const updated = fullHtml.slice(0, idx) + newRuleText + fullHtml.slice(idx);
      model.setValue(updated);
      this.onContentChanged?.();
      return {
        sourceFile: 'internal:<style>',
        selector,
        fullRule: `${selector} {\n  \n}`,
        lineNumber: lineBefore + 1
      };
    } else {
      // <head> または先頭に <style> を新設
      const styleBlock = `<style>\n${selector} {\n  \n}\n</style>\n`;
      let updated = '';
      if (fullHtml.includes('</head>')) {
        const idx = fullHtml.indexOf('</head>');
        updated = fullHtml.slice(0, idx) + styleBlock + fullHtml.slice(idx);
      } else {
        updated = styleBlock + fullHtml;
      }
      model.setValue(updated);
      this.onContentChanged?.();
      return {
        sourceFile: 'internal:<style>',
        selector,
        fullRule: `${selector} {\n  \n}`,
        lineNumber: 2
      };
    }
  }

  /**
   * 指定行の下にインラインエディタ（ViewZone）を開く
   */
  openQuickEditZone(lineNumber, rule, selector) {
    this.closeQuickEdit();
    this.currentRule = rule;
    this.targetLine = lineNumber;

    // DOMコンテナの作成
    const domNode = document.createElement('div');
    domNode.className = 'quick-edit-widget';

    // ヘッダーバー
    const header = document.createElement('div');
    header.className = 'quick-edit-header';
    header.innerHTML = `
      <div class="quick-edit-title">
        <span>CSSクイック編集:</span>
        <span class="quick-edit-rule-selector">${selector}</span>
        <span>(${rule.sourceFile})</span>
      </div>
      <div class="quick-edit-actions">
        <span style="font-size: 10px;">Escで閉じる</span>
        <button type="button" class="btn btn-sm" id="closeQuickEditBtn">✕</button>
      </div>
    `;
    domNode.appendChild(header);

    // エディタコンテナ
    const editorContainer = document.createElement('div');
    editorContainer.className = 'quick-edit-container';
    domNode.appendChild(editorContainer);

    header.querySelector('#closeQuickEditBtn').addEventListener('click', () => {
      this.closeQuickEdit();
    });

    const zoneHeight = 180;

    this.editor.changeViewZones((changeAccessor) => {
      this.activeZoneId = changeAccessor.addZone({
        afterLineNumber: lineNumber,
        heightInPx: zoneHeight,
        domNode: domNode,
        onDomNodeTop: (top) => {},
        onComputedHeight: (height) => {}
      });
    });

    // インラインCSS用Monaco Editorの初期化
    const isDark = document.body.getAttribute('data-theme') !== 'light';
    this.subEditor = monaco.editor.create(editorContainer, {
      value: rule.fullRule,
      language: 'css',
      theme: isDark ? 'vs-dark' : 'vs',
      fontSize: 13,
      minimap: { enabled: false },
      lineNumbers: 'off',
      automaticLayout: true,
      scrollBeyondLastLine: false
    });

    this.subEditor.focus();

    // 編集内容を元のソースへ反映
    this.subEditor.onDidChangeModelContent(() => {
      this.applyQuickEditChange(rule.fullRule, this.subEditor.getValue());
      rule.fullRule = this.subEditor.getValue();
    });

    // Escで閉じて親エディタに戻る
    this.subEditor.addCommand(monaco.KeyCode.Escape, () => {
      this.closeQuickEdit();
    });
  }

  /**
   * 編集されたCSSルールを元のHTML（<style>内）またはファイルに置換反映
   */
  applyQuickEditChange(oldRule, newRule) {
    if (!oldRule || !newRule || oldRule === newRule) return;

    const mainModel = this.editor.getModel();
    if (!mainModel) return;

    const fullContent = mainModel.getValue();
    if (fullContent.includes(oldRule)) {
      const updated = fullContent.replace(oldRule, newRule);
      mainModel.setValue(updated);
      this.onContentChanged?.();
    }
  }

  closeQuickEdit() {
    if (this.subEditor) {
      this.subEditor.dispose();
      this.subEditor = null;
    }
    if (this.activeZoneId) {
      this.editor.changeViewZones((changeAccessor) => {
        changeAccessor.removeZone(this.activeZoneId);
      });
      this.activeZoneId = null;
    }
    this.currentRule = null;
    this.editor.focus();
  }
}
