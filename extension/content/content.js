(function () {
  const SOURCE_LANG = "en";
  const TARGET_LANG = "zh";

  let toolbar = null;
  let panel = null;
  let selectedText = "";
  let hideTimer = null;

  function removeUI() {
    toolbar?.remove();
    panel?.remove();
    toolbar = null;
    panel = null;
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
  }

  function positionEl(el, rect, options = {}) {
    const { offsetY = 6, above = false } = options;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let top;
    if (above) {
      top = rect.top + scrollY - el.offsetHeight - offsetY;
      top = Math.max(scrollY + 6, top);
    } else {
      top = rect.bottom + scrollY + offsetY;
    }
    let left = rect.left + scrollX;
    const maxLeft = scrollX + window.innerWidth - el.offsetWidth - 8;
    left = Math.max(scrollX + 8, Math.min(left, maxLeft));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function createToolbar() {
    const el = document.createElement("div");
    el.id = "ai-translate-toolbar";

    const btn = document.createElement("button");
    btn.className = "at-translate-btn";
    btn.title = "英译中";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';
    btn.addEventListener("mousedown", (e) => e.preventDefault());

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.classList.add("is-loading");
      await doTranslate(selectedText);
      btn.disabled = false;
      btn.classList.remove("is-loading");
    });

    el.appendChild(btn);
    document.documentElement.appendChild(el);
    return el;
  }

  function positionElAtPoint(el, x, y) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    let top = y + scrollY + 8;
    let left = x + scrollX;
    const maxLeft = scrollX + window.innerWidth - el.offsetWidth - 8;
    left = Math.max(scrollX + 8, Math.min(left, maxLeft));
    top = Math.max(scrollY + 8, top);
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function positionPanel(anchor) {
    if (!panel) return;
    const rect = getSelectionRect();
    if (rect) {
      positionEl(panel, rect, { offsetY: 8, above: false });
    } else if (anchor) {
      positionElAtPoint(panel, anchor.x, anchor.y);
    }
  }

  async function doTranslate(text, anchor = null) {
    if (!text || text.length > 5000) return;
    toolbar?.remove();
    toolbar = null;
    showPanel(text, true, null, null, anchor);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        text,
        sourceLang: SOURCE_LANG,
        targetLang: TARGET_LANG,
      });
      if (!resp?.ok) {
        let err = resp?.error || "翻译失败";
        if (err.includes("未登录") || err.includes("401")) {
          err = "请先登录插件（点击浏览器工具栏图标）";
        }
        showPanel(text, false, err, null, anchor);
        return;
      }
      showPanel(text, false, null, resp.result.translated_text, anchor);
    } catch (err) {
      showPanel(text, false, err.message || "网络错误", null, anchor);
    }
  }

  function showPanel(source, loading, error, translated, anchor = null) {
    panel?.remove();
    panel = document.createElement("div");
    panel.id = "ai-translate-panel";

    const header = document.createElement("div");
    header.className = "at-header";
    header.innerHTML = "<span>英译中</span>";

    const closeBtn = document.createElement("button");
    closeBtn.className = "at-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => {
      panel?.remove();
      panel = null;
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const srcLabel = document.createElement("div");
    srcLabel.className = "at-label";
    srcLabel.textContent = "原文";
    panel.appendChild(srcLabel);

    const src = document.createElement("div");
    src.className = "at-source";
    src.textContent = source;
    panel.appendChild(src);

    const tgtLabel = document.createElement("div");
    tgtLabel.className = "at-label";
    tgtLabel.textContent = "译文";
    panel.appendChild(tgtLabel);

    const result = document.createElement("div");
    if (loading) {
      result.className = "at-loading";
      result.textContent = "正在调用 AI 翻译…";
    } else if (error) {
      result.className = "at-error";
      result.textContent = error;
    } else {
      result.className = "at-result";
      result.textContent = translated;
    }
    panel.appendChild(result);

    document.documentElement.appendChild(panel);
    positionPanel(anchor);
  }

  function onMouseUp(e) {
    if (toolbar?.contains(e.target) || panel?.contains(e.target)) return;

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const text = window.getSelection()?.toString().trim();
      if (!text || text.length < 1) {
        removeUI();
        return;
      }
      if (text.length > 5000) {
        removeUI();
        return;
      }

      selectedText = text;
      removeUI();

      const rect = getSelectionRect();
      if (!rect) return;

      toolbar = createToolbar();
      positionEl(toolbar, rect, { above: true, offsetY: 6 });
    }, 120);
  }

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", (e) => {
    if (!toolbar?.contains(e.target) && !panel?.contains(e.target)) {
      clearTimeout(hideTimer);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removeUI();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "RUN_TRANSLATE") {
      doTranslate(message.text, message.anchor);
    }
  });
})();
