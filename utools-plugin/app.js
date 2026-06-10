const $ = (id) => document.getElementById(id);
const api = window.translateApi;

let pendingText = "";

function showView(name) {
  $("login-view").classList.toggle("hidden", name !== "login");
  $("main-view").classList.toggle("hidden", name !== "main");
}

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearError(id) {
  $(id).classList.add("hidden");
}

async function enterMain(user) {
  $("display-username").textContent = user.username;
  showView("main");
  loadHistory();
  if (pendingText) {
    $("source-input").value = pendingText;
    pendingText = "";
    doTranslate();
  }
}

async function doTranslate() {
  const text = $("source-input").value.trim();
  if (!text) return;

  clearError("translate-error");
  const btn = $("btn-translate");
  btn.disabled = true;
  btn.textContent = "翻译中…";
  $("result-box").classList.add("hidden");
  $("btn-copy").classList.add("hidden");

  try {
    const result = await api.translate(text);
    $("result-box").textContent = result.translated_text;
    $("result-box").classList.remove("hidden");
    $("btn-copy").classList.remove("hidden");
    loadHistory();
  } catch (err) {
    showError("translate-error", err.message || "翻译失败");
  } finally {
    btn.disabled = false;
    btn.textContent = "翻译";
  }
}

async function loadHistory() {
  const list = $("history-list");
  try {
    const data = await api.getHistory(0, 10);
    list.innerHTML = "";
    if (!data.items.length) {
      list.innerHTML = '<div class="empty">暂无翻译记录</div>';
      return;
    }
    data.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "history-item";
      div.title = "点击回填到输入框";
      const src = document.createElement("div");
      src.className = "history-source";
      src.textContent = item.source_text;
      const tgt = document.createElement("div");
      tgt.className = "history-target";
      tgt.textContent = item.translated_text;
      div.appendChild(src);
      div.appendChild(tgt);
      div.addEventListener("click", () => {
        $("source-input").value = item.source_text;
        $("result-box").textContent = item.translated_text;
        $("result-box").classList.remove("hidden");
        $("btn-copy").classList.remove("hidden");
      });
      list.appendChild(div);
    });
  } catch {
    list.innerHTML = '<div class="empty">历史加载失败</div>';
  }
}

$("btn-login").addEventListener("click", async () => {
  clearError("auth-error");
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("auth-error", "请输入用户名和密码");
    return;
  }
  try {
    const user = await api.login(username, password);
    enterMain(user);
  } catch (err) {
    showError("auth-error", err.message || "登录失败");
  }
});

$("btn-register").addEventListener("click", async () => {
  clearError("auth-error");
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("auth-error", "请输入用户名和密码");
    return;
  }
  if (password.length < 6) {
    showError("auth-error", "密码至少 6 位");
    return;
  }
  try {
    await api.register(username, password);
    const user = await api.login(username, password);
    enterMain(user);
  } catch (err) {
    showError("auth-error", err.message || "注册失败");
  }
});

$("btn-save-api").addEventListener("click", () => {
  const base = $("api-base").value.trim();
  if (base) api.setApiBase(base);
});

$("btn-logout").addEventListener("click", () => {
  api.logout();
  showView("login");
});

$("btn-translate").addEventListener("click", doTranslate);

$("source-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) doTranslate();
});

$("btn-copy").addEventListener("click", () => {
  const text = $("result-box").textContent;
  if (text) {
    utools.copyText(text);
    $("btn-copy").textContent = "已复制";
    setTimeout(() => ($("btn-copy").textContent = "复制译文"), 1200);
  }
});

$("btn-refresh-history").addEventListener("click", loadHistory);

utools.onPluginEnter(async ({ code, type, payload }) => {
  $("api-base").value = api.getApiBase();

  if (code === "translate-over" && type === "over") {
    pendingText = String(payload || "").trim();
  }

  const user = await api.checkSession();
  if (user) {
    enterMain(user);
  } else {
    showView("login");
  }
});
