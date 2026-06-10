const $ = (id) => document.getElementById(id);

const PAGE_SIZE = 20;
let allItems = [];
let loadedTotal = 0;
let serverTotal = 0;
let viewingItem = null;

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getFilteredItems() {
  const q = $("search-input").value.trim().toLowerCase();
  if (!q) return allItems;
  return allItems.filter(
    (item) =>
      item.source_text.toLowerCase().includes(q) ||
      item.translated_text.toLowerCase().includes(q)
  );
}

function updateCount() {
  const filtered = getFilteredItems();
  const label = $("search-input").value.trim()
    ? `显示 ${filtered.length} / 共 ${allItems.length} 条`
    : `共 ${serverTotal} 条记录`;
  $("record-count").textContent = label;
}

function renderTable() {
  const tbody = $("history-tbody");
  const filtered = getFilteredItems();
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    $("empty-tip").classList.remove("hidden");
    $("empty-tip").textContent = $("search-input").value.trim()
      ? "没有匹配的记录"
      : "暂无记录，点击「新建记录」添加";
  } else {
    $("empty-tip").classList.add("hidden");
  }

  filtered.forEach((item) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.innerHTML = `
      <td class="cell-time">${formatTime(item.created_at)}</td>
      <td><div class="cell-text cell-source" title="${escapeHtml(item.source_text)}">${escapeHtml(item.source_text)}</div></td>
      <td><div class="cell-text cell-target" title="${escapeHtml(item.translated_text)}">${escapeHtml(item.translated_text)}</div></td>
      <td>
        <div class="row-actions">
          <button class="btn secondary sm" data-action="view">查看</button>
          <button class="btn secondary sm" data-action="edit">编辑</button>
          <button class="btn danger sm" data-action="delete">删除</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateCount();
  const loadMore = $("btn-load-more");
  if (allItems.length < serverTotal && !$("search-input").value.trim()) {
    loadMore.classList.remove("hidden");
  } else {
    loadMore.classList.add("hidden");
  }
}

async function loadHistory(reset = false) {
  if (reset) {
    allItems = [];
    loadedTotal = 0;
  }

  const resp = await send("GET_HISTORY", { skip: loadedTotal, limit: PAGE_SIZE });
  if (!resp?.ok) {
    alert(resp?.error || "加载失败");
    return;
  }

  allItems = reset ? resp.items : [...allItems, ...resp.items];
  loadedTotal = allItems.length;
  serverTotal = resp.total;
  renderTable();
}

function openFormModal(mode, item = null) {
  $("modal-title").textContent = mode === "create" ? "新建记录" : "编辑记录";
  $("record-id").value = item?.id || "";
  $("source-text").value = item?.source_text || "";
  $("translated-text").value = item?.translated_text || "";
  $("form-error").classList.add("hidden");
  $("modal").classList.remove("hidden");
  $("source-text").focus();
}

function closeFormModal() {
  $("modal").classList.add("hidden");
  $("record-form").reset();
}

function openViewModal(item) {
  viewingItem = item;
  $("view-meta").textContent = `ID: ${item.id} · ${formatTime(item.created_at)}`;
  $("view-source").textContent = item.source_text;
  $("view-target").textContent = item.translated_text;
  $("view-modal").classList.remove("hidden");
}

function closeViewModal() {
  viewingItem = null;
  $("view-modal").classList.add("hidden");
}

async function saveRecord(e) {
  e.preventDefault();
  const source = $("source-text").value.trim();
  const translated = $("translated-text").value.trim();
  const id = $("record-id").value;

  if (!source || !translated) {
    $("form-error").textContent = "请填写原文和译文";
    $("form-error").classList.remove("hidden");
    return;
  }

  $("btn-save").disabled = true;
  const resp = id
    ? await send("UPDATE_HISTORY", {
        id: Number(id),
        source_text: source,
        translated_text: translated,
        source_lang: "en",
        target_lang: "zh",
      })
    : await send("CREATE_HISTORY", {
        source_text: source,
        translated_text: translated,
        source_lang: "en",
        target_lang: "zh",
      });
  $("btn-save").disabled = false;

  if (!resp?.ok) {
    $("form-error").textContent = resp?.error || "保存失败";
    $("form-error").classList.remove("hidden");
    return;
  }

  closeFormModal();
  await loadHistory(true);
}

async function deleteRecord(id) {
  if (!confirm("确定删除这条记录吗？")) return;

  const resp = await send("DELETE_HISTORY", { id });
  if (!resp?.ok) {
    alert(resp?.error || "删除失败");
    return;
  }

  closeViewModal();
  allItems = allItems.filter((item) => item.id !== id);
  serverTotal = Math.max(0, serverTotal - 1);
  loadedTotal = allItems.length;
  renderTable();
}

async function init() {
  const session = await send("GET_SESSION");
  if (!session.loggedIn) {
    $("login-prompt").classList.remove("hidden");
    $("board").classList.add("hidden");
    return;
  }

  $("user-badge").textContent = session.user.username;
  $("user-badge").classList.remove("hidden");
  $("login-prompt").classList.add("hidden");
  $("board").classList.remove("hidden");
  await loadHistory(true);
}

$("btn-refresh").addEventListener("click", () => loadHistory(true));
$("btn-create").addEventListener("click", () => openFormModal("create"));
$("btn-load-more").addEventListener("click", () => loadHistory(false));
$("search-input").addEventListener("input", renderTable);

$("record-form").addEventListener("submit", saveRecord);
$("btn-cancel").addEventListener("click", closeFormModal);
$("modal-close").addEventListener("click", closeFormModal);
$("modal").querySelector(".modal-backdrop").addEventListener("click", closeFormModal);

$("view-close").addEventListener("click", closeViewModal);
$("view-modal").querySelector(".modal-backdrop").addEventListener("click", closeViewModal);
$("view-edit").addEventListener("click", () => {
  if (!viewingItem) return;
  const item = viewingItem;
  closeViewModal();
  openFormModal("edit", item);
});
$("view-delete").addEventListener("click", () => {
  if (viewingItem) deleteRecord(viewingItem.id);
});

$("history-tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const tr = btn.closest("tr");
  const id = Number(tr.dataset.id);
  const item = allItems.find((i) => i.id === id);
  if (!item) return;

  const action = btn.dataset.action;
  if (action === "view") openViewModal(item);
  else if (action === "edit") openFormModal("edit", item);
  else if (action === "delete") deleteRecord(id);
});

$("btn-go-login").addEventListener("click", () => {
  alert("请点击浏览器工具栏中的扩展图标进行登录");
});

init();
