# Hisa HTML Editor

<p align="center">
  <img src="assets/icon.png" alt="Hisa HTML Editor Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Dreamweaver代替の直感的な編集機能を備えた、高機能デスクトップHTMLエディタ</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/hAsh13-Hisa/hisa-html-editor?style=flat-square&color=007acc" alt="Latest Release">
  <img src="https://img.shields.io/badge/Electron-35.0-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Monaco_Editor-0.52-blue?style=flat-square" alt="Monaco Editor">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## 📖 概要

**Hisa HTML Editor** は、従来の Adobe Dreamweaver の快適な制作体験（リアルタイム同期プレビュー・CSSクイック編集・イメージマップ作成など）をモダンな技術で再現・進化させたデスクトップHTMLエディタです。

エディタコアには VS Code と同じ **Monaco Editor** を採用し、Emmet展開、CSSインテリセンス、日本語文字コード（Shift_JIS / EUC-JP）自動認識、アプリ内自動アップデート機能を備えています。

---

## ✨ 主な機能

### 1. 🔄 リアルタイム双方向同期プレビュー
- **クリックでコードジャンプ**: プレビュー内の要素をクリックすると、エディタ側の対応するHTMLタグ行へ瞬時にジャンプ。
- **カーソル位置のハイライト**: エディタ内でカーソルがあるHTML要素が、プレビュー画面上で青枠ハイライト表示。
- **マルチ画面レイアウト**: 左右2画面分割、上下分割、エディタ単独、プレビュー単独の全画面表示に対応。
- **レスポンシブ切り替え**: PC（100%）、タブレット（768px）、スマートフォン（375px）のワンクリック表示切替。

### 2. ⚡ 強力なコーディング補助 (Monaco Editor ＋ Emmet)
- **Emmet展開**: `ul>li*3` + Tabキー等による高速HTMLスニペット展開。
- **タグ補完＆自動閉じタグ**: `<div>` 入力時に自動で `</div>` を挿入、`</` 入力時の終了タグ自動解決。
- **タグ囲み (Wrap with Tag)**: 選択範囲を任意のタグで素早く囲む機能。
- **画像プレビューホバー**: HTML内の画像URLにマウスカーソルを合わせるとサムネイル画像を即座にホバープレビュー。

### 3. 🎨 CSSインテリセンス ＆ クイック編集
- **クイック編集 (`Ctrl + E`)**: HTMLタグ上のクラス名・IDで `Ctrl+E` を押すと、関連するCSS定義をインラインでダイレクト編集。
- **クラス名・ID自動補完**: `<link rel="stylesheet">` や `<style>` 内のCSSルールを解析し、`class=""` や `id=""` 入力時にサジェスト。
- **定義ジャンプ (`F12`)**: クラス名からCSS定義行へダイレクト移動。

### 4. 🗺️ イメージMAPビジュアルエディター内蔵
- HTMLのクリッカブルマップ（`<map>`, `<area>`）をGUI上で直感的に作成・編集。
- **矩形（rect）**、**円形（circle）**、**多角形（poly）** の描画に対応。
- エディタと連動し、描画結果をHTMLコードへ直接出力・更新。

### 5. 🈳 確実なローカル動作・文字コード対応
- **内蔵ローカルHTTPサーバー**: `./images/logo.png` や `./css/style.css` などのローカル相対パスをセキュリティ制約なく完全プレビュー。
- **文字コード自動判別**: UTF-8 はもちろん、既存Web制作で多い **Shift_JIS (CP932)** や **EUC-JP** を自動判定し、保存時も元の文字コードを保持。

### 6. 🚀 アプリ内自動アップデート
- GitHub Releases と連携した **完全自動アップデート機能（electron-updater）** を搭載。
- アプリ起動時に新バージョンを自動検出し、クリック1回で最新版へシームレスに更新。

---

## 📥 ダウンロード・インストール

👉 **[最新バージョンのダウンロードはこちら (Releases)](https://github.com/hAsh13-Hisa/hisa-html-editor/releases/latest)**

| 形式 | 推奨環境 | 特徴 |
| :--- | :--- | :--- |
| **`Hisa HTML Editor Setup X.X.X.exe`** | **通常利用（推奨）** | ワンクリックでインストール完了。**アプリ内自動アップデートに対応**。 |
| **`Hisa-HTML-Editor-X.X.X-win-portable.zip`** | インストール制限PC・USB等 | インストール不要。ZIPを解凍するだけですぐに利用可能。 |

---

## ⌨️ 主なショートカットキー

| ショートカット | 機能 |
| :--- | :--- |
| `Ctrl + S` | ファイルを上書き保存 |
| `Ctrl + Shift + S` | 名前を付けて保存 |
| `Ctrl + O` | ファイルを開く |
| `Ctrl + N` | 新規HTMLファイル作成 |
| `Ctrl + E` | CSSクイック編集（インライン編集を開く） |
| `Ctrl + B` | プレビュー画面の表示 / 非表示切り替え |
| `F1` | ショートカットキー一覧ヘルプ |
| `F12` | CSSクラス定義へジャンプ |

---

## 🛠️ 開発・ビルド手順

### 前提条件
- Node.js 20 以降
- npm

### 開発環境の起動
```bash
# 依存関係のインストール
npm install

# 開発サーバー起動（ホットリロード有効）
npm run dev
```

### パッケージのローカルビルド
```bash
# Windows版（NSISインストーラー + ポータブルZIP）をビルド
npm run build:win
```
※ ビルド成果物は `dist-package/` フォルダに出力されます。

### 新バージョンの自動リリース (GitHub Actions)
```bash
# バージョン番号を繰り上げ、コミット・タグ作成・クラウド自動リリースを一括実行
npm run release:patch
```

---

## 📦 技術スタック

- **デスクトップ基盤**: [Electron](https://www.electronjs.org/) v35
- **エディタコア**: [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- **フロントエンド / ビルド**: Vanilla JS (ES Modules) / [Vite](https://vitejs.dev/)
- **文字コード解析**: [encoding-japanese](https://github.com/polygonplanet/encoding.js)
- **Emmet拡張**: [emmet-monaco-es](https://github.com/troy351/emmet-monaco-es)
- **パッケージング & 更新**: [electron-builder](https://www.electron.build/) / [electron-updater](https://www.electron.build/auto-update)
- **CI / CD**: GitHub Actions

---

## 📄 ライセンス

[MIT License](LICENSE) © 2026 Hisa
