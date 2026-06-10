const $ = (id) => document.getElementById(id);

const loginForm = $("login-form");
const userPanel = $("user-panel");
const historySection = $("history-section");
const authError = $("auth-error");

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

  const session = await send("GET_SESSION");
  if (session.loggedIn) {
    setLoggedIn(session.user);
  } else {
    setLoggedOut();
  }
}

$("btn-login").addEventListener("click", async () => {
  clearError();
  const username = $("username").value.trim();
  const password = $("password").value;
  if (!username || !password) {
    showError("请输入用户名和密码");
    return;
  }
  const resp = await send("LOGIN", { username, password });
  if (!resp?.ok) {
    showError(resp?.error || "登录失败");
    return;
  }
  setLoggedIn(resp.user);
});

$("btn-register").addEventListener("click", async () => {
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
  const resp = await send("REGISTER", { username, password });
  if (!resp?.ok) {
    showError(resp?.error || "注册失败");
    return;
  }
  const loginResp = await send("LOGIN", { username, password });
  if (loginResp?.ok) {
    setLoggedIn(loginResp.user);
  } else {
    showError("注册成功，请手动登录");
  }
});

$("btn-logout").addEventListener("click", async () => {
  await send("LOGOUT");
  setLoggedOut();
});

$("btn-save-api").addEventListener("click", async () => {
  const apiBase = $("api-base").value.trim().replace(/\/$/, "");
  if (!apiBase) return;
  await send("SET_API_BASE", { apiBase });
});

$("btn-open-history").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("history/history.html") });
});

init();
