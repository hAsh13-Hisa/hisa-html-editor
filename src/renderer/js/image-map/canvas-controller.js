/**
 * イメージマップのビジュアルキャンバス制御（SVGオーバーレイ・描画・変形・選択）
 */

export class CanvasController {
  constructor({
    stageEl,
    stageContentEl,
    imageEl,
    svgEl,
    onSelectArea,
    onAddArea,
    onUpdateArea,
    onHoverCoords,
    onToolChange
  }) {
    this.stageEl = stageEl;
    this.stageContentEl = stageContentEl;
    this.imageEl = imageEl;
    this.svgEl = svgEl;

    this.onSelectArea = onSelectArea;
    this.onAddArea = onAddArea;
    this.onUpdateArea = onUpdateArea;
    this.onHoverCoords = onHoverCoords;
    this.onToolChange = onToolChange;

    this.currentTool = 'select'; // 'select' | 'rect' | 'circle' | 'poly'
    this.zoomMode = '100'; // 'fit' | '50' | '100' | '150' | '200'
    this.zoomScale = 1.0;

    this.areas = []; // エリアリスト
    this.selectedAreaId = null;

    // ドラッグ/描画ステート
    this.dragState = null;
    this.polyPoints = []; // poly描画中の頂点一時配列

    this.initEvents();
  }

  initEvents() {
    // ステージ上のマウスイベント
    this.svgEl.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

    // 多角形確定用ダブルクリック
    this.svgEl.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    // キーボード操作（Delete/Backspace で削除、Esc で多角形キャンセル等）
    window.addEventListener('keydown', (e) => {
      // 入力フォームにフォーカスがあるときは除外
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedAreaId) {
        e.preventDefault();
        this.deleteSelectedArea();
      } else if (e.key === 'Escape') {
        if (this.currentTool === 'poly' && this.polyPoints.length > 0) {
          this.cancelPolyDrawing();
        }
      } else if (e.key === 'Enter') {
        if (this.currentTool === 'poly' && this.polyPoints.length >= 3) {
          this.finishPolyDrawing();
        }
      }
    });

