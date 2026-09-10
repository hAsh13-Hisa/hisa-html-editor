import { monaco } from '../monaco-setup.js';

/**
 * HTML内の <style> タグおよび <link rel="stylesheet"> 外部CSSから
 * クラス名・ID名・CSSルールを抽出し、補完や定義ジャンプを提供
 */
class CssIntellisenseManager {
  constructor() {
    this.classes = new Map(); // className -> [{ file, selector, ruleText, line }]
    this.ids = new Map();     // idName -> [{ file, selector, ruleText, line }]
    this.externalCssCache = new Map(); // href -> content
    this.currentDocDir = '';
  }

  setDocumentDir(dir) {
    this.currentDocDir = dir;
    this.externalCssCache.clear();
  }

  /**
   * HTML文書全体を解析してCSS情報を更新
   */
  async parseHtml(htmlContent) {
    this.classes.clear();
    this.ids.clear();

    if (!htmlContent) return;

    // 巨大ファイル（500KB超）は解析の過負荷を防ぐためスキップ
    if (htmlContent.length > 500000) return;

    // 1. <style> タグ内のCSSを解析
    const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let match;
    while ((match = styleRegex.exec(htmlContent)) !== null) {
      const cssText = match[1];
      const offset = match.index + match[0].indexOf(cssText);
      this.parseCssRules(cssText, 'internal:<style>', offset, htmlContent);
    }

    // 2. <link rel="stylesheet" href="..."> の外部CSSを解析
    const linkRegex = /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>|<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
    while ((match = linkRegex.exec(htmlContent)) !== null) {
      const href = match[1] || match[2];
      if (href && !href.startsWith('http://') && !href.startsWith('https://')) {
        await this.loadExternalCss(href);
      }
    }
  }

  /**
   * 外部CSSを読み込んで解析（タイムアウト付き）
   */
  async loadExternalCss(href) {
    try {
      let content = this.externalCssCache.get(href);
      if (!content && window.electronAPI?.readFile) {
        // ネットワークドライブ遅延対策：1秒タイムアウト
        const readPromise = window.electronAPI.readFile(href);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1000));
        const res = await Promise.race([readPromise, timeoutPromise]).catch(() => null);
        if (res && res.success) {
          content = res.content;
          this.externalCssCache.set(href, content);
        }
      }
      if (content) {
        this.parseCssRules(content, href, 0);
      }
    } catch (err) {
      console.warn(`Failed to parse external CSS: ${href}`, err);
    }
  }

  /**
   * CSS文字列からルール、クラス、IDを解析
   */
  parseCssRules(cssText, sourceFile, baseOffset = 0, fullHtml = null) {
    // コメント除去（位置を保持するために空白化）
    const cleanCss = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));

    // ルールブロックの正規表現 (例: .button:hover, #nav { color: red; })
    const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
    let match;

    while ((match = ruleRegex.exec(cleanCss)) !== null) {
      const fullSelector = match[1].trim();
      const body = match[2];
      const ruleText = match[0].trim();
      const matchIndex = match.index;

      let lineNumber = 1;
      if (sourceFile.startsWith('internal:') && fullHtml) {
        const charOffset = baseOffset + matchIndex;
        lineNumber = fullHtml.slice(0, charOffset).split('\n').length;
      } else {
        lineNumber = cssText.slice(0, matchIndex).split('\n').length;
      }

      const ruleInfo = {
        sourceFile,
        selector: fullSelector,
        body: body.trim(),
        fullRule: ruleText,
        lineNumber
      };

      // セレクタ内のクラス名 (.class-name) を抽出
      const classMatches = fullSelector.match(/\.([a-zA-Z0-9_-]+)/g);
      if (classMatches) {
        for (const cls of classMatches) {
          const name = cls.slice(1);
          if (!this.classes.has(name)) this.classes.set(name, []);
          this.classes.get(name).push(ruleInfo);
        }
      }

      // セレクタ内のID名 (#id-name) を抽出
      const idMatches = fullSelector.match(/#([a-zA-Z0-9_-]+)/g);
      if (idMatches) {
        for (const id of idMatches) {
          const name = id.slice(1);
          if (!this.ids.has(name)) this.ids.set(name, []);
          this.ids.get(name).push(ruleInfo);
        }
      }
    }
  }

  /**
   * 指定したセレクタ（タグ名、.クラス名、#ID）に関連するルール一覧を検索
   */
  findRulesForToken(token) {
    const results = [];
    if (token.startsWith('.')) {
      const name = token.slice(1);
      if (this.classes.has(name)) results.push(...this.classes.get(name));
    } else if (token.startsWith('#')) {
      const name = token.slice(1);
      if (this.ids.has(name)) results.push(...this.ids.get(name));
    } else {
      // タグ名の場合
      const tagName = token.toLowerCase();
      const allRules = [...this.classes.values(), ...this.ids.values()].flat();
      for (const rule of allRules) {
        if (rule.selector.toLowerCase().includes(tagName)) {
          if (!results.some(r => r.fullRule === rule.fullRule)) {
            results.push(rule);
          }
        }
      }
    }
    return results;
  }
}

