chrome.action.onClicked.addListener(() => {
  const editorUrl = chrome.runtime.getURL("editor.html");

  chrome.tabs.query({ url: editorUrl }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("タブ検索に失敗しました", chrome.runtime.lastError);
      return;
    }

    const existingTab = tabs && tabs[0];
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("タブをアクティブ化できませんでした", chrome.runtime.lastError);
          return;
        }
        chrome.windows.update(existingTab.windowId, { focused: true }, () => {
          if (chrome.runtime.lastError) {
            console.error("ウィンドウをフォーカスできませんでした", chrome.runtime.lastError);
          }
        });
      });
      return;
    }

    chrome.tabs.create({ url: editorUrl }, () => {
      if (chrome.runtime.lastError) {
        console.error("エディタタブの作成に失敗しました", chrome.runtime.lastError);
      }
    });
  });
});