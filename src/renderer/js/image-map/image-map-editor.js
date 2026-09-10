import { CanvasController } from './canvas-controller.js';
import { generateHtml, parseHtml, formatCoords, parseCoords } from './tag-parser.js';

class ImageMapEditorApp {
  constructor() {
    this.mapName = 'image-map';
    this.originalMapName = null;
    this.hasExistingMap = false;
    this.imageSrc = '';
    this.imageAlt = '';
    this.extraAttrs = null;
    this.baseDir = '';
    this.areas = [];
    this.selectedAreaId = null;

    this.initElements();
    this.initCanvas();
    this.initEvents();
    this.initData();
  }

  initElements() {
    // ツールバー
    this.btnOpenImage = document.getElementById('btnOpenImage');
    this.btnImportHtml = document.getElementById('btnImportHtml');
    this.toolBtns = document.querySelectorAll('.tool-btn');
    this.zoomSelect = document.getElementById('zoomSelect');
    this.btnCopyHtml = document.getElementById('btnCopyHtml');
    this.btnUpdateEditor = document.getElementById('btnUpdateEditor');
    this.btnInsertToEditor = document.getElementById('btnInsertToEditor');

    // キャンバスステージ
    this.stageEl = document.getElementById('stage');
    this.stageContentEl = document.getElementById('stageContent');
    this.imageEl = document.getElementById('mapImage');
    this.svgEl = document.getElementById('mapSvg');
    this.emptyPlaceholder = document.getElementById('emptyPlaceholder');

    // ステータス
    this.coordStatus = document.getElementById('coordStatus');
    this.imageInfoStatus = document.getElementById('imageInfoStatus');

    // 設定・プロパティパネル
    this.mapNameInput = document.getElementById('mapNameInput');
    this.imageSrcInput = document.getElementById('imageSrcInput');
    this.imageAltInput = document.getElementById('imageAltInput');
    this.checkIncludeImg = document.getElementById('checkIncludeImg');
    this.areaListEl = document.getElementById('areaList');
    this.areaCountBadge = document.getElementById('areaCountBadge');
    this.htmlPreview = document.getElementById('htmlPreview');
    this.toastEl = document.getElementById('toast');

    // エリア編集フォーム要素
    this.areaPropPanel = document.getElementById('areaPropPanel');
    this.propShape = document.getElementById('propShape');
    this.propCoords = document.getElementById('propCoords');
    this.propHref = document.getElementById('propHref');
    this.propAlt = document.getElementById('propAlt');
    this.propTitle = document.getElementById('propTitle');
    this.propTarget = document.getElementById('propTarget');
    this.btnDeleteArea = document.getElementById('btnDeleteArea');

    // インポートダイアログ
    this.importDialog = document.getElementById('importDialog');
    this.importInput = document.getElementById('importInput');
    this.btnCancelImport = document.getElementById('btnCancelImport');
    this.btnConfirmImport = document.getElementById('btnConfirmImport');
  }

  initCanvas() {
    this.canvasController = new CanvasController({
      stageEl: this.stageEl,
      stageContentEl: this.stageContentEl,
      imageEl: this.imageEl,
      svgEl: this.svgEl,
      onSelectArea: (areaId) => this.handleAreaSelected(areaId),
      onAddArea: (area) => this.handleAreaAdded(area),
      onUpdateArea: (area) => this.handleAreaUpdated(area),
      onHoverCoords: (x, y) => {
        this.coordStatus.textContent = `X: ${x} px, Y: ${y} px`;
      },
      onToolChange: (tool) => this.syncToolButtons(tool)
    });
  }