export const cssManager = new CssIntellisenseManager();

/**
 * Monaco EditorにCSSクラス・IDの自動補完を登録
 */
export function registerCssIntellisense(editor) {
  // 1. 補完プロバイダ（class="..." や id="..." の中で候補を表示）
  monaco.languages.registerCompletionItemProvider('html', {
    triggerCharacters: ['"', "'", ' '],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.slice(0, position.column - 1);

      // class="..." の中か判定
      const classMatch = textBefore.match(/class=["']([^"']*)$/);
      if (classMatch) {
        const suggestions = [];
        for (const [className, rules] of cssManager.classes.entries()) {
          const detail = rules[0] ? `${rules[0].sourceFile}:${rules[0].lineNumber}` : 'CSS Class';
          const doc = rules.map(r => r.fullRule).join('\n\n');
          suggestions.push({
            label: className,
            kind: monaco.languages.CompletionItemKind.Class,
            detail: `.${className} (${detail})`,
            documentation: { value: '```css\n' + doc + '\n```' },
            insertText: className
          });
        }
        return { suggestions };
      }

      // id="..." の中か判定
      const idMatch = textBefore.match(/id=["']([^"']*)$/);
      if (idMatch) {
        const suggestions = [];
        for (const [idName, rules] of cssManager.ids.entries()) {
          const detail = rules[0] ? `${rules[0].sourceFile}:${rules[0].lineNumber}` : 'CSS ID';
          const doc = rules.map(r => r.fullRule).join('\n\n');
          suggestions.push({
            label: idName,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: `#${idName} (${detail})`,
            documentation: { value: '```css\n' + doc + '\n```' },
            insertText: idName
          });
        }
        return { suggestions };
      }

      return { suggestions: [] };
    }
  });

  // 2. 定義ジャンプ (F12) プロバイダ
  monaco.languages.registerDefinitionProvider('html', {
    provideDefinition(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const token = word.word;
      const lineContent = model.getLineContent(position.lineNumber);

      // クラス名またはIDかチェック
      let rules = [];
      if (lineContent.includes(`class=`) || lineContent.includes(`id=`)) {
        if (cssManager.classes.has(token)) {
          rules = cssManager.classes.get(token);
        } else if (cssManager.ids.has(token)) {
          rules = cssManager.ids.get(token);
        }
      }

      if (rules.length > 0) {
        const target = rules[0];
        // 内部<style>の場合は現在のモデル内の行へ
        if (target.sourceFile.startsWith('internal:')) {
          return {
            uri: model.uri,
            range: new monaco.Range(target.lineNumber, 1, target.lineNumber, 1)
          };
        }
      }

      return null;
    }
  });
}