    // リサイズ監視
    window.addEventListener('resize', () => {
      if (this.zoomMode === 'fit') {
        this.applyZoom('fit');
      }
    });
  }

  /**
   * 画像読み込み完了後の初期化
   */
  onImageLoaded() {
    const nw = this.imageEl.naturalWidth;
    const nh = this.imageEl.naturalHeight;

    if (!nw || !nh) return;

    // コンテナとSVGのviewBoxを設定
    this.stageContentEl.style.width = `${nw}px`;
    this.stageContentEl.style.height = `${nh}px`;

    this.svgEl.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    this.svgEl.setAttribute('width', nw);
    this.svgEl.setAttribute('height', nh);

    this.applyZoom(this.zoomMode);
    this.render();
  }

  /**
   * ズーム倍率の適用
   */
  applyZoom(mode) {
    this.zoomMode = mode;
    const nw = this.imageEl.naturalWidth;
    const nh = this.imageEl.naturalHeight;

    if (!nw || !nh) return;

    if (mode === 'fit') {
      const containerWidth = this.stageEl.clientWidth - 40;
      const containerHeight = this.stageEl.clientHeight - 40;
      const scaleX = Math.max(0.1, containerWidth / nw);
      const scaleY = Math.max(0.1, containerHeight / nh);
      this.zoomScale = Math.min(scaleX, scaleY, 1.0); // fit時は最大100%
    } else {
      this.zoomScale = parseFloat(mode) / 100;
    }

    this.stageContentEl.style.transform = `scale(${this.zoomScale})`;
    this.stageContentEl.style.transformOrigin = '0 0';

    // ステージコンテナのスクロール領域がスケールに合致するようマージン等を調整
    const scaledW = Math.round(nw * this.zoomScale);
    const scaledH = Math.round(nh * this.zoomScale);
    this.stageContentEl.style.marginRight = `${Math.max(20, scaledW - nw)}px`;
    this.stageContentEl.style.marginBottom = `${Math.max(20, scaledH - nh)}px`;
  }

  /**
   * ツール切り替え
   */
  setTool(tool) {
    if (this.currentTool === 'poly' && this.polyPoints.length > 0) {
      this.cancelPolyDrawing();
    }
    this.currentTool = tool;
    this.svgEl.setAttribute('data-tool', tool);
    this.render();
    if (this.onToolChange) {
      this.onToolChange(tool);
    }
  }

  /**
   * エリア一覧の設定
   */
  setAreas(areas, selectId = null) {
    this.areas = [...areas];
    if (selectId) {
      this.selectedAreaId = selectId;
    } else if (this.areas.length > 0 && !this.areas.some((a) => a.id === this.selectedAreaId)) {
      this.selectedAreaId = this.areas[0].id;
    }
    this.render();
  }

  /**
   * 特定エリアの選択
   */
  selectArea(areaId) {
    if (this.selectedAreaId !== areaId) {
      this.selectedAreaId = areaId;
      this.render();
      if (this.onSelectArea) {
        this.onSelectArea(areaId);
      }
    }
  }

  /**
   * 選択中エリアの削除
   */
  deleteSelectedArea() {
    if (!this.selectedAreaId) return;
    const index = this.areas.findIndex((a) => a.id === this.selectedAreaId);
    if (index !== -1) {
      this.areas.splice(index, 1);
      const nextId = this.areas[Math.min(index, this.areas.length - 1)]?.id || null;
      this.selectedAreaId = nextId;
      this.render();
      if (this.onSelectArea) {
        this.onSelectArea(nextId);
      }
    }
  }

  /**
   * 画面座標を画像の元ピクセル座標に変換
   */
  getCanvasCoords(e) {
    const rect = this.svgEl.getBoundingClientRect();
    const nw = this.imageEl.naturalWidth;
    const nh = this.imageEl.naturalHeight;

    if (!rect.width || !rect.height || !nw || !nh) {
      return { x: 0, y: 0 };
    }

    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;

    let x = Math.round(relX * nw);
    let y = Math.round(relY * nh);

    x = Math.max(0, Math.min(nw, x));
    y = Math.max(0, Math.min(nh, y));

    return { x, y };
  }

  // --- マウス操作ハンドラー ---

  handleMouseDown(e) {
    if (e.button !== 0) return; // 左クリックのみ
    const coords = this.getCanvasCoords(e);

    // 1. ハンドルドラッグ中かどうかの判定
    const handleEl = e.target.closest('[data-handle]');
    if (handleEl && this.selectedAreaId) {
      const handleType = handleEl.getAttribute('data-handle');
      const pointIndex = parseInt(handleEl.getAttribute('data-point-index') || '0', 10);
      const area = this.areas.find((a) => a.id === this.selectedAreaId);
      if (area) {
        this.dragState = {
          type: 'resize',
          handle: handleType,
          pointIndex,
          area: { ...area, coords: [...area.coords] },
          startCoords: coords,
          origCoords: [...area.coords]
        };
        e.stopPropagation();
        return;
      }
    }

    // 2. 選択ツールモード
    if (this.currentTool === 'select') {
      const shapeEl = e.target.closest('[data-area-id]');
      if (shapeEl) {
        const areaId = shapeEl.getAttribute('data-area-id');
        this.selectArea(areaId);
        const area = this.areas.find((a) => a.id === areaId);
        if (area) {
          this.dragState = {
            type: 'move',
            areaId,
            startCoords: coords,
            origCoords: [...area.coords]
          };
        }
        e.stopPropagation();
        return;
      } else {
        // 余白クリックで選択解除
        this.selectArea(null);
      }
    }

    // 3. 矩形描画モード
    if (this.currentTool === 'rect') {
      this.dragState = {
        type: 'draw-rect',
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y
      };
      this.render();
    }

    // 4. 円形描画モード
    if (this.currentTool === 'circle') {
      this.dragState = {
        type: 'draw-circle',
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y
      };
      this.render();
    }

    // 5. 多角形描画モード
    if (this.currentTool === 'poly') {
      // 始点付近をクリックした場合は多角形を閉じて確定
      if (this.polyPoints.length >= 3) {
        const startPt = this.polyPoints[0];
        const dist = Math.hypot(coords.x - startPt.x, coords.y - startPt.y);
        if (dist <= 12 / this.zoomScale) {
          this.finishPolyDrawing();
          return;
        }
      }

      this.polyPoints.push({ x: coords.x, y: coords.y });
      this.render();
    }
  }

  handleMouseMove(e) {
    const coords = this.getCanvasCoords(e);
    if (this.onHoverCoords) {
      this.onHoverCoords(coords.x, coords.y);
    }

    if (!this.dragState && !(this.currentTool === 'poly' && this.polyPoints.length > 0)) {
      return;
    }

    // 1. 移動ドラッグ
    if (this.dragState?.type === 'move') {
      const dx = coords.x - this.dragState.startCoords.x;
      const dy = coords.y - this.dragState.startCoords.y;
      const area = this.areas.find((a) => a.id === this.dragState.areaId);
      if (area) {
        const orig = this.dragState.origCoords;
        if (area.shape === 'rect') {
          const w = orig[2] - orig[0];
          const h = orig[3] - orig[1];
          let x1 = orig[0] + dx;
          let y1 = orig[1] + dy;
          // 境界制約
          x1 = Math.max(0, Math.min(this.imageEl.naturalWidth - w, x1));
          y1 = Math.max(0, Math.min(this.imageEl.naturalHeight - h, y1));
          area.coords = [Math.round(x1), Math.round(y1), Math.round(x1 + w), Math.round(y1 + h)];
        } else if (area.shape === 'circle') {
          const r = orig[2];
          let cx = orig[0] + dx;
          let cy = orig[1] + dy;
          cx = Math.max(r, Math.min(this.imageEl.naturalWidth - r, cx));
          cy = Math.max(r, Math.min(this.imageEl.naturalHeight - r, cy));
          area.coords = [Math.round(cx), Math.round(cy), r];
        } else if (area.shape === 'poly') {
          const newCoords = [];
          for (let i = 0; i < orig.length; i += 2) {
            newCoords.push(Math.round(orig[i] + dx));
            newCoords.push(Math.round(orig[i + 1] + dy));
          }
          area.coords = newCoords;
        }
        this.render();
        if (this.onUpdateArea) this.onUpdateArea(area);
      }
    }

    // 2. リサイズドラッグ
    else if (this.dragState?.type === 'resize') {
      const handle = this.dragState.handle;
      const orig = this.dragState.origCoords;
      const area = this.areas.find((a) => a.id === this.selectedAreaId);
      if (area) {
        if (area.shape === 'rect') {
          let [x1, y1, x2, y2] = orig;
          if (handle.includes('w')) x1 = coords.x;
          if (handle.includes('e')) x2 = coords.x;
          if (handle.includes('n')) y1 = coords.y;
          if (handle.includes('s')) y2 = coords.y;

          // 座標の正規化
          const minX = Math.min(x1, x2);
          const maxX = Math.max(x1, x2);
          const minY = Math.min(y1, y2);
          const maxY = Math.max(y1, y2);

          area.coords = [minX, minY, maxX, maxY];
        } else if (area.shape === 'circle') {
          const [cx, cy] = orig;
          const r = Math.round(Math.hypot(coords.x - cx, coords.y - cy));
          area.coords = [cx, cy, Math.max(5, r)];
        } else if (area.shape === 'poly') {
          const pIdx = this.dragState.pointIndex;
          const newCoords = [...orig];
          newCoords[pIdx * 2] = coords.x;
          newCoords[pIdx * 2 + 1] = coords.y;
          area.coords = newCoords;
        }
        this.render();
        if (this.onUpdateArea) this.onUpdateArea(area);
      }
    }

    // 3. 矩形描画中
    else if (this.dragState?.type === 'draw-rect') {
      this.dragState.currentX = coords.x;
      this.dragState.currentY = coords.y;
      this.render();
    }

    // 4. 円描画中
    else if (this.dragState?.type === 'draw-circle') {
      this.dragState.currentX = coords.x;
      this.dragState.currentY = coords.y;
      this.render();
    }

    // 5. 多角形描画中の仮線
    else if (this.currentTool === 'poly' && this.polyPoints.length > 0) {
      this.currentHoverCoords = coords;
      this.render();
    }
  }

  handleMouseUp(e) {
    if (!this.dragState) return;

    try {
      if (this.dragState.type === 'draw-rect') {
        const { startX, startY, currentX, currentY } = this.dragState;
        const x1 = Math.min(startX, currentX);
        const y1 = Math.min(startY, currentY);
        const x2 = Math.max(startX, currentX);
        const y2 = Math.max(startY, currentY);

        // 最小サイズチェック (5px以上)
        if (x2 - x1 >= 5 && y2 - y1 >= 5) {
          const newArea = {
            id: `area_${Date.now()}`,
            shape: 'rect',
            coords: [x1, y1, x2, y2],
            href: '#',
            alt: '',
            title: '',
            target: ''
          };
          this.areas.push(newArea);
          this.selectedAreaId = newArea.id;
          this.setTool('select');
          if (this.onAddArea) this.onAddArea(newArea);
        }
      } else if (this.dragState.type === 'draw-circle') {
        const { startX, startY, currentX, currentY } = this.dragState;
        const r = Math.round(Math.hypot(currentX - startX, currentY - startY));
        if (r >= 5) {
          const newArea = {
            id: `area_${Date.now()}`,
            shape: 'circle',
            coords: [startX, startY, r],
            href: '#',
            alt: '',
            title: '',
            target: ''
          };
          this.areas.push(newArea);
          this.selectedAreaId = newArea.id;
          this.setTool('select');
          if (this.onAddArea) this.onAddArea(newArea);
        }
      }
    } finally {
      this.dragState = null;
      this.render();
    }
  }

  handleDoubleClick(e) {
    if (this.currentTool === 'poly' && this.polyPoints.length >= 3) {
      this.finishPolyDrawing();
    }
  }

  finishPolyDrawing() {
    if (this.polyPoints.length < 3) return;

    const coords = [];
    for (const pt of this.polyPoints) {
      coords.push(pt.x, pt.y);
    }

    const newArea = {
      id: `area_${Date.now()}`,
      shape: 'poly',
      coords,
      href: '#',
      alt: '',
      title: '',
      target: ''
    };

    this.areas.push(newArea);
    this.selectedAreaId = newArea.id;
    this.polyPoints = [];
    this.setTool('select');
    if (this.onAddArea) this.onAddArea(newArea);
    this.render();
  }

  cancelPolyDrawing() {
    this.polyPoints = [];
    this.render();
  }

  // --- SVG レンダリング ---

  render() {
    // 既存の動的要素をクリア（背景画像・親コンテナ以外）
    this.svgEl.innerHTML = '';

    const fragment = document.createDocumentFragment();

    // 1. 各登録済みエリアの描画
    this.areas.forEach((area, index) => {
      const isSelected = area.id === this.selectedAreaId;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', `area-group ${isSelected ? 'selected' : ''}`);
      g.setAttribute('data-area-id', area.id);

      let shapeEl = null;

      if (area.shape === 'rect') {
        const [x1, y1, x2, y2] = area.coords;
        shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        shapeEl.setAttribute('x', Math.min(x1, x2));
        shapeEl.setAttribute('y', Math.min(y1, y2));
        shapeEl.setAttribute('width', Math.abs(x2 - x1));
        shapeEl.setAttribute('height', Math.abs(y2 - y1));
      } else if (area.shape === 'circle') {
        const [cx, cy, r] = area.coords;
        shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shapeEl.setAttribute('cx', cx);
        shapeEl.setAttribute('cy', cy);
        shapeEl.setAttribute('r', r);
      } else if (area.shape === 'poly') {
        const pointsStr = [];
        for (let i = 0; i < area.coords.length; i += 2) {
          pointsStr.push(`${area.coords[i]},${area.coords[i + 1]}`);
        }
        shapeEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        shapeEl.setAttribute('points', pointsStr.join(' '));
      }

      if (shapeEl) {
        shapeEl.setAttribute('class', 'area-shape');
        g.appendChild(shapeEl);

        // ラベル（番号 or alt）
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('class', 'area-label');
        const center = this.getAreaCenter(area);
        label.setAttribute('x', center.x);
        label.setAttribute('y', center.y);
        label.textContent = area.alt ? `${index + 1}: ${area.alt}` : `#${index + 1}`;
        g.appendChild(label);
      }

      // 選択中の場合、リサイズハンドルを描画
      if (isSelected) {
        this.renderHandles(g, area);
      }

      fragment.appendChild(g);
    });

    // 2. ドラッグ中の仮描画（矩形）
    if (this.dragState?.type === 'draw-rect') {
      const { startX, startY, currentX, currentY } = this.dragState;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('class', 'area-shape drawing');
      rect.setAttribute('x', Math.min(startX, currentX));
      rect.setAttribute('y', Math.min(startY, currentY));
      rect.setAttribute('width', Math.abs(currentX - startX));
      rect.setAttribute('height', Math.abs(currentY - startY));
      fragment.appendChild(rect);
    }

    // 3. ドラッグ中の仮描画（円形）
    if (this.dragState?.type === 'draw-circle') {
      const { startX, startY, currentX, currentY } = this.dragState;
      const r = Math.round(Math.hypot(currentX - startX, currentY - startY));
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('class', 'area-shape drawing');
      circle.setAttribute('cx', startX);
      circle.setAttribute('cy', startY);
      circle.setAttribute('r', r);
      fragment.appendChild(circle);
    }

    // 4. 多角形作成中の線・頂点描画
    if (this.currentTool === 'poly' && this.polyPoints.length > 0) {
      const polyGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      polyGroup.setAttribute('class', 'poly-drawing-group');

      // 確定済み線の描画
      const pts = [...this.polyPoints];
      if (this.currentHoverCoords) {
        pts.push(this.currentHoverCoords);
      }
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      polyline.setAttribute('class', 'poly-drawing-line');
      polyline.setAttribute('points', pts.map((p) => `${p.x},${p.y}`).join(' '));
      polyGroup.appendChild(polyline);

      // 各頂点の丸
      this.polyPoints.forEach((p, idx) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('class', `poly-drawing-point ${idx === 0 ? 'start-point' : ''}`);
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        dot.setAttribute('r', idx === 0 ? 6 : 4);
        polyGroup.appendChild(dot);
      });

      fragment.appendChild(polyGroup);
    }

    this.svgEl.appendChild(fragment);
  }

  /**
   * 選択中エリアのリサイズハンドル描画
   */
  renderHandles(group, area) {
    const handleSize = 8;

    if (area.shape === 'rect') {
      const [x1, y1, x2, y2] = area.coords;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;

      const handles = [
        { type: 'nw', x: minX, y: minY },
        { type: 'n',  x: midX, y: minY },
        { type: 'ne', x: maxX, y: minY },
        { type: 'e',  x: maxX, y: midY },
        { type: 'se', x: maxX, y: maxY },
        { type: 's',  x: midX, y: maxY },
        { type: 'sw', x: minX, y: maxY },
        { type: 'w',  x: minX, y: midY }
      ];

      handles.forEach((h) => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', `resize-handle handle-${h.type}`);
        rect.setAttribute('data-handle', h.type);
        rect.setAttribute('x', h.x - handleSize / 2);
        rect.setAttribute('y', h.y - handleSize / 2);
        rect.setAttribute('width', handleSize);
        rect.setAttribute('height', handleSize);
        group.appendChild(rect);
      });
    } else if (area.shape === 'circle') {
      const [cx, cy, r] = area.coords;
      const circleHandle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circleHandle.setAttribute('class', 'resize-handle handle-circle-r');
      circleHandle.setAttribute('data-handle', 'circle-r');
      circleHandle.setAttribute('cx', cx + r);
      circleHandle.setAttribute('cy', cy);
      circleHandle.setAttribute('r', handleSize / 2);
      group.appendChild(circleHandle);
    } else if (area.shape === 'poly') {
      for (let i = 0; i < area.coords.length; i += 2) {
        const px = area.coords[i];
        const py = area.coords[i + 1];
        const pIndex = i / 2;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('class', 'resize-handle handle-poly-point');
        rect.setAttribute('data-handle', 'poly-point');
        rect.setAttribute('data-point-index', pIndex);
        rect.setAttribute('x', px - handleSize / 2);
        rect.setAttribute('y', py - handleSize / 2);
        rect.setAttribute('width', handleSize);
        rect.setAttribute('height', handleSize);
        group.appendChild(rect);
      }
    }
  }

  getAreaCenter(area) {
    if (area.shape === 'rect') {
      const [x1, y1, x2, y2] = area.coords;
      return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    }
    if (area.shape === 'circle') {
      return { x: area.coords[0], y: area.coords[1] };
    }
    if (area.shape === 'poly') {
      let sumX = 0, sumY = 0, count = 0;
      for (let i = 0; i < area.coords.length; i += 2) {
        sumX += area.coords[i];
        sumY += area.coords[i + 1];
        count++;
      }
      return { x: sumX / (count || 1), y: sumY / (count || 1) };
    }
    return { x: 0, y: 0 };
  }
}
