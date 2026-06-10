const DEFAULT_API_BASE = "http://localhost:8000";

const KEY_API_BASE = "translate/apiBase";
const KEY_TOKEN = "translate/token";
const KEY_USER = "translate/user";

function getApiBase() {
  return utools.dbStorage.getItem(KEY_API_BASE) || DEFAULT_API_BASE;
}

async function apiRequest(path, options = {}) {
  const token = utools.dbStorage.getItem(KEY_TOKEN);
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`${getApiBase()}${path}`, { ...options, headers });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.detail || data.message || `请求失败 (${resp.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

window.translateApi = {
  getApiBase,

  setApiBase(apiBase) {
    utools.dbStorage.setItem(KEY_API_BASE, apiBase.replace(/\/$/, ""));
  },

  getUser() {
    return utools.dbStorage.getItem(KEY_USER) || null;
  },

  async login(username, password) {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    utools.dbStorage.setItem(KEY_TOKEN, data.access_token);
    const me = await apiRequest("/api/auth/me");
    utools.dbStorage.setItem(KEY_USER, me);
    return me;
  },

  async register(username, password) {
    await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },

  logout() {
    utools.dbStorage.removeItem(KEY_TOKEN);
    utools.dbStorage.removeItem(KEY_USER);
  },

  async checkSession() {
    if (!utools.dbStorage.getItem(KEY_TOKEN)) return null;
    try {
      const me = await apiRequest("/api/auth/me");
      utools.dbStorage.setItem(KEY_USER, me);
      return me;
    } catch {
      utools.dbStorage.removeItem(KEY_TOKEN);
      utools.dbStorage.removeItem(KEY_USER);
      return null;
    }
  },

  async translate(text) {
    return apiRequest("/api/translate", {
      method: "POST",
      body: JSON.stringify({ text, source_lang: "en", target_lang: "zh" }),
    });
  },

  async getHistory(skip = 0, limit = 10) {
    return apiRequest(`/api/history?skip=${skip}&limit=${limit}`);
  },
};
