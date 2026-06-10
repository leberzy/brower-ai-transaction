const DEFAULT_API_BASE = "http://localhost:8000";
const CONTEXT_MENU_ID = "translate-en-zh";

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: "英译中",
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
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.detail || data.message || `请求失败 (${resp.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case "LOGIN": {
        const data = await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            username: message.username,
            password: message.password,
          }),
        });
        await chrome.storage.local.set({ token: data.access_token });
        const me = await apiRequest("/api/auth/me");
        await chrome.storage.local.set({ user: me });
        return { ok: true, user: me };
      }
      case "REGISTER": {
        await apiRequest("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            username: message.username,
            password: message.password,
          }),
        });
        return { ok: true };
      }
      case "LOGOUT": {
        await chrome.storage.local.remove(["token", "user"]);
        return { ok: true };
      }
      case "GET_SESSION": {
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
      }
      case "TRANSLATE": {
        const result = await apiRequest("/api/translate", {
          method: "POST",
          body: JSON.stringify({
            text: message.text,
            source_lang: message.sourceLang || "auto",
            target_lang: message.targetLang || "zh",
          }),
        });
        return { ok: true, result };
      }
      case "GET_HISTORY": {
        const params = new URLSearchParams({
          skip: String(message.skip || 0),
          limit: String(message.limit || 20),
        });
        if (message.start_date) params.set("start_date", message.start_date);
        if (message.end_date) params.set("end_date", message.end_date);
        if (message.is_learned === true) params.set("is_learned", "true");
        if (message.is_favorited === true) params.set("is_favorited", "true");
        if (message.is_pending === true) params.set("is_pending", "true");
        const data = await apiRequest(`/api/history?${params}`);
        return { ok: true, ...data };
      }
      case "GET_HISTORY_ITEM": {
        const item = await apiRequest(`/api/history/${message.id}`);
        return { ok: true, item };
      }
      case "CREATE_HISTORY": {
        const item = await apiRequest("/api/history", {
          method: "POST",
          body: JSON.stringify({
            source_text: message.source_text,
            translated_text: message.translated_text,
            source_lang: message.source_lang || "en",
            target_lang: message.target_lang || "zh",
          }),
        });
        return { ok: true, item };
      }
      case "UPDATE_HISTORY": {
        const body = {};
        if (message.source_text !== undefined) body.source_text = message.source_text;
        if (message.translated_text !== undefined) body.translated_text = message.translated_text;
        if (message.source_lang !== undefined) body.source_lang = message.source_lang;
        if (message.target_lang !== undefined) body.target_lang = message.target_lang;
        if (message.is_learned !== undefined) body.is_learned = Boolean(message.is_learned);
        if (message.is_favorited !== undefined) body.is_favorited = Boolean(message.is_favorited);
        if (message.is_pending !== undefined) body.is_pending = Boolean(message.is_pending);
        if (Object.keys(body).length === 0) {
          throw new Error("没有可更新的字段");
        }
        const item = await apiRequest(`/api/history/${message.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        return { ok: true, item };
      }
      case "DELETE_HISTORY": {
        await apiRequest(`/api/history/${message.id}`, { method: "DELETE" });
        return { ok: true };
      }
      case "SET_API_BASE": {
        await chrome.storage.local.set({ apiBase: message.apiBase });
        return { ok: true };
      }
      case "GET_API_BASE": {
        return { apiBase: await getApiBase() };
      }
      default:
        throw new Error("未知消息类型");
    }
  };

  handler()
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
