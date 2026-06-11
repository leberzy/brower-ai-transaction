const $ = (id) => document.getElementById(id);

const loginForm = $("login-form");
const userPanel = $("user-panel");
const historySection = $("history-section");
const authError = $("auth-error");
const toastEl = $("toast");

let toastTimer = null;

function toast(msg, type = "") {
  toastEl.textContent = msg;
  toastEl.className = "toast" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1800);
}

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

function clearError() {
  authError.classList.add("hidden");
}

function setLoggedIn(user) {
  loginForm.classList.add("hidden");
  userPanel.classList.remove("hidden");
  historySection.classList.remove("hidden");
  $("display-username").textContent = user.username;
  $("user-avatar").textContent = (user.username[0] || "?").toUpperCase();
}

function setLoggedOut() {
  loginForm.classList.remove("hidden");
  userPanel.classList.add("hidden");
  historySection.classList.add("hidden");
}

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function init() {
  const { apiBase } = await send("GET_API_BASE");
  $("api-base").value = apiBase;

  const { targetLang } = await send("GET_TARGET_LANG");
  $("target-lang").value = targetLang;

  const session = await send("GET_SESSION");
  if (session.loggedIn) setLoggedIn(session.user);
  else setLoggedOut();
}

async function doLogin() {
  clearError();
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("请输入用户名和密码");
    return;
  }
  $("btn-login").disabled = true;
  const resp = await send("LOGIN", { username, password });
  $("btn-login").disabled = false;
  if (!resp?.ok) {
    showError(resp?.error || "登录失败");
    return;
  }
  setLoggedIn(resp.user);
  toast("登录成功", "success");
}

async function doRegister() {
  clearError();
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("请输入用户名和密码");
    return;
  }
  if (password.length < 6) {
    showError("密码至少 6 位");
    return;
  }
  $("btn-register").disabled = true;
  const resp = await send("REGISTER", { username, password });
  if (!resp?.ok) {
    $("btn-register").disabled = false;
    showError(resp?.error || "注册失败");
    return;
  }
  const loginResp = await send("LOGIN", { username, password });
  $("btn-register").disabled = false;
  if (loginResp?.ok) {
    setLoggedIn(loginResp.user);
    toast("注册成功并已登录", "success");
  } else {
    showError("注册成功，请手动登录");
  }
}

$("btn-login").addEventListener("click", doLogin);
$("btn-register").addEventListener("click", doRegister);

// 登录支持回车
[$("username"), $("password")].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doLogin();
    }
  });
});

$("btn-logout").addEventListener("click", async () => {
  await send("LOGOUT");
  setLoggedOut();
  toast("已退出登录");
});

$("btn-save-api").addEventListener("click", async () => {
  const apiBase = $("api-base").value.trim().replace(/\/$/, "");
  const targetLang = $("target-lang").value;
  if (!apiBase) {
    toast("API 地址不能为空", "error");
    return;
  }
  await send("SET_API_BASE", { apiBase });
  await send("SET_TARGET_LANG", { targetLang });
  toast("设置已保存", "success");
});

// 切换目标语言时即时保存（无需点保存）
$("target-lang").addEventListener("change", async (e) => {
  await send("SET_TARGET_LANG", { targetLang: e.target.value });
  toast("目标语言已切换");
});

$("btn-open-history").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("history/history.html") });
});

init();
