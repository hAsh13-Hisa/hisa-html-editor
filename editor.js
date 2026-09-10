(() => {
  const textarea = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const openButton = document.getElementById("openFile");
  const saveButton = document.getElementById("saveFile");
  const newButton = document.getElementById("newFile");
  const currentFileLabel = document.getElementById("currentFile");
  const workspace = document.querySelector(".workspace");
  const previewPane = document.querySelector(".preview-pane");
  const editorPane = document.querySelector(".editor-pane");
  const splitter = document.getElementById("paneSplitter");
  const settingsContainer = document.getElementById("settings");
  const settingsButton = document.getElementById("settingsButton");
  const settingsMenu = document.getElementById("settingsMenu");
  const fontSizeSelect = document.getElementById("editorFontSize");
  const tabSizeSelect = document.getElementById("editorTabSize");
  const lineNumbersToggle = document.getElementById("editorLineNumbers");
  const lineWrapToggle = document.getElementById("editorLineWrap");
  const themeInputs = settingsMenu
    ? Array.from(settingsMenu.querySelectorAll('input[name="theme"]'))
    : [];

  if (
    !textarea ||
    !preview ||
    !openButton ||
    !saveButton ||
    !newButton ||
    !currentFileLabel ||
    !settingsButton ||
    !settingsMenu ||
    !fontSizeSelect ||
    !tabSizeSelect ||
    !lineNumbersToggle ||
    !lineWrapToggle
  ) {
    console.error("必要なDOM要素を取得できませんでした");
    return;
  }

  if (typeof CodeMirror !== "function") {
    console.error("CodeMirror の読み込みに失敗しました");
    return;
  }

  const previewBridgeUrl = chrome.runtime.getURL("preview-bridge.js");
  const THEME_STORAGE_KEY = "html-editor.theme";
  const VALID_THEMES = new Set(["dark", "light", "system"]);
  const EDITOR_SETTINGS_STORAGE_KEY = "html-editor.editor-settings";
  const ALLOWED_TAB_SIZES = new Set([2, 4, 8]);
  const FONT_SIZE_RANGE = { min: 10, max: 22 };
  const systemPrefersDark = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;
  let themePreference = "dark";
  let settingsMenuOpen = false;
  let editorInstance = null;
  const createDefaultEditorSettings = () => ({
    fontSize: 14,
    tabSize: 2,
    lineNumbers: true,
    lineWrapping: true
  });
  let editorSettings = createDefaultEditorSettings();

  const getStoredThemePreference = () => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && VALID_THEMES.has(stored)) {
        return stored;
      }
    } catch (error) {
      console.warn("テーマ設定の読み込みに失敗しました", error);
    }
    return "dark";
  };

  const storeThemePreference = (preference) => {
    if (!VALID_THEMES.has(preference)) {
      return;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch (error) {
      console.warn("テーマ設定の保存に失敗しました", error);
    }
  };

  const resolveAppliedTheme = () => {
    if (themePreference === "system") {
      if (systemPrefersDark && typeof systemPrefersDark.matches === "boolean") {
        return systemPrefersDark.matches ? "dark" : "light";
      }
      return "dark";
    }
    return themePreference;
  };

  const applyTheme = () => {
    const theme = resolveAppliedTheme();
    document.body.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
    if (editorInstance) {
      const editorTheme = theme === "dark" ? "github-dark" : "github-light";
      editorInstance.setOption("theme", editorTheme);
    }
  };

  const sanitizeEditorSettings = (settings) => {
    const next = createDefaultEditorSettings();
    if (!settings || typeof settings !== "object") {
      return next;
    }

    const rawFontSize = Number(settings.fontSize);
    if (Number.isFinite(rawFontSize)) {
      next.fontSize = Math.min(
        Math.max(rawFontSize, FONT_SIZE_RANGE.min),
        FONT_SIZE_RANGE.max
      );
    }

    const rawTabSize = Number(settings.tabSize);
    if (Number.isFinite(rawTabSize) && ALLOWED_TAB_SIZES.has(rawTabSize)) {
      next.tabSize = rawTabSize;
    }

    if (typeof settings.lineNumbers === "boolean") {
      next.lineNumbers = settings.lineNumbers;
    }

    if (typeof settings.lineWrapping === "boolean") {
      next.lineWrapping = settings.lineWrapping;
    }

    return next;
  };

  const getStoredEditorSettings = () => {
    try {
      const stored = window.localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
      if (!stored) {
        return createDefaultEditorSettings();
      }
      const parsed = JSON.parse(stored);
      return sanitizeEditorSettings(parsed);
    } catch (error) {
      console.warn("エディタ設定の読み込みに失敗しました", error);
      return createDefaultEditorSettings();
    }
  };

  const storeEditorSettings = (settings) => {
    try {
      window.localStorage.setItem(
        EDITOR_SETTINGS_STORAGE_KEY,
        JSON.stringify(settings)
      );
    } catch (error) {
      console.warn("エディタ設定の保存に失敗しました", error);
    }
  };

  const applyEditorSettingsToControls = () => {
    fontSizeSelect.value = String(editorSettings.fontSize);
    tabSizeSelect.value = String(editorSettings.tabSize);
    lineNumbersToggle.checked = editorSettings.lineNumbers;
    lineWrapToggle.checked = editorSettings.lineWrapping;
  };

  const applyEditorSettingsToEditor = () => {
    if (!editorInstance) {
      return;
    }
    editorInstance.setOption("tabSize", editorSettings.tabSize);
    editorInstance.setOption("indentUnit", editorSettings.tabSize);
    editorInstance.setOption("lineNumbers", editorSettings.lineNumbers);
    editorInstance.setOption("lineWrapping", editorSettings.lineWrapping);
    const wrapper = editorInstance.getWrapperElement();
    if (wrapper) {
      wrapper.style.fontSize = `${editorSettings.fontSize}px`;
    }
    editorInstance.refresh();
  };

  const updateEditorSettings = (partial) => {
    editorSettings = { ...editorSettings, ...partial };
    storeEditorSettings(editorSettings);
    applyEditorSettingsToControls();
    applyEditorSettingsToEditor();
  };

  const updateThemeControls = () => {
    themeInputs.forEach((input) => {
      const isChecked = input.value === themePreference;
      input.checked = isChecked;
      const option = input.closest(".settings-option");
      if (option) {
        option.setAttribute("aria-checked", isChecked ? "true" : "false");
      }
    });
  };

  const setThemePreference = (preference) => {
    if (!VALID_THEMES.has(preference)) {
      return;
    }
    themePreference = preference;
    storeThemePreference(preference);
    updateThemeControls();
    applyTheme();
  };

  const openSettingsMenu = () => {
    if (!settingsMenuOpen) {
      settingsMenu.classList.add("is-open");
      settingsButton.setAttribute("aria-expanded", "true");
      settingsMenuOpen = true;
      const currentInput = themeInputs.find((input) => input.checked) || themeInputs[0];
      currentInput?.focus({ preventScroll: true });
    }
  };

  const closeSettingsMenu = () => {
    if (settingsMenuOpen) {
      settingsMenu.classList.remove("is-open");
      settingsButton.setAttribute("aria-expanded", "false");
      settingsMenuOpen = false;
    }
  };

  const toggleSettingsMenu = () => {
    if (settingsMenuOpen) {
      closeSettingsMenu();
    } else {
      openSettingsMenu();
    }
  };

  settingsButton.addEventListener("click", () => {
    toggleSettingsMenu();
  });

  settingsButton.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !settingsMenuOpen) {
      event.preventDefault();
      openSettingsMenu();
    }
  });

  settingsMenu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSettingsMenu();
      settingsButton.focus({ preventScroll: true });
      event.preventDefault();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!settingsMenuOpen) {
      return;
    }
    const target = event.target;
    if (target instanceof Element && settingsContainer?.contains(target)) {
      return;
    }
    closeSettingsMenu();
  });

  themeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) {
        setThemePreference(input.value);
      }
    });
  });

  if (systemPrefersDark) {
    const handleSystemThemeChange = () => {
      if (themePreference === "system") {
        applyTheme();
      }
    };
    if (typeof systemPrefersDark.addEventListener === "function") {
      systemPrefersDark.addEventListener("change", handleSystemThemeChange);
    } else if (typeof systemPrefersDark.addListener === "function") {
      systemPrefersDark.addListener(handleSystemThemeChange);
    }
  }

  themePreference = getStoredThemePreference();
  updateThemeControls();
  applyTheme();

  editorSettings = getStoredEditorSettings();
  applyEditorSettingsToControls();

  fontSizeSelect.addEventListener("change", () => {
    const next = Number(fontSizeSelect.value);
    if (!Number.isFinite(next)) {
      fontSizeSelect.value = String(editorSettings.fontSize);
      return;
    }
    const normalized = Math.min(
      Math.max(next, FONT_SIZE_RANGE.min),
      FONT_SIZE_RANGE.max
    );
    updateEditorSettings({ fontSize: normalized });
    fontSizeSelect.value = String(editorSettings.fontSize);
  });

  tabSizeSelect.addEventListener("change", () => {
    const next = Number(tabSizeSelect.value);
    if (!Number.isFinite(next) || !ALLOWED_TAB_SIZES.has(next)) {
      tabSizeSelect.value = String(editorSettings.tabSize);
      return;
    }
    updateEditorSettings({ tabSize: next });
    tabSizeSelect.value = String(editorSettings.tabSize);
  });

  lineNumbersToggle.addEventListener("change", () => {
    updateEditorSettings({ lineNumbers: Boolean(lineNumbersToggle.checked) });
    lineNumbersToggle.checked = editorSettings.lineNumbers;
  });

  lineWrapToggle.addEventListener("change", () => {
    updateEditorSettings({ lineWrapping: Boolean(lineWrapToggle.checked) });
    lineWrapToggle.checked = editorSettings.lineWrapping;
  });

  const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
  };

  const setupPaneResizing = () => {
    const hasLayoutElements = Boolean(workspace && previewPane && editorPane && splitter);
    if (!hasLayoutElements) {
      return () => {};
    }

    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const MIN_RATIO = 0.2;
    const MAX_RATIO = 0.8;
    const DEFAULT_RATIO = 0.5;
    let currentRatio = DEFAULT_RATIO;
    let isDragging = false;

    const applyPaneRatio = (ratio) => {
      if (mediaQuery.matches) {
        return;
      }
      const clampedRatio = clamp(ratio, MIN_RATIO, MAX_RATIO);
      currentRatio = clampedRatio;
      const previewPercent = clampedRatio * 100;
      const editorPercent = (1 - clampedRatio) * 100;
      previewPane.style.flex = `0 0 ${previewPercent}%`;
      editorPane.style.flex = `0 0 ${editorPercent}%`;
    };

    const clearPaneSizes = () => {
      previewPane.style.flex = "";
      editorPane.style.flex = "";
    };

    const updateLayoutMode = () => {
      if (mediaQuery.matches) {
        workspace.classList.remove("is-resizing");
        splitter.setAttribute("aria-hidden", "true");
        splitter.tabIndex = -1;
        clearPaneSizes();
      } else {
        splitter.removeAttribute("aria-hidden");
        splitter.tabIndex = 0;
        applyPaneRatio(currentRatio);
      }
    };

    const handlePointerDown = (event) => {
      if (mediaQuery.matches) {
        return;
      }
      isDragging = true;
      workspace.classList.add("is-resizing");
      splitter.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove = (event) => {
      if (!isDragging || mediaQuery.matches) {
        return;
      }
      const bounds = workspace.getBoundingClientRect();
      if (bounds.width <= 0) {
        return;
      }
      const position = event.clientX - bounds.left;
      const ratio = position / bounds.width;
      applyPaneRatio(ratio);
      event.preventDefault();
    };

    const stopDragging = (event) => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      workspace.classList.remove("is-resizing");
      splitter.releasePointerCapture?.(event.pointerId);
    };

    const handleSplitterKeyDown = (event) => {
      if (mediaQuery.matches) {
        return;
      }
      const step = event.shiftKey ? 0.1 : 0.05;
      if (event.key === "ArrowLeft") {
        applyPaneRatio(currentRatio - step);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        applyPaneRatio(currentRatio + step);
        event.preventDefault();
      }
    };

    splitter.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    splitter.addEventListener("keydown", handleSplitterKeyDown);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateLayoutMode);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(updateLayoutMode);
    }

    updateLayoutMode();
    if (!mediaQuery.matches) {
      applyPaneRatio(DEFAULT_RATIO);
    }

    return () => {
      splitter.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      splitter.removeEventListener("keydown", handleSplitterKeyDown);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateLayoutMode);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(updateLayoutMode);
      }
    };
  };

  setupPaneResizing();

  let lastSourceMetadata = [];

  const editor = CodeMirror.fromTextArea(textarea, {
    mode: "htmlmixed",
    lineNumbers: editorSettings.lineNumbers,
    tabSize: editorSettings.tabSize,
    indentUnit: editorSettings.tabSize,
    indentWithTabs: false,
    lineWrapping: editorSettings.lineWrapping,
    theme: resolveAppliedTheme() === "dark" ? "github-dark" : "github-light"
  });
  editorInstance = editor;
  editor.setSize("100%", "100%");
  applyEditorSettingsToEditor();
  applyTheme();

  const FILE_TYPES = [
    {
      description: "HTML Files",
      accept: {
        "text/html": [".html", ".htm"],
        "application/xhtml+xml": [".xhtml"]
      }
    }
  ];

  let fileHandle = null;

  const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);

  const computeLineOffsets = (text) => {
    const offsets = [0];
    for (let i = 0; i < text.length; i += 1) {
      if (text.charCodeAt(i) === 10 /* \n */) {
        offsets.push(i + 1);
      }
    }
    return offsets;
  };

  const indexToPos = (offsets, index) => {
    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (offsets[mid] <= index) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const line = Math.max(0, high);
    return { line, ch: index - offsets[line] };
  };

  const annotateHtmlWithSource = (source) => {
    if (!source) {
      return "";
    }

    const elementRanges = [];

    try {
      const lineOffsets = computeLineOffsets(source);
      const modifications = [];
      const stack = [];
      let nextElementId = 1;
      const tagRegex = /<\/?([A-Za-z][\w:-]*)\b[^<>]*?>/g;
      let match;

      const addModification = (index, attrText) => {
        modifications.push({ index, text: attrText });
      };

      while ((match = tagRegex.exec(source))) {
        const full = match[0];
        const matchIndex = match.index;

        if (full.startsWith("<!")) {
          continue;
        }

        const isClosing = full[1] === "/";
        const rawTagName = match[1] || "";
        const tagName = rawTagName.toLowerCase();

        const parent = stack[stack.length - 1];
        if (parent && parent.skipContent && !(isClosing && tagName === parent.tagName)) {
          continue;
        }

        const selfClosing = full.endsWith("/>") || VOID_ELEMENTS.has(tagName);
        const closingAdjustment = full.endsWith("/>") ? 2 : 1;

        if (!isClosing) {
          const startIndex = matchIndex;
          const insertIndex = matchIndex + full.length - closingAdjustment;
          const startPos = indexToPos(lineOffsets, startIndex);
          const elementId = nextElementId++;

          if (selfClosing) {
          const endIndex = matchIndex + full.length;
          const endPos = indexToPos(lineOffsets, endIndex);
          const attrText =
            ` data-source-id="${elementId}"` +
            ` data-source-start-index="${startIndex}"` +
            ` data-source-end-index="${endIndex}"` +
            ` data-source-start-line="${startPos.line}"` +
            ` data-source-start-ch="${startPos.ch}"` +
            ` data-source-end-line="${endPos.line}"` +
            ` data-source-end-ch="${endPos.ch}"`;
          addModification(insertIndex, attrText);
          elementRanges.push({
            sourceId: String(elementId),
            startIndex,
            endIndex,
            startLine: startPos.line,
            startCh: startPos.ch,
            endLine: endPos.line,
            endCh: endPos.ch
          });
        } else {
          const skipContent = tagName === "script" || tagName === "style";
          stack.push({
            tagName,
            startIndex,
              insertIndex,
              startPos,
              elementId,
              skipContent
            });
          }
        } else {
          const closingLength = full.length;
          const closingEndIndex = matchIndex + closingLength;

          let entryIndex = -1;
          for (let i = stack.length - 1; i >= 0; i -= 1) {
            if (stack[i].tagName === tagName) {
              entryIndex = i;
              break;
            }
          }

          if (entryIndex === -1) {
            continue;
          }

          const entry = stack.splice(entryIndex, 1)[0];
          const endPos = indexToPos(lineOffsets, closingEndIndex);
          const attrText =
            ` data-source-id="${entry.elementId}"` +
            ` data-source-start-index="${entry.startIndex}"` +
            ` data-source-end-index="${closingEndIndex}"` +
            ` data-source-start-line="${entry.startPos.line}"` +
            ` data-source-start-ch="${entry.startPos.ch}"` +
            ` data-source-end-line="${endPos.line}"` +
            ` data-source-end-ch="${endPos.ch}"`;
          addModification(entry.insertIndex, attrText);
          elementRanges.push({
            sourceId: String(entry.elementId),
            startIndex: entry.startIndex,
            endIndex: closingEndIndex,
            startLine: entry.startPos.line,
            startCh: entry.startPos.ch,
            endLine: endPos.line,
            endCh: endPos.ch
          });
        }
      }

      if (!modifications.length) {
        lastSourceMetadata = elementRanges;
        return sanitizeForPreview(source);
      }

      modifications.sort((a, b) => a.index - b.index);

      let result = "";
      let cursor = 0;
      for (const mod of modifications) {
        result += source.slice(cursor, mod.index);
        result += mod.text;
        cursor = mod.index;
      }
      result += source.slice(cursor);
      lastSourceMetadata = elementRanges;
      return sanitizeForPreview(result);
    } catch (error) {
      console.error("プレビュー用メタデータ付与に失敗しました", error);
      lastSourceMetadata = [];
      return sanitizeForPreview(source);
    }
  };

  const sanitizeForPreview = (html) => {
    let sanitized = html;
    try {
      sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, "");
      sanitized = sanitized.replace(/\son[a-z0-9_-]+\s*=\s*"[^"]*"/gi, "");
      sanitized = sanitized.replace(/\son[a-z0-9_-]+\s*=\s*'[^']*'/gi, "");
      sanitized = sanitized.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
      sanitized = sanitized.replace(/<iframe[^>]*>/gi, "");
      sanitized = sanitized.replace(/<frame[\s\S]*?<\/frame>/gi, "");
      sanitized = sanitized.replace(/<frame[^>]*>/gi, "");
      sanitized = sanitized.replace(/<embed[\s\S]*?<\/embed>/gi, "");
      sanitized = sanitized.replace(/<embed[^>]*>/gi, "");
    } catch (error) {
      console.warn("プレビューのサニタイズに失敗しました", error);
    }
    return sanitized;
  };

  const updatePreview = (content) => {
    const annotated = annotateHtmlWithSource(content);
    if (!annotated) {
      preview.srcdoc = "";
      return;
    }
    preview.srcdoc = `${annotated}<script src="${previewBridgeUrl}" defer></script>`;
  };

  const findMetadataByIndex = (index) => {
    if (!Array.isArray(lastSourceMetadata) || lastSourceMetadata.length === 0) {
      return null;
    }

    let best = null;
    let bestRange = Infinity;
    for (const meta of lastSourceMetadata) {
      if (index < meta.startIndex || index > meta.endIndex) {
        continue;
      }
      const range = meta.endIndex - meta.startIndex;
      if (range < bestRange) {
        best = meta;
        bestRange = range;
      }
    }
    return best;
  };

  const postHighlightToPreview = (meta) => {
    if (!preview.contentWindow) {
      return;
    }

    preview.contentWindow.postMessage(
      {
        type: "source-preview-highlight",
        sourceId: meta?.sourceId ?? null
      },
      "*"
    );
  };

  const notifyPreviewOfSelection = () => {
    const selections = editor.listSelections();
    if (!selections || selections.length === 0) {
      postHighlightToPreview(null);
      return;
    }

    const anchor = selections[0].anchor;
    const index = editor.indexFromPos(anchor);
    const meta = findMetadataByIndex(index);
    postHighlightToPreview(meta);
  };

  const handlePreviewMessage = (event) => {
    if (event.source !== preview.contentWindow) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== "preview-source-select") {
      return;
    }

    const startLine = Number(data.startLine);
    const startCh = Number(data.startCh);
    const endLine = Number(data.endLine);
    const endCh = Number(data.endCh);

    if ([startLine, startCh, endLine, endCh].some((value) => !Number.isFinite(value))) {
      return;
    }

    const anchor = { line: startLine, ch: startCh };
    const head = { line: endLine, ch: endCh };

    editor.focus();
    editor.setSelection(anchor, head);
    editor.scrollIntoView(anchor, 100);
  };

  const setFileHandle = (handle) => {
    fileHandle = handle ?? null;
    if (fileHandle?.name) {
      currentFileLabel.textContent = fileHandle.name;
      currentFileLabel.title = "保存先: " + fileHandle.name;
    } else {
      currentFileLabel.textContent = "未保存のファイル";
      currentFileLabel.removeAttribute("title");
    }
  };

  const setEditorContent = (value) => {
    editor.setValue(value ?? "");
    editor.setCursor({ line: 0, ch: 0 });
    editor.refresh();
    updatePreview(editor.getValue());
    notifyPreviewOfSelection();
  };

  const fileSystemAccessSupported =
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function";

  setFileHandle(null);
  setEditorContent("");

  if (!fileSystemAccessSupported) {
    openButton.disabled = true;
    saveButton.disabled = true;
    currentFileLabel.textContent = "File System Access APIに未対応のブラウザです";
    console.warn("File System Access API is not supported in this environment.");
    editor.setOption("readOnly", true);
    return;
  }

  window.addEventListener("message", handlePreviewMessage);

  editor.on("change", () => {
    updatePreview(editor.getValue());
    notifyPreviewOfSelection();
  });

  editor.on("cursorActivity", () => {
    notifyPreviewOfSelection();
  });

  preview.addEventListener("load", () => {
    notifyPreviewOfSelection();
  });

  newButton.addEventListener("click", () => {
    setFileHandle(null);
    setEditorContent("");
    editor.focus();
    notifyPreviewOfSelection();
  });

  openButton.addEventListener("click", async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: FILE_TYPES,
        excludeAcceptAllOption: false,
        multiple: false
      });

      if (!handle) {
        return;
      }

      const hasPermission = await verifyPermission(handle, false);
      if (!hasPermission) {
        console.warn("ファイルの読み取り権限を取得できませんでした");
        return;
      }

      const file = await handle.getFile();
      const text = await file.text();

      setFileHandle(handle);
      setEditorContent(text);
      editor.focus();
      notifyPreviewOfSelection();
    } catch (error) {
      if (error?.name === "AbortError") {
        console.info("ファイル選択がキャンセルされました");
        return;
      }
      console.error("ファイルを開けませんでした", error);
    }
  });

  saveButton.addEventListener("click", async () => {
    try {
      const handle = await ensureWritableHandle();
      if (!handle) {
        return;
      }

      const writable = await handle.createWritable();
      await writable.write(editor.getValue());
      await writable.close();

      console.info("ファイルを保存しました", handle.name ?? "");
    } catch (error) {
      if (error?.name === "AbortError") {
        console.info("保存がキャンセルされました");
        return;
      }
      console.error("ファイルの保存に失敗しました", error);
    }
  });

  async function ensureWritableHandle() {
    if (!fileHandle) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "index.html",
          types: FILE_TYPES,
          excludeAcceptAllOption: false
        });

        const hasPermission = await verifyPermission(handle, true);
        if (!hasPermission) {
          console.warn("ファイルの書き込み権限を取得できませんでした");
          return null;
        }

        setFileHandle(handle);
        return handle;
      } catch (error) {
        if (error?.name === "AbortError") {
          console.info("保存用のファイル選択がキャンセルされました");
          return null;
        }
        throw error;
      }
    }

    const hasPermission = await verifyPermission(fileHandle, true);
    if (!hasPermission) {
      console.warn("ファイルの書き込み権限を取得できませんでした");
      return null;
    }

    return fileHandle;
  }

  async function verifyPermission(handle, write) {
    const descriptor = { mode: write ? "readwrite" : "read" };

    try {
      const currentPermission = await handle.queryPermission(descriptor);
      if (currentPermission === "granted") {
        return true;
      }

      const requestedPermission = await handle.requestPermission(descriptor);
      return requestedPermission === "granted";
    } catch (error) {
      console.error("権限の確認に失敗しました", error);
      return false;
    }
  }
})();
