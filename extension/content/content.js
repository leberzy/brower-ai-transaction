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
  const LANG_FULL = {
    zh: "中文",
    en: "英文",
    ja: "日文",
    ko: "韩文",
    fr: "法文",
    de: "德文",
    es: "西班牙文",
  };

  const ICON = {
    translate: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8l-3 3v-3H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M15 3h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2v2.5L16.5 10H15a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M7 15l1.5 2M10.5 15L9 17"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    retry: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><polyline points="21 3 21 9 15 9"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
  };

  let toolbar = null;
  let panel = null;
  let selectedText = "";
  let hideTimer = null;
  let cachedTargetLang = "zh";

  chrome.runtime
    .sendMessage({ type: "GET_TARGET_LANG" })
    .then((r) => {
      if (r?.targetLang) cachedTargetLang = r.targetLang;
    })
    .catch(() => {});

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes.targetLang) {
      cachedTargetLang = changes.targetLang.newValue || "zh";
    }
  });

  function langLabel(code) {
    return LANG_LABEL[code] || code.toUpperCase();
  }

  function langFull(code) {
    return LANG_FULL[code] || code.toUpperCase();
  }

  function isSingleWord(text) {
    return text.trim().split(/\s+/).length === 1;
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
    btn.title = `翻译为${langFull(cachedTargetLang)}`;
    btn.innerHTML = `
      ${ICON.translate}
<!--      <span class="at-tag">译为${langLabel(cachedTargetLang)}文</span>-->
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
    const isWord = isSingleWord(source);

    el.innerHTML = `
      <div class="at-header">
        <div class="at-brand">
          <span class="at-brand-dot"></span>
          <span class="at-title">AI 翻译</span>
          <span class="at-pill">${langLabel(cachedTargetLang)}文</span>
        </div>
        <button class="at-close" type="button" title="关闭 (Esc)" aria-label="关闭">${ICON.close}</button>
      </div>
      <div class="at-section at-section-source">
        <div class="at-label">原文</div>
        <div class="at-source"></div>
      </div>
      <div class="at-divider"></div>
      <div class="at-section at-section-target">
        <div class="at-label-row">
          <div class="at-label">译文</div>
          <div class="at-actions">
            <button class="at-action at-copy" type="button" title="复制译文" disabled>
              ${ICON.copy}<span>复制</span>
            </button>
            <button class="at-action at-retry" type="button" title="重新翻译">
              ${ICON.retry}<span>重译</span>
            </button>
            ${isWord ? `<button class="at-action at-examples-btn" type="button" title="查看例句" disabled>${ICON.book}<span>例句</span></button>` : ""}
          </div>
        </div>
        <div class="at-result-wrap"></div>
      </div>
      ${isWord ? `
      <div class="at-divider at-divider-examples hidden"></div>
      <div class="at-section at-section-examples hidden">
        <div class="at-label-row">
          <div class="at-label">例句</div>
        </div>
        <div class="at-examples-wrap"></div>
      </div>` : ""}
    `;

    el.querySelector(".at-source").textContent = source;
    el.querySelector(".at-close").addEventListener("click", () => {
      panel?.remove();
      panel = null;
    });
    el.querySelector(".at-retry").addEventListener("click", () => {
      doTranslate(source, anchor);
    });

    if (isWord) {
      el.querySelector(".at-examples-btn").addEventListener("click", () => {
        doExamples(source);
      });
    }

    document.documentElement.appendChild(el);
    return el;
  }

  function setPanelState(state, payload) {
    if (!panel) return;
    const wrap = panel.querySelector(".at-result-wrap");
    const copyBtn = panel.querySelector(".at-copy");
    const examplesBtn = panel.querySelector(".at-examples-btn");
    wrap.innerHTML = "";

    if (state === "loading") {
      wrap.innerHTML = `
        <div class="at-loading">
          <span class="at-spinner"></span>
          <span>AI 正在翻译…</span>
        </div>
      `;
      copyBtn.disabled = true;
      copyBtn.querySelector("span").textContent = "复制";
      if (examplesBtn) examplesBtn.disabled = true;
    } else if (state === "error") {
      wrap.innerHTML = `
        <div class="at-error">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${escapeHtml(payload.message)}</span>
        </div>`;
      copyBtn.disabled = true;
      if (examplesBtn) examplesBtn.disabled = true;
    } else if (state === "result") {
      // 读音/词性（单词时）
      if (payload.phonetic || payload.pos) {
        const phoneticEl = document.createElement("div");
        phoneticEl.className = "at-phonetic";
        const posHtml = payload.pos ? `<span class="at-pos">${escapeHtml(payload.pos)}</span>` : "";
        const phonHtml = payload.phonetic ? `<span class="at-phonetic-text">${ICON.sound}${escapeHtml(payload.phonetic)}</span>` : "";
        phoneticEl.innerHTML = `${posHtml}${phonHtml}`;
        // 插入到原文区下方
        const sourceEl = panel.querySelector(".at-source");
        sourceEl.parentNode.insertBefore(phoneticEl, sourceEl.nextSibling);
      }

      const div = document.createElement("div");
      div.className = "at-result";
      div.textContent = payload.text;
      wrap.appendChild(div);
      copyBtn.disabled = false;
      const labelEl = copyBtn.querySelector("span");
      labelEl.textContent = "复制";
      copyBtn.onclick = async () => {
        const ok = await copyToClipboard(payload.text);
        copyBtn.innerHTML = ok
          ? `${ICON.check}<span>已复制</span>`
          : `${ICON.copy}<span>失败</span>`;
        copyBtn.classList.toggle("is-done", ok);
        setTimeout(() => {
          if (!copyBtn) return;
          copyBtn.innerHTML = `${ICON.copy}<span>复制</span>`;
          copyBtn.classList.remove("is-done");
        }, 1500);
      };
      if (examplesBtn) examplesBtn.disabled = false;
    }
  }

  function setExamplesState(state, payload) {
    if (!panel) return;
    const section = panel.querySelector(".at-section-examples");
    const divider = panel.querySelector(".at-divider-examples");
    const wrap = panel.querySelector(".at-examples-wrap");
    if (!section || !wrap) return;

    section.classList.remove("hidden");
    divider?.classList.remove("hidden");
    wrap.innerHTML = "";

    if (state === "loading") {
      wrap.innerHTML = `
        <div class="at-loading">
          <span class="at-spinner"></span>
          <span>正在生成例句…</span>
        </div>`;
    } else if (state === "error") {
      wrap.innerHTML = `
        <div class="at-error">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${escapeHtml(payload.message)}</span>
        </div>`;
    } else if (state === "result") {
      if (!payload.examples?.length) {
        wrap.innerHTML = `<div class="at-examples-empty">暂无例句</div>`;
        return;
      }
      const ul = document.createElement("ol");
      ul.className = "at-examples-list";
      payload.examples.forEach((ex, i) => {
        const li = document.createElement("li");
        li.className = "at-example-item";
        li.innerHTML = `
          <div class="at-example-en">${escapeHtml(ex.sentence)}</div>
          <div class="at-example-zh">${escapeHtml(ex.translation)}</div>
        `;
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
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
      setPanelState("result", {
        text: resp.result.translated_text,
        phonetic: resp.result.phonetic,
        pos: resp.result.pos,
      });
    } catch (err) {
      setPanelState("error", { message: err.message || "网络错误" });
    }
  }

  async function doExamples(word) {
    if (!panel) return;
    const btn = panel.querySelector(".at-examples-btn");
    if (btn) btn.disabled = true;
    setExamplesState("loading");

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "GET_EXAMPLES",
        word,
        targetLang: cachedTargetLang,
        count: 3,
      });
      if (!resp?.ok) {
        setExamplesState("error", { message: resp?.error || "获取例句失败" });
        return;
      }
      setExamplesState("result", { examples: resp.examples });
    } catch (err) {
      setExamplesState("error", { message: err.message || "网络错误" });
    } finally {
      if (btn) btn.disabled = false;
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
