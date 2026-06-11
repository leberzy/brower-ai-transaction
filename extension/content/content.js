(function () {
  const SOURCE_LANG = "auto";
  const LANG_LABEL = {
    auto: "自动",
    zh: "中",
    en: "英",
    ja: "日",
    ko: "韩",
    fr: "法",
    de: "德",
    es: "西",
  };

  let toolbar = null;
  let panel = null;
  let selectedText = "";
  let hideTimer = null;
  let cachedTargetLang = "zh";

  // 启动后异步刷新一次目标语言
  chrome.runtime
    .sendMessage({ type: "GET_TARGET_LANG" })
    .then((r) => {
      if (r?.targetLang) cachedTargetLang = r.targetLang;
    })
    .catch(() => {});

  // 监听 storage 变化，实时同步目标语言
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.targetLang) {
      cachedTargetLang = changes.targetLang.newValue || "zh";
    }
  });

  function langLabel(code) {
    return LANG_LABEL[code] || code.toUpperCase();
  }

  function removeUI() {
    toolbar?.remove();
    panel?.remove();
    toolbar = null;
    panel = null;
  }

  function getSelectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return rect;
  }

  function positionEl(el, rect, { offsetY = 6, above = false } = {}) {
    const sx = window.scrollX;
    const sy = window.scrollY;
    let top = above
      ? Math.max(sy + 6, rect.top + sy - el.offsetHeight - offsetY)
      : rect.bottom + sy + offsetY;
    let left = rect.left + sx;
    const maxLeft = sx + window.innerWidth - el.offsetWidth - 8;
    left = Math.max(sx + 8, Math.min(left, maxLeft));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function positionElAtPoint(el, x, y) {
    const sx = window.scrollX;
    const sy = window.scrollY;
    let top = Math.max(sy + 8, y + sy + 8);
    let left = x + sx;
    const maxLeft = sx + window.innerWidth - el.offsetWidth - 8;
    left = Math.max(sx + 8, Math.min(left, maxLeft));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
  }

  function positionPanel(anchor) {
    if (!panel) return;
    const rect = getSelectionRect();
    if (rect) positionEl(panel, rect, { offsetY: 8, above: false });
    else if (anchor) positionElAtPoint(panel, anchor.x, anchor.y);
  }

  function createToolbar() {
    const el = document.createElement("div");
    el.id = "ai-translate-toolbar";

    const btn = document.createElement("button");
    btn.className = "at-translate-btn";
    btn.title = `翻译为${langLabel(cachedTargetLang)}文`;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <span class="at-tag">译→${langLabel(cachedTargetLang)}</span>
    `;
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => {
      doTranslate(selectedText);
    });

    el.appendChild(btn);
    document.documentElement.appendChild(el);
    return el;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 兼容兜底
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  function buildPanel(source, anchor) {
    const el = document.createElement("div");
    el.id = "ai-translate-panel";

    el.innerHTML = `
      <div class="at-header">
        <span class="at-title">AI 翻译 · 译为${langLabel(cachedTargetLang)}文</span>
        <button class="at-close" type="button" title="关闭">×</button>
      </div>
      <div class="at-label">原文</div>
      <div class="at-source"></div>
      <div class="at-label at-label-target">
        <span>译文</span>
        <div class="at-actions">
          <button class="at-action at-copy" type="button" title="复制译文" disabled>复制</button>
          <button class="at-action at-retry" type="button" title="重新翻译">重译</button>
        </div>
      </div>
      <div class="at-result-wrap"></div>
    `;
    el.querySelector(".at-source").textContent = source;
    el.querySelector(".at-close").addEventListener("click", () => {
      panel?.remove();
      panel = null;
    });
    el.querySelector(".at-retry").addEventListener("click", () => {
      doTranslate(source, anchor);
    });
    document.documentElement.appendChild(el);
    return el;
  }

  function setPanelState(state, payload) {
    if (!panel) return;
    const wrap = panel.querySelector(".at-result-wrap");
    const copyBtn = panel.querySelector(".at-copy");
    wrap.innerHTML = "";

    if (state === "loading") {
      wrap.innerHTML = `
        <div class="at-loading">
          <span class="at-spinner"></span>
          <span>正在调用 AI 翻译…</span>
        </div>
      `;
      copyBtn.disabled = true;
    } else if (state === "error") {
      wrap.innerHTML = `<div class="at-error">${escapeHtml(payload.message)}</div>`;
      copyBtn.disabled = true;
    } else if (state === "result") {
      const div = document.createElement("div");
      div.className = "at-result";
      div.textContent = payload.text;
      wrap.appendChild(div);
      copyBtn.disabled = false;
      copyBtn.textContent = "复制";
      copyBtn.onclick = async () => {
        const ok = await copyToClipboard(payload.text);
        copyBtn.textContent = ok ? "已复制" : "复制失败";
        setTimeout(() => {
          if (copyBtn) copyBtn.textContent = "复制";
        }, 1500);
      };
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showPanel(source, anchor) {
    panel?.remove();
    panel = buildPanel(source, anchor);
    positionPanel(anchor);
  }

  async function doTranslate(text, anchor = null) {
    if (!text || text.length > 5000) return;
    toolbar?.remove();
    toolbar = null;

    showPanel(text, anchor);
    setPanelState("loading");

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        text,
        sourceLang: SOURCE_LANG,
        targetLang: cachedTargetLang,
      });
      if (!resp?.ok) {
        let msg = resp?.error || "翻译失败";
        if (msg.includes("未登录") || msg.includes("401")) {
          msg = "请先登录插件（点击浏览器工具栏的扩展图标）";
        }
        setPanelState("error", { message: msg });
        return;
      }
      setPanelState("result", { text: resp.result.translated_text });
    } catch (err) {
      setPanelState("error", { message: err.message || "网络错误" });
    }
  }

  function onMouseUp(e) {
    if (toolbar?.contains(e.target) || panel?.contains(e.target)) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const text = window.getSelection()?.toString().trim();
      if (!text || text.length < 1 || text.length > 5000) {
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
    if (message?.type === "RUN_TRANSLATE") {
      doTranslate(message.text, message.anchor);
    }
  });
})();
