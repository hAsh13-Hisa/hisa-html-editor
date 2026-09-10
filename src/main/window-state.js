import { app, screen } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

const DEFAULT_STATE = {
  width: 1300,
  height: 850,
  minWidth: 800,
  minHeight: 550,
  x: undefined,
  y: undefined,
  isMaximized: false
};

/**
 * 前回のウィンドウ位置・サイズを復元
 */
export function loadWindowState() {
  const filePath = getStateFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (isValidBounds(data)) {
        return { ...DEFAULT_STATE, ...data };
      }
    }
  } catch (err) {
    console.warn('[WindowState] Failed to load state:', err);
  }
  return { ...DEFAULT_STATE };
}

/**
 * 画面外（マルチモニター切断時等）にウィンドウが出てしまっていないか検証
 */
function isValidBounds(state) {
  if (typeof state.x !== 'number' || typeof state.y !== 'number') return false;
  if (typeof state.width !== 'number' || typeof state.height !== 'number') return false;

  try {
    const displays = screen.getAllDisplays();
    return displays.some((display) => {
      const b = display.bounds;
      return (
        state.x >= b.x - 20 &&
        state.x < b.x + b.width - 100 &&
        state.y >= b.y - 20 &&
        state.y < b.y + b.height - 100
      );
    });
  } catch {
    return true;
  }
}

/**
 * ウィンドウの位置・サイズ変更および終了時の確定保存を監視
 */
export function trackWindowState(win) {
  let saveTimer = null;

  const saveState = () => {
    if (!win || win.isDestroyed()) return;

    try {
      const isMaximized = win.isMaximized();
      let bounds;
      if (isMaximized) {
        bounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
      } else {
        bounds = win.getBounds();
      }

      const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized
      };

      fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[WindowState] Failed to save state:', err);
    }
  };

  const debouncedSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 500);
  };

  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);
  win.on('close', saveState);
}
