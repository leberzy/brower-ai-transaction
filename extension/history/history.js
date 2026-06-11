const ICON = {
  view:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
};

const $ = (id) => document.getElementById(id);

const PAGE_SIZE = 20;
const EYE_OPEN =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_CLOSED =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.77 20.77 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a20.75 20.75 0 0 1-3.16 4.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

let allItems = [];
let loadedTotal = 0;
let serverTotal = 0;
let pendingTotal = 0;
let viewingItem = null;
let hiddenIds = new Set();
let dateStart = "";
let dateEnd = "";
let filterLearned = false;
let filterFavorited = false;
let currentTab = "all";

async function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

let toastTimer = null;
function toast(msg, type = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast" + (type ? ` ${type}` : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 1800);
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

function isPendingTab() {
  return currentTab === "pending";
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

function isHidden(id) {
  return hiddenIds.has(id);
}

function eyeBtnHtml(visible, title) {
  return `<button type="button" class="eye-btn${visible ? "" : " is-off"}" title="${title}">${visible ? EYE_OPEN : EYE_CLOSED}</button>`;
}

function updateHeaderEye() {
  const filtered = getFilteredItems();
  const btn = $("toggle-all-visible");
  if (!btn || filtered.length === 0) {
    if (btn) btn.innerHTML = EYE_OPEN;
    return;
  }
  const allHidden = filtered.every((item) => isHidden(item.id));
  btn.innerHTML = allHidden ? EYE_CLOSED : EYE_OPEN;
  btn.classList.toggle("is-off", allHidden);
  btn.title = allHidden ? "全部显示译文" : "全部隐藏译文";
}

function updateCount() {
  const filtered = getFilteredItems();
  const parts = [isPendingTab() ? `待学 ${serverTotal} 条` : `共 ${serverTotal} 条记录`];
  if (dateStart || dateEnd) {
    parts.push(`时间：${dateStart || "…"} ~ ${dateEnd || "…"}`);
  }
  if ($("search-input").value.trim()) {
    parts.push(`搜索匹配 ${filtered.length} 条`);
  }
  if (!isPendingTab() && filterLearned) parts.push("已学会");
  if (!isPendingTab() && filterFavorited) parts.push("收藏");
  $("record-count").textContent = parts.join(" · ");
  $("pending-count").textContent = String(pendingTotal);
}

function renderStatusCell(item) {
  const learned = !!item.is_learned;
  const favorited = !!item.is_favorited;
  const pending = !!item.is_pending;

  if (isPendingTab()) {
    return `
      <div class="status-cell">
        <button type="button" class="status-btn${learned ? " is-on" : ""}" data-action="toggle-learned" data-status="learned">${learned ? "✓ 已学会" : "未学会"}</button>
      </div>
    `;
  }

  return `
    <div class="status-cell">
      <button type="button" class="status-btn${learned ? " is-on" : ""}" data-action="toggle-learned" data-status="learned">${learned ? "✓ 已学会" : "未学会"}</button>
      <button type="button" class="status-btn${favorited ? " is-on" : ""}" data-action="toggle-favorited" data-status="favorited">${favorited ? "★ 收藏" : "☆ 收藏"}</button>
      ${pending ? '<span class="pending-badge">待学中</span>' : ""}
    </div>
  `;
}

function renderActionsCell(item) {
  if (isPendingTab()) {
    return `
      <div class="row-actions">
        <button class="btn primary sm" data-action="complete-pending" title="标记为已学会">${ICON.check}<span>完成</span></button>
        <button class="icon-action" data-action="view" title="查看详情">${ICON.view}</button>
      </div>
    `;
  }

  const pendingBtn = item.is_pending
    ? ""
    : `<button class="icon-action is-warn" data-action="mark-pending" title="加入待学">${ICON.clock}</button>`;

  return `
    <div class="row-actions">
      ${pendingBtn}
      <button class="icon-action" data-action="view" title="查看详情">${ICON.view}</button>
      <button class="icon-action" data-action="edit" title="编辑">${ICON.edit}</button>
      <button class="icon-action is-danger" data-action="delete" title="删除">${ICON.trash}</button>
    </div>
  `;
}

function updateFilterChips() {
  $("filter-learned").classList.toggle("is-active", filterLearned);
  $("filter-favorited").classList.toggle("is-active", filterFavorited);
}

function renderTargetCell(item) {
  const visible = !isHidden(item.id);
  const textHtml = visible
    ? `<div class="cell-text cell-target">${escapeHtml(item.translated_text)}</div>`
    : `<div class="cell-text cell-target is-masked">译文已隐藏，点击眼睛显示</div>`;
  return `
    <div class="target-cell">
      ${eyeBtnHtml(visible, visible ? "隐藏译文" : "显示译文")}
      ${textHtml}
    </div>
  `;
}

function renderTable() {
  const tbody = $("history-tbody");
  const filtered = getFilteredItems();
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    $("empty-tip").classList.remove("hidden");
    const hasFilter =
      $("search-input").value.trim() ||
      dateStart ||
      dateEnd ||
      (!isPendingTab() && (filterLearned || filterFavorited));
    $("empty-tip-text").textContent = isPendingTab()
      ? hasFilter
        ? "没有匹配的待学记录"
        : "暂无待学记录，在「全部记录」中点击「待学」添加"
      : hasFilter
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
      <td class="col-target-cell">${renderTargetCell(item)}</td>
      <td>${renderStatusCell(item)}</td>
      <td>${renderActionsCell(item)}</td>
    `;
    tbody.appendChild(tr);
  });

  updateCount();
  updateHeaderEye();
  const loadMore = $("btn-load-more");
  if (allItems.length < serverTotal && !$("search-input").value.trim()) {
    loadMore.classList.remove("hidden");
  } else {
    loadMore.classList.add("hidden");
  }
}

function hideAllTranslations() {
  getFilteredItems().forEach((item) => hiddenIds.add(item.id));
}

function toggleRowVisibility(id) {
  if (hiddenIds.has(id)) hiddenIds.delete(id);
  else hiddenIds.add(id);
  renderTable();
}

function toggleAllVisibility() {
  const filtered = getFilteredItems();
  if (filtered.length === 0) return;
  const allHidden = filtered.every((item) => isHidden(item.id));
  if (allHidden) {
    filtered.forEach((item) => hiddenIds.delete(item.id));
  } else {
    filtered.forEach((item) => hiddenIds.add(item.id));
  }
  renderTable();
}

function getListFilterParams() {
  const params = {
    start_date: dateStart || undefined,
    end_date: dateEnd || undefined,
  };
  if (isPendingTab()) {
    params.is_pending = true;
  } else {
    if (filterLearned) params.is_learned = true;
    if (filterFavorited) params.is_favorited = true;
  }
  return params;
}

async function refreshPendingCount() {
  const resp = await send("GET_HISTORY", { skip: 0, limit: 1, is_pending: true });
  if (resp?.ok) pendingTotal = resp.total;
}

async function loadHistory(reset = false) {
  if (reset) {
    allItems = [];
    loadedTotal = 0;
  }

  const resp = await send("GET_HISTORY", {
    skip: loadedTotal,
    limit: PAGE_SIZE,
    ...getListFilterParams(),
  });
  if (!resp?.ok) {
    toast(resp?.error || "加载失败", "error");
    return;
  }

  allItems = reset ? resp.items : [...allItems, ...resp.items];
  loadedTotal = allItems.length;
  serverTotal = resp.total;
  await refreshPendingCount();
  updateFilterChips();
  renderTable();
}

async function updateItemStatus(id, fields) {
  const item = allItems.find((i) => i.id === id);
  if (!item) return false;

  const resp = await send("UPDATE_HISTORY", { id, ...fields });
  if (!resp?.ok) {
    toast(resp?.error || "更新状态失败", "error");
    return false;
  }

  Object.assign(item, resp.item);
  if (viewingItem?.id === id) viewingItem = { ...item };
  await refreshPendingCount();

  if (isPendingTab() && fields.is_pending === false) {
    allItems = allItems.filter((i) => i.id !== id);
    loadedTotal = allItems.length;
    serverTotal = Math.max(0, serverTotal - 1);
    hiddenIds.delete(id);
    renderTable();
    return true;
  }

  renderTable();
  return true;
}

async function toggleItemStatus(id, field) {
  const item = allItems.find((i) => i.id === id);
  if (!item) return;
  await updateItemStatus(id, { [field]: !item[field] });
}

async function markPending(id) {
  await updateItemStatus(id, { is_pending: true });
}

async function completePending(id) {
  await updateItemStatus(id, { is_pending: false });
}

function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === tab);
  });
  $("toolbar-status").classList.toggle("hidden", isPendingTab());
  hiddenIds.clear();
  if (isPendingTab()) {
    filterLearned = false;
    filterFavorited = false;
    updateFilterChips();
  }
  loadHistory(true).then(() => {
    if (isPendingTab()) hideAllTranslations();
  });
}

function toggleStatusFilter(type) {
  if (type === "learned") filterLearned = !filterLearned;
  if (type === "favorited") filterFavorited = !filterFavorited;
  loadHistory(true);
}

function clearStatusFilter() {
  filterLearned = false;
  filterFavorited = false;
  loadHistory(true);
}

function applyDateFilter() {
  dateStart = $("date-start").value;
  dateEnd = $("date-end").value;
  if (dateStart && dateEnd && dateStart > dateEnd) {
    toast("开始日期不能晚于结束日期", "error");
    return;
  }
  loadHistory(true);
}

function clearDateFilter() {
  dateStart = "";
  dateEnd = "";
  $("date-start").value = "";
  $("date-end").value = "";
  loadHistory(true);
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
  const tags = [];
  if (item.is_pending) tags.push("待学");
  if (item.is_learned) tags.push("已学会");
  if (item.is_favorited) tags.push("收藏");
  const tagText = tags.length ? ` · ${tags.join(" / ")}` : "";
  $("view-meta").textContent = `ID: ${item.id} · ${formatTime(item.created_at)}${tagText}`;
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
  toast(id ? "记录已更新" : "记录已创建", "success");
}

async function deleteRecord(id) {
  if (!confirm("确定删除这条记录吗？")) return;

  const resp = await send("DELETE_HISTORY", { id });
  if (!resp?.ok) {
    toast(resp?.error || "删除失败", "error");
    return;
  }

  closeViewModal();
  hiddenIds.delete(id);
  allItems = allItems.filter((item) => item.id !== id);
  serverTotal = Math.max(0, serverTotal - 1);
  loadedTotal = allItems.length;
  await refreshPendingCount();
  renderTable();
  toast("记录已删除", "success");
}

async function init() {
  $("toggle-all-visible").innerHTML = EYE_OPEN;

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

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

$("btn-refresh").addEventListener("click", () => loadHistory(true));
$("btn-create").addEventListener("click", () => openFormModal("create"));
$("btn-load-more").addEventListener("click", () => loadHistory(false));
$("search-input").addEventListener("input", renderTable);
$("btn-filter-date").addEventListener("click", applyDateFilter);
$("btn-clear-date").addEventListener("click", clearDateFilter);
$("filter-learned").addEventListener("click", () => toggleStatusFilter("learned"));
$("filter-favorited").addEventListener("click", () => toggleStatusFilter("favorited"));
$("btn-clear-status").addEventListener("click", clearStatusFilter);
$("toggle-all-visible").addEventListener("click", toggleAllVisibility);

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
  const eyeBtn = e.target.closest(".eye-btn");
  if (eyeBtn) {
    const tr = eyeBtn.closest("tr");
    if (tr) toggleRowVisibility(Number(tr.dataset.id));
    return;
  }

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
  else if (action === "toggle-learned") toggleItemStatus(id, "is_learned");
  else if (action === "toggle-favorited") toggleItemStatus(id, "is_favorited");
  else if (action === "mark-pending") markPending(id);
  else if (action === "complete-pending") completePending(id);
});

$("btn-go-login").addEventListener("click", () => {
  toast("请点击浏览器工具栏中的扩展图标进行登录");
});

document.addEventListener("keydown", (e) => {
  const formOpen = !$("modal").classList.contains("hidden");
  const viewOpen = !$("view-modal").classList.contains("hidden");

  if (e.key === "Escape") {
    if (formOpen) {
      closeFormModal();
      e.preventDefault();
    } else if (viewOpen) {
      closeViewModal();
      e.preventDefault();
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    if (formOpen) {
      e.preventDefault();
      $("record-form").requestSubmit
        ? $("record-form").requestSubmit()
        : $("record-form").dispatchEvent(new Event("submit", { cancelable: true }));
    }
  }
});

init();
