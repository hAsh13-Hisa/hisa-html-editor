(() => {
  const HIGHLIGHT_CLASS = 'preview-selection-highlight';

  const ensureStyle = () => {
    if (document.getElementById('preview-selection-style')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'preview-selection-style';
    style.textContent = `
      .${HIGHLIGHT_CLASS} {
        outline: 2px solid #3b82f6 !important;
        outline-offset: 1px !important;
        background-color: rgba(59, 130, 246, 0.12) !important;
        transition: outline 0.15s ease, background-color 0.15s ease;
      }
      .${HIGHLIGHT_CLASS} * {
        pointer-events: none;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };

  const findTarget = (node) => {
    let current = node;
    while (current && !current.dataset?.sourceId) {
      current = current.parentElement;
    }
    return current ?? null;
  };

  const toNumberOrNull = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const dispatchSelection = (target) => {
    const startLine = toNumberOrNull(target.dataset.sourceStartLine);
    const startCh = toNumberOrNull(target.dataset.sourceStartCh);
    const endLine = toNumberOrNull(target.dataset.sourceEndLine);
    const endCh = toNumberOrNull(target.dataset.sourceEndCh);

    if ([startLine, startCh, endLine, endCh].some((v) => v === null)) {
      return;
    }

    window.parent.postMessage(
      {
        type: 'preview-source-select',
        sourceId: target.dataset.sourceId,
        startLine,
        startCh,
        endLine,
        endCh
      },
      '*'
    );
  };

  const handlePointer = (event) => {
    const target = findTarget(event.target);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dispatchSelection(target);
  };

  const handleDblClick = (event) => {
    const imgTarget = event.target?.tagName === 'IMG' ? event.target : event.target?.closest?.('img');
    if (imgTarget) {
      event.preventDefault();
      event.stopPropagation();
      window.parent.postMessage({
        type: 'preview-image-open-map',
        outerHTML: imgTarget.outerHTML
      }, '*');
    }
  };

  document.addEventListener('click', handlePointer, true);
  document.addEventListener('auxclick', handlePointer, true);
  document.addEventListener('dblclick', handleDblClick, true);

  const neutralizeInteractiveElements = () => {
    try {
      Object.defineProperty(window, 'open', {
        configurable: true,
        enumerable: false,
        writable: true,
        value: () => null
      });
    } catch (e) {
      window.open = () => null;
    }

    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach((anchor) => {
      anchor.dataset.originalHref = anchor.getAttribute('href') ?? '';
      anchor.setAttribute('href', '#');
      anchor.setAttribute('rel', 'noopener noreferrer');
      anchor.removeAttribute('target');
    });

    const forms = document.querySelectorAll('form');
    forms.forEach((form) => {
      form.addEventListener(
        'submit',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
        },
        true
      );
      form.setAttribute('action', '#');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', neutralizeInteractiveElements, { once: true });
  } else {
    neutralizeInteractiveElements();
  }

  ensureStyle();

  let currentHighlightedElement = null;

  const escapeSelector = (value) => {
    if (window.CSS?.escape) {
      return window.CSS.escape(value);
    }
    return String(value).replace(/"/g, '\\"');
  };

  const clearHighlight = () => {
    if (currentHighlightedElement) {
      currentHighlightedElement.classList.remove(HIGHLIGHT_CLASS);
      currentHighlightedElement = null;
    }
  };

  const highlightElementById = (sourceId) => {
    clearHighlight();
    if (!sourceId) {
      return;
    }
    const element = document.querySelector(`[data-source-id="${escapeSelector(sourceId)}"]`);
    if (!element) {
      return;
    }
    element.classList.add(HIGHLIGHT_CLASS);
    currentHighlightedElement = element;
    try {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch (e) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const data = event.data;
    if (!data || data.type !== 'source-preview-highlight') {
      return;
    }
    if (!data.sourceId) {
      clearHighlight();
      return;
    }
    highlightElementById(String(data.sourceId));
  });
})();