  initEvents() {
    // ツール切り替えボタン
    this.toolBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this.setTool(tool);
      });
    });

    // ズーム切り替え
    this.zoomSelect.addEventListener('change', () => {
      this.canvasController.applyZoom(this.zoomSelect.value);
    });

    // 画像を開くボタン
    this.btnOpenImage.addEventListener('click', () => this.handleSelectImage());
    this.emptyPlaceholder.addEventListener('click', () => this.handleSelectImage());

    // ドラッグ＆ドロップによる画像読み込み
    this.stageEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.stageEl.classList.add('dragover');
    });

    this.stageEl.addEventListener('dragleave', () => {
      this.stageEl.classList.remove('dragover');
    });

    this.stageEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.stageEl.classList.remove('dragover');

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (!file.type.startsWith('image/')) {
          this.showToast('画像ファイルをドロップしてください', 'error');
          return;
        }

        let filePath = '';
        if (window.electronAPI?.getPathForFile) {
          filePath = window.electronAPI.getPathForFile(file);
        }

        const reader = new FileReader();
        reader.onload = () => {
          this.loadImage(reader.result, filePath || file.name, file.name);
        };
        reader.readAsDataURL(file);
      }
    });

    // 画像ロード完了イベント
    this.imageEl.addEventListener('load', () => {
      this.emptyPlaceholder.style.display = 'none';
      this.stageContentEl.style.display = 'inline-block';
      this.canvasController.onImageLoaded();
      this.imageInfoStatus.textContent = `${this.imageEl.naturalWidth} × ${this.imageEl.naturalHeight} px`;
      this.updateHtmlPreview();
    });

    this.imageEl.addEventListener('error', () => {
      this.emptyPlaceholder.style.display = 'flex';
      this.stageContentEl.style.display = 'none';
      this.imageInfoStatus.textContent = '画像未読込';
      this.showToast(`画像「${this.imageSrc}」を表示できません。「画像を開く」から画像ファイルを指定してください。`, 'warning');
    });

    // 設定入力欄の変更監視
    this.mapNameInput.addEventListener('input', () => {
      this.mapName = this.mapNameInput.value.trim() || 'image-map';
      this.updateHtmlPreview();
    });

    this.imageSrcInput.addEventListener('input', () => {
      this.imageSrc = this.imageSrcInput.value.trim();
      this.updateHtmlPreview();
    });

    this.imageAltInput.addEventListener('input', () => {
      this.imageAlt = this.imageAltInput.value.trim();
      this.updateHtmlPreview();
    });

    this.checkIncludeImg.addEventListener('change', () => {
      this.updateHtmlPreview();
    });

    // エリアプロパティフォーム入力監視
    const updateCurrentAreaProp = () => {
      if (!this.selectedAreaId) return;
      const area = this.areas.find((a) => a.id === this.selectedAreaId);
      if (!area) return;

      area.href = this.propHref.value.trim();
      area.alt = this.propAlt.value.trim();
      area.title = this.propTitle.value.trim();
      area.target = this.propTarget.value;

      // 座標手動変更
      const manualCoords = parseCoords(this.propCoords.value);
      if (manualCoords.length >= 3) {
        area.coords = manualCoords;
      }

      this.canvasController.render();
      this.renderAreaList();
      this.updateHtmlPreview();
    };

    this.propHref.addEventListener('input', updateCurrentAreaProp);
    this.propAlt.addEventListener('input', updateCurrentAreaProp);
    this.propTitle.addEventListener('input', updateCurrentAreaProp);
    this.propTarget.addEventListener('change', updateCurrentAreaProp);
    this.propCoords.addEventListener('change', updateCurrentAreaProp);

    // エリア削除ボタン
    this.btnDeleteArea.addEventListener('click', () => {
      this.canvasController.deleteSelectedArea();
    });

    // コードコピーボタン
    this.btnCopyHtml.addEventListener('click', () => {
      const code = this.htmlPreview.value;
      if (!code) return;
      navigator.clipboard.writeText(code).then(() => {
        this.showToast('HTMLコードをクリップボードにコピーしました！');
      }).catch(() => {
        this.showToast('コピーに失敗しました', 'error');
      });
    });

    // タグを更新ボタン
    if (this.btnUpdateEditor) {
      this.btnUpdateEditor.addEventListener('click', async () => {
        const fullCode = this.htmlPreview.value;
        if (!fullCode) return;

        if (window.electronAPI?.updateImageMapCode) {
          const mapOnlyCode = generateHtml({
            mapName: this.mapName,
            imageSrc: this.imageSrc,
            imageAlt: this.imageAlt,
            areas: this.areas,
            includeImg: false,
            extraAttrs: this.extraAttrs
          });
          const altAttr = (this.imageAlt !== undefined && this.imageAlt !== null) ? ` alt="${this.imageAlt}"` : '';
          const imgOnlyCode = this.imageSrc ? `<img src="${this.imageSrc}" usemap="#${this.mapName}"${altAttr}>` : '';

          const payload = {
            fullCode,
            mapOnlyCode,
            imgOnlyCode,
            mapName: this.mapName,
            originalMapName: this.originalMapName || this.mapName,
            includeImg: this.checkIncludeImg.checked,
            imageSrc: this.imageSrc
          };

          const ok = await window.electronAPI.updateImageMapCode(payload);
          if (ok) {
            this.showToast('本体エディタのMAPタグを更新しました！');
            this.originalMapName = this.mapName;
            this.setUpdateAvailable(true, this.mapName);
          } else {
            this.showToast('エディタ内に更新対象のMAPタグが見つかりませんでした。「タグを挿入」をお使いください', 'warning');
          }
        } else {
          navigator.clipboard.writeText(fullCode);
          this.showToast('クリップボードにコピーしました');
        }
      });
    }

    // エディタに挿入ボタン
    this.btnInsertToEditor.addEventListener('click', async () => {
      const code = this.htmlPreview.value;
      if (!code) return;
      if (window.electronAPI?.insertImageMapCode) {
        const ok = await window.electronAPI.insertImageMapCode(code);
        if (ok) {
          this.showToast('メインエディタにHTMLコードを挿入しました！');
          this.originalMapName = this.mapName;
          this.setUpdateAvailable(true, this.mapName);
        } else {
          this.showToast('エディタへの挿入に失敗しました', 'error');
        }
      } else {
        navigator.clipboard.writeText(code);
        this.showToast('クリップボードにコピーしました');
      }
    });

    // インポートモーダル操作
    this.btnImportHtml.addEventListener('click', () => {
      this.importInput.value = '';
      this.importDialog.showModal();
    });

    this.btnCancelImport.addEventListener('click', () => {
      this.importDialog.close();
    });

    this.btnConfirmImport.addEventListener('click', () => {
      const text = this.importInput.value.trim();
      if (text) {
        this.importHtmlCode(text);
      }
      this.importDialog.close();
    });

    // 外部からのデータロード受信用 (IPC)
    if (window.electronAPI?.onLoadImageMapData) {
      window.electronAPI.onLoadImageMapData((data) => {
        if (data) {
          this.loadInitialContext(data);
        }
      });
    }
  }

  setUpdateAvailable(available, mapName = null) {
    this.hasExistingMap = Boolean(available);
    if (mapName) {
      this.originalMapName = mapName;
    }
    if (this.btnUpdateEditor) {
      this.btnUpdateEditor.disabled = !this.hasExistingMap;
      if (this.hasExistingMap) {
        this.btnUpdateEditor.classList.add('btn-primary');
        this.btnInsertToEditor?.classList.remove('btn-primary');
        this.btnUpdateEditor.title = '本体エディタの既存MAPタグを更新';
      } else {
        this.btnUpdateEditor.classList.remove('btn-primary');
        this.btnInsertToEditor?.classList.add('btn-primary');
        this.btnUpdateEditor.title = '本体エディタに更新対象のMAPタグがありません（新規挿入を使用してください）';
      }
    }
  }

  async initData() {
    if (window.electronAPI?.getImageMapInitData) {
      const initData = await window.electronAPI.getImageMapInitData();
      if (initData) {
        this.loadInitialContext(initData);
      }
    }
  }

  loadInitialContext(data) {
    let htmlCode = '';
    let baseDir = '';

    if (typeof data === 'string') {
      htmlCode = data;
    } else if (typeof data === 'object' && data !== null) {
      htmlCode = data.html || data.text || '';
      baseDir = data.baseDir || data.dir || '';
      if (data.hasExistingMap !== undefined) {
        this.setUpdateAvailable(data.hasExistingMap, data.originalMapName || data.mapName);
      }
      if (data.imagePath) {
        this.baseDir = baseDir;
        this.loadImageFromPath(data.imagePath, baseDir);
        return;
      }
    }

    if (baseDir) {
      this.baseDir = baseDir;
    }

    if (htmlCode) {
      if (htmlCode.includes('<map') || htmlCode.includes('<area') || htmlCode.includes('<img')) {
        this.importHtmlCode(htmlCode, baseDir);
      } else if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(htmlCode.trim())) {
        this.loadImageFromPath(htmlCode.trim(), baseDir);
      }
    }
  }

  syncToolButtons(tool) {
    this.toolBtns.forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  setTool(tool) {
    this.syncToolButtons(tool);
    this.canvasController.setTool(tool);
  }

  async handleSelectImage() {
    if (window.electronAPI?.selectImageFile) {
      const result = await window.electronAPI.selectImageFile();
      if (result && result.dataUri) {
        this.loadImage(result.dataUri, result.relativePath || result.fileName, result.fileName);
      }
    }
  }

  async loadImageFromPath(imagePath, baseDir) {
    if (!imagePath) return;

    this.imageSrc = imagePath;
    this.imageSrcInput.value = imagePath;

    // 1. Web URL または Data URI
    if (/^(https?:\/\/|data:)/i.test(imagePath)) {
      this.loadImage(imagePath, imagePath, imagePath.split('/').pop().split('?')[0]);
      return;
    }

    // 2. Electron IPC 経由でローカル画像取得
    if (window.electronAPI?.getImageInfo) {
      const info = await window.electronAPI.getImageInfo(imagePath, baseDir || this.baseDir);
      if (info && info.exists && info.dataUri) {
        this.loadImage(info.dataUri, imagePath, info.fileName);
        return;
      }
    }

    // 3. ローカルプレビューサーバー経由
    if (window.electronAPI?.getServerInfo) {
      try {
        const sInfo = await window.electronAPI.getServerInfo();
        if (sInfo && sInfo.port) {
          const clean = imagePath.replace(/^\.?\//, '');
          const serverUrl = `http://127.0.0.1:${sInfo.port}/${clean}`;
          this.loadImage(serverUrl, imagePath, imagePath.split('/').pop().split('?')[0]);
          return;
        }
      } catch {}
    }

    // 4. 直接img.srcに設定
    this.imageEl.src = imagePath;
  }

  loadImage(src, displayPath, fileName) {
    this.imageSrc = displayPath || fileName || 'image.jpg';
    this.imageSrcInput.value = this.imageSrc;
    this.imageEl.src = src;
  }

  handleAreaSelected(areaId) {
    this.selectedAreaId = areaId;
    const area = this.areas.find((a) => a.id === areaId);

    if (area) {
      this.areaPropPanel.classList.remove('disabled');
      this.propShape.value = (area.shape || 'rect').toUpperCase();
      this.propCoords.value = formatCoords(area.coords);
      this.propHref.value = area.href || '';
      this.propAlt.value = area.alt || '';
      this.propTitle.value = area.title || '';
      this.propTarget.value = area.target || '';
      this.btnDeleteArea.disabled = false;
    } else {
      this.areaPropPanel.classList.add('disabled');
      this.propShape.value = '-';
      this.propCoords.value = '';
      this.propHref.value = '';
      this.propAlt.value = '';
      this.propTitle.value = '';
      this.propTarget.value = '';
      this.btnDeleteArea.disabled = true;
    }

    this.renderAreaList();
  }

  handleAreaAdded(newArea) {
    if (!this.areas.some((a) => a.id === newArea.id)) {
      this.areas.push(newArea);
    }
    this.selectedAreaId = newArea.id;
    this.syncToolButtons('select');
    this.handleAreaSelected(newArea.id);
    this.updateHtmlPreview();
    this.showToast(`エリア (#${this.areas.length}) を追加しました`);

    // 属性入力欄（リンクURL）に自動フォーカス
    setTimeout(() => {
      if (this.propHref) {
        this.propHref.focus();
        this.propHref.select();
      }
    }, 60);
  }

  handleAreaUpdated(updatedArea) {
    const idx = this.areas.findIndex((a) => a.id === updatedArea.id);
    if (idx !== -1) {
      this.areas[idx] = updatedArea;
      if (this.selectedAreaId === updatedArea.id) {
        this.propCoords.value = formatCoords(updatedArea.coords);
      }
      this.renderAreaList();
      this.updateHtmlPreview();
    }
  }

  renderAreaList() {
    if (this.areaCountBadge) {
      this.areaCountBadge.textContent = this.areas.length;
    }
    this.areaListEl.innerHTML = '';

    if (this.areas.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'area-list-empty';
      empty.textContent = 'エリアが登録されていません。画像上をドラッグして矩形を作成してください。';
      this.areaListEl.appendChild(empty);
      return;
    }

    this.areas.forEach((area, index) => {
      const isSelected = area.id === this.selectedAreaId;
      const item = document.createElement('div');
      item.className = `area-item ${isSelected ? 'selected' : ''}`;
      item.dataset.areaId = area.id;

      // アイコン
      const icon = document.createElement('span');
      icon.className = `area-item-badge shape-${area.shape}`;
      icon.textContent = area.shape === 'rect' ? '矩形' : area.shape === 'circle' ? '円' : '多角';

      // 情報テキスト
      const info = document.createElement('div');
      info.className = 'area-item-info';
      const title = document.createElement('div');
      title.className = 'area-item-title';
      title.textContent = area.alt ? `#${index + 1}: ${area.alt}` : `#${index + 1} (${area.shape})`;
      const coords = document.createElement('div');
      coords.className = 'area-item-coords';
      coords.textContent = `${area.href || '(リンクなし)'} [${formatCoords(area.coords)}]`;
      info.appendChild(title);
      info.appendChild(coords);

      // 削除ボタン
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'area-item-delete';
      delBtn.title = '削除';
      delBtn.innerHTML = '&times;';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.canvasController.selectArea(area.id);
        this.canvasController.deleteSelectedArea();
        this.areas = this.areas.filter((a) => a.id !== area.id);
        this.renderAreaList();
        this.updateHtmlPreview();
      });

      item.appendChild(icon);
      item.appendChild(info);
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        this.canvasController.selectArea(area.id);
      });

      this.areaListEl.appendChild(item);
    });
  }

  updateHtmlPreview() {
    const html = generateHtml({
      mapName: this.mapName,
      imageSrc: this.imageSrc,
      imageAlt: this.imageAlt,
      areas: this.areas,
      includeImg: this.checkIncludeImg.checked,
      extraAttrs: this.extraAttrs
    });
    this.htmlPreview.value = html;
  }

  /**
   * HTMLコードをパースしてビジュアル反映（逆引き解析）
   */
  importHtmlCode(htmlString, baseDir) {
    const parsed = parseHtml(htmlString);

    if (parsed.mapName) {
      this.mapName = parsed.mapName;
      this.mapNameInput.value = this.mapName;
      if (htmlString.includes('<map')) {
        this.setUpdateAvailable(true, parsed.mapName);
      }
    }

    if (parsed.imageSrc) {
      this.imageSrc = parsed.imageSrc;
      this.imageSrcInput.value = this.imageSrc;
      this.loadImageFromPath(parsed.imageSrc, baseDir || this.baseDir);
    }

    if (parsed.imageAlt !== undefined) {
      this.imageAlt = parsed.imageAlt;
      this.imageAltInput.value = this.imageAlt;
    }

    if (parsed.extraAttrs) {
      this.extraAttrs = parsed.extraAttrs;
    }

    if (parsed.areas && parsed.areas.length > 0) {
      this.areas = parsed.areas;
      this.selectedAreaId = this.areas[0].id;
      this.canvasController.setAreas(this.areas, this.selectedAreaId);
      this.renderAreaList();
      this.handleAreaSelected(this.selectedAreaId);
      this.updateHtmlPreview();
      this.showToast(`${this.areas.length} 件のエリアを読み込みました！`);
    } else {
      // <img>タグのみ等、エリアがまだ存在しない初期状態
      this.areas = [];
      this.selectedAreaId = null;
      this.canvasController.setAreas([], null);
      this.renderAreaList();
      this.handleAreaSelected(null);
      this.updateHtmlPreview();
      if (parsed.imageSrc) {
        this.showToast(`画像 (${parsed.imageSrc}) を読み込みました。描画ツールでリンクエリアを作成してください。`);
      } else {
        this.showToast('HTMLコードをインポートしました。描画ツールでエリアを作成してください。');
      }
    }
  }

  showToast(message, type = 'info') {
    this.toastEl.textContent = message;
    this.toastEl.className = `toast show ${type}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.className = 'toast';
    }, 2800);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ImageMapEditorApp();
});
