const DEFAULT_API_BASE = "http://localhost:8000";
const DEFAULT_TARGET_LANG = "zh";
const CONTEXT_MENU_ID = "ai-translate-selection";

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "AI 翻译选中文本",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenu);
setupContextMenu();

async function getApiBase() {
  const { apiBase } = await chrome.storage.local.get("apiBase");
  return apiBase || DEFAULT_API_BASE;
}

async function getTargetLang() {
  const { targetLang } = await chrome.storage.local.get("targetLang");
  return targetLang || DEFAULT_TARGET_LANG;
}

async function getToken() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}

async function apiRequest(path, options = {}) {
  const apiBase = await getApiBase();
  const token = await getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.detail || data.message || `请求失败 (${resp.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

const HANDLERS = {
  async LOGIN(msg) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: msg.username, password: msg.password }),
    });
    await chrome.storage.local.set({ token: data.access_token });
    const me = await apiRequest("/api/auth/me");
    await chrome.storage.local.set({ user: me });
    return { ok: true, user: me };
  },

  async REGISTER(msg) {
    await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username: msg.username, password: msg.password }),
    });
    return { ok: true };
  },

  async LOGOUT() {
    await chrome.storage.local.remove(["token", "user"]);
    return { ok: true };
  },

  async GET_SESSION() {
    const token = await getToken();
    if (!token) return { loggedIn: false };
    try {
      const me = await apiRequest("/api/auth/me");
      await chrome.storage.local.set({ user: me });
      return { loggedIn: true, user: me };
    } catch {
      await chrome.storage.local.remove(["token", "user"]);
      return { loggedIn: false };
    }
  },

  async TRANSLATE(msg) {
    const targetLang = msg.targetLang || (await getTargetLang());
    const result = await apiRequest("/api/translate", {
      method: "POST",
      body: JSON.stringify({
        text: msg.text,
        source_lang: msg.sourceLang || "auto",
        target_lang: targetLang,
      }),
    });
    return { ok: true, result };
  },

  async GET_HISTORY(msg) {
    const params = new URLSearchParams({
      skip: String(msg.skip || 0),
      limit: String(msg.limit || 20),
    });
    if (msg.start_date) params.set("start_date", msg.start_date);
    if (msg.end_date) params.set("end_date", msg.end_date);
    if (msg.is_learned === true) params.set("is_learned", "true");
    if (msg.is_favorited === true) params.set("is_favorited", "true");
    if (msg.is_pending === true) params.set("is_pending", "true");
    const data = await apiRequest(`/api/history?${params}`);
    return { ok: true, ...data };
  },

  async GET_HISTORY_ITEM(msg) {
    const item = await apiRequest(`/api/history/${msg.id}`);
    return { ok: true, item };
  },

  async CREATE_HISTORY(msg) {
    const item = await apiRequest("/api/history", {
      method: "POST",
      body: JSON.stringify({
        source_text: msg.source_text,
        translated_text: msg.translated_text,
        source_lang: msg.source_lang || "auto",
        target_lang: msg.target_lang || "zh",
      }),
    });
    return { ok: true, item };
  },

  async UPDATE_HISTORY(msg) {
    const body = {};
    const fields = [
      "source_text",
      "translated_text",
      "source_lang",
      "target_lang",
      "is_learned",
      "is_favorited",
      "is_pending",
    ];
    for (const f of fields) {
      if (msg[f] !== undefined) {
        body[f] = f.startsWith("is_") ? Boolean(msg[f]) : msg[f];
      }
    }
    if (Object.keys(body).length === 0) throw new Error("没有可更新的字段");
    const item = await apiRequest(`/api/history/${msg.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return { ok: true, item };
  },

  async DELETE_HISTORY(msg) {
    await apiRequest(`/api/history/${msg.id}`, { method: "DELETE" });
    return { ok: true };
  },

  async SET_API_BASE(msg) {
    await chrome.storage.local.set({ apiBase: msg.apiBase });
    return { ok: true };
  },

  async GET_API_BASE() {
    return { apiBase: await getApiBase() };
  },

  async SET_TARGET_LANG(msg) {
    await chrome.storage.local.set({ targetLang: msg.targetLang });
    return { ok: true };
  },

  async GET_TARGET_LANG() {
    return { targetLang: await getTargetLang() };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = HANDLERS[message?.type];
  if (!handler) {
    sendResponse({ ok: false, error: "未知消息类型" });
    return false;
  }
  Promise.resolve(handler(message))
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) return;
  const text = info.selectionText?.trim();
  if (!text || text.length > 5000) return;
  chrome.tabs.sendMessage(tab.id, {
    type: "RUN_TRANSLATE",
    text,
    anchor: info.x != null && info.y != null ? { x: info.x, y: info.y } : null,
  });
});
