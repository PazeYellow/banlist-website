"use strict";

const rawApiBase = window.BANLIST_CONFIG?.apiBaseUrl || "";
const API_BASE = rawApiBase.replace(/\/+$/, "");
const CONFIGURED =
  API_BASE.startsWith("https://") &&
  !API_BASE.includes("YOUR-WORKER") &&
  !API_BASE.includes("example.com");

const state = {
  entries: [],
  meta: {
    title: "Banlist",
    description:
      "Forbidden, Limited, and Semi-Limited cards for this format.",
    effectiveDate: null,
    updatedAt: null,
  },
  query: "",
  category: null,
  token: sessionStorage.getItem("duel-ledger-token") || "",
  account: null,
  entryMode: "create",
  entrySource: "official",
  editingEntry: null,
  selectedOfficial: null,
  officialSearchTimer: null,
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  siteHeader: $("#siteHeader"),
  siteFooter: $("#siteFooter"),
  homeView: $("#homeView"),
  listView: $("#listView"),
  categoryGrid: $("#categoryGrid"),
  categoryTitle: $("#categoryTitle"),
  categoryRule: $("#categoryRule"),
  headerListName: $("#headerListName"),
  setupNotice: $("#setupNotice"),
  effectiveDate: $("#effectiveDate"),
  updatedDate: $("#updatedDate"),
  forbiddenCount: $("#forbiddenCount"),
  limitedCount: $("#limitedCount"),
  semiLimitedCount: $("#semiLimitedCount"),
  listSearch: $("#listSearch"),
  adminButton: $("#adminButton"),
  adminDock: $("#adminDock"),
  accountEmail: $("#accountEmail"),
  accountRole: $("#accountRole"),
  manageAccessButton: $("#manageAccessButton"),
  pendingBadge: $("#pendingBadge"),
  loginDialog: $("#loginDialog"),
  loginForm: $("#loginForm"),
  loginError: $("#loginError"),
  requestAccessForm: $("#requestAccessForm"),
  requestAccessError: $("#requestAccessError"),
  requestAccessSuccess: $("#requestAccessSuccess"),
  resetRequestForm: $("#resetRequestForm"),
  resetRequestError: $("#resetRequestError"),
  resetRequestSuccess: $("#resetRequestSuccess"),
  entryDialog: $("#entryDialog"),
  entryForm: $("#entryForm"),
  entryDialogTitle: $("#entryDialogTitle"),
  sourceTabs: $("#sourceTabs"),
  officialPanel: $("#officialPanel"),
  customPanel: $("#customPanel"),
  officialSearch: $("#officialSearch"),
  officialResults: $("#officialResults"),
  selectedOfficial: $("#selectedOfficial"),
  customName: $("#customName"),
  customImageUrl: $("#customImageUrl"),
  customPreview: $("#customPreview"),
  entryStatus: $("#entryStatus"),
  entryNote: $("#entryNote"),
  entryError: $("#entryError"),
  deleteEntryButton: $("#deleteEntryButton"),
  saveEntryButton: $("#saveEntryButton"),
  detailsDialog: $("#detailsDialog"),
  detailsForm: $("#detailsForm"),
  metaTitle: $("#metaTitle"),
  metaDescription: $("#metaDescription"),
  metaEffectiveDate: $("#metaEffectiveDate"),
  detailsError: $("#detailsError"),
  accessDialog: $("#accessDialog"),
  accountRequestList: $("#accountRequestList"),
  resetRequestList: $("#resetRequestList"),
  ownerList: $("#ownerList"),
  adminList: $("#adminList"),
  accountRequestCount: $("#accountRequestCount"),
  resetRequestCount: $("#resetRequestCount"),
  ownerCount: $("#ownerCount"),
  adminCount: $("#adminCount"),
  accountDialog: $("#accountDialog"),
  accountDialogEmail: $("#accountDialogEmail"),
  accountDialogRole: $("#accountDialogRole"),
  managedOwnerNote: $("#managedOwnerNote"),
  passwordForm: $("#passwordForm"),
  passwordError: $("#passwordError"),
  forcedPasswordDialog: $("#forcedPasswordDialog"),
  forcedPasswordForm: $("#forcedPasswordForm"),
  forcedPasswordError: $("#forcedPasswordError"),
  temporaryPasswordDialog: $("#temporaryPasswordDialog"),
  temporaryPasswordEmail: $("#temporaryPasswordEmail"),
  temporaryPasswordValue: $("#temporaryPasswordValue"),
  copyTemporaryPassword: $("#copyTemporaryPassword"),
  toastRegion: $("#toastRegion"),
};

const statusLabels = {
  forbidden: { label: "Banned", copies: "0 copies" },
  limited: { label: "Limited", copies: "1 copy" },
  semi_limited: { label: "Semi-limited", copies: "2 copies" },
};

const categoryDetails = {
  forbidden: { title: "Banned", rule: "0 copies per Deck" },
  limited: { title: "Limited", rule: "1 copy per Deck" },
  semi_limited: { title: "Semi-Limited", rule: "2 copies per Deck" },
};

function formatDate(value, fallback = "Not announced") {
  if (!value) return fallback;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function configureView() {
  const requested = new URLSearchParams(window.location.search).get("list");
  state.category = Object.hasOwn(categoryDetails, requested) ? requested : null;
  const isListPage = Boolean(state.category);

  elements.homeView.classList.toggle("hidden", isListPage);
  elements.listView.classList.toggle("hidden", !isListPage);
  elements.siteHeader.classList.toggle("hidden", !isListPage);
  elements.siteFooter.classList.toggle("hidden", !isListPage);
  document.body.classList.toggle("is-home", !isListPage);
  document.body.classList.toggle("is-list-page", isListPage);

  if (isListPage) {
    const details = categoryDetails[state.category];
    elements.categoryTitle.textContent = details.title;
    elements.categoryRule.textContent = details.rule;
    elements.headerListName.textContent = details.title;
    document.title = `${details.title} — Banlist`;
  } else {
    document.title = "Banlist";
  }

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.querySelectorAll(".banlist-link, .back-link").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        document.body.classList.add("page-leaving");
        window.setTimeout(() => {
          window.location.href = link.href;
        }, 150);
      });
    });
  }
}

function setLoading() {
  if (!state.category) return;
  elements.categoryGrid.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "loading-state";
  const spinner = document.createElement("span");
  spinner.setAttribute("aria-label", "Loading banlist");
  loading.append(spinner);
  elements.categoryGrid.append(loading);
}

function showSetupNotice(message) {
  elements.setupNotice.textContent = message;
  elements.setupNotice.classList.remove("hidden");
}

async function api(path, options = {}) {
  if (!CONFIGURED) {
    throw new Error("Connect the site to your Worker in docs/config.js first.");
  }
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false && state.token) {
    headers.set("Authorization", `Bearer ${state.token}`);
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Could not reach the banlist server. Check the Worker URL and allowed origin.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    if (response.status === 401 && options.auth !== false) setAccountSession("", null);
    throw new Error(payload?.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function showMessage(element, message) {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = busy;
}

function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4200);
}

async function loadBanlist({ silent = false } = {}) {
  if (!silent) setLoading();
  if (!CONFIGURED) {
    showSetupNotice(
      "Setup required: deploy the Worker, then paste its URL into docs/config.js. README.md contains the full guide.",
    );
    state.entries = [];
    renderBanlist();
    return;
  }
  try {
    const payload = await api("/api/banlist", { auth: false });
    state.entries = Array.isArray(payload.entries) ? payload.entries : [];
    state.meta = { ...state.meta, ...(payload.meta || {}) };
    elements.setupNotice.classList.add("hidden");
    renderMeta();
    renderBanlist();
  } catch (error) {
    showSetupNotice(error.message);
    state.entries = [];
    renderBanlist();
  }
}

function renderMeta() {
  elements.effectiveDate.textContent = formatDate(state.meta.effectiveDate);
  elements.updatedDate.textContent = formatDate(state.meta.updatedAt, "No changes yet");
}

function imageWithFallback(url, alt) {
  const image = document.createElement("img");
  image.src = url;
  image.alt = alt;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener(
    "error",
    () => {
      const fallback = document.createElement("div");
      fallback.className = "image-fallback";
      fallback.textContent = "DL";
      image.replaceWith(fallback);
    },
    { once: true },
  );
  return image;
}

function createCard(entry) {
  const card = document.createElement("article");
  card.className = "ban-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "ban-card-image";
  imageWrap.append(imageWithFallback(entry.imageUrl, `${entry.name} card art`));

  const badges = document.createElement("div");
  badges.className = "card-badges";
  const statusBadge = document.createElement("span");
  statusBadge.className = `status-badge ${entry.status}`;
  statusBadge.textContent = statusLabels[entry.status]?.label || entry.status;
  badges.append(statusBadge);
  if (entry.isCustom) {
    const customBadge = document.createElement("span");
    customBadge.className = "custom-badge";
    customBadge.textContent = "Custom";
    badges.append(customBadge);
  }
  imageWrap.append(badges);

  const body = document.createElement("div");
  body.className = "ban-card-body";
  const title = document.createElement("h3");
  title.textContent = entry.name;
  const note = document.createElement("p");
  note.className = "ban-card-note";
  note.textContent = entry.note || "No additional ruling note.";

  const footer = document.createElement("div");
  footer.className = "ban-card-footer";
  const copies = document.createElement("span");
  copies.textContent = statusLabels[entry.status]?.copies || "";
  footer.append(copies);
  if (state.account && !state.account.mustChangePassword) {
    const editButton = document.createElement("button");
    editButton.className = "edit-card-button";
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => openEditEntry(entry));
    footer.append(editButton);
  } else {
    const source = document.createElement("span");
    source.textContent = entry.isCustom ? "Community card" : "Official card";
    footer.append(source);
  }

  body.append(title, note, footer);
  card.append(imageWrap, body);
  return card;
}

function renderBanlist() {
  const query = state.query.trim().toLocaleLowerCase();
  const visible = state.entries.filter((entry) => {
    return (
      !query ||
      entry.name.toLocaleLowerCase().includes(query) ||
      (entry.note || "").toLocaleLowerCase().includes(query)
    );
  });

  const count = (status) => state.entries.filter((entry) => entry.status === status).length;
  elements.forbiddenCount.textContent = count("forbidden");
  elements.limitedCount.textContent = count("limited");
  elements.semiLimitedCount.textContent = count("semi_limited");

  if (!state.category) return;
  const details = categoryDetails[state.category];
  renderRestrictionGrid(
    elements.categoryGrid,
    visible.filter((entry) => entry.status === state.category),
    query
      ? `No matching ${details.title} cards.`
      : `No ${details.title} cards.`,
  );
}

function renderRestrictionGrid(grid, entries, emptyMessage) {
  grid.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const copy = document.createElement("p");
    copy.textContent = emptyMessage;
    empty.append(copy);
    grid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => fragment.append(createCard(entry)));
  grid.append(fragment);
}

function setAccountSession(token, account) {
  state.token = token;
  state.account = account;
  if (token) sessionStorage.setItem("duel-ledger-token", token);
  else sessionStorage.removeItem("duel-ledger-token");
  if (!account && elements.forcedPasswordDialog.open) {
    elements.forcedPasswordDialog.close();
  }

  const ready = Boolean(account && !account.mustChangePassword && state.category);
  elements.adminDock.classList.toggle("hidden", !ready);
  elements.adminButton.textContent = account ? "Admin panel" : "Admin login";
  elements.manageAccessButton.classList.toggle("hidden", account?.role !== "owner");
  if (account) {
    elements.accountEmail.textContent = account.email;
    elements.accountRole.textContent = account.role;
  }
  if (account?.role === "owner" && ready) refreshPendingCount();
  else {
    elements.pendingBadge.classList.add("hidden");
    elements.pendingBadge.textContent = "0";
  }
  renderBanlist();
}

async function restoreSession() {
  if (!state.token || !CONFIGURED) return;
  try {
    const payload = await api("/api/auth/me");
    setAccountSession(state.token, payload.account);
    if (payload.account.mustChangePassword) openForcedPassword();
  } catch {
    setAccountSession("", null);
  }
}

function setAuthPanel(panel) {
  document.querySelectorAll("[data-auth-panel]").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authPanel === panel);
  });
  document.querySelectorAll("[data-auth-content]").forEach((content) => {
    content.classList.toggle("hidden", content.dataset.authContent !== panel);
  });
}

function openLogin(panel = "signin") {
  setAuthPanel(panel);
  showMessage(elements.loginError, "");
  showMessage(elements.requestAccessError, "");
  showMessage(elements.requestAccessSuccess, "");
  showMessage(elements.resetRequestError, "");
  showMessage(elements.resetRequestSuccess, "");
  elements.loginDialog.showModal();
}

function openForcedPassword() {
  if (!elements.forcedPasswordDialog.open) elements.forcedPasswordDialog.showModal();
}

async function refreshPendingCount() {
  if (state.account?.role !== "owner") return;
  try {
    const payload = await api("/api/owner/pending-count");
    elements.pendingBadge.textContent = String(payload.total || 0);
    elements.pendingBadge.classList.toggle("hidden", !payload.total);
  } catch {
    elements.pendingBadge.classList.add("hidden");
  }
}

function emptyAccessList(container, message) {
  const empty = document.createElement("div");
  empty.className = "access-empty";
  empty.textContent = message;
  container.append(empty);
}

function accessRow(email, detail) {
  const row = document.createElement("div");
  row.className = "access-row";
  const copy = document.createElement("div");
  copy.className = "access-row-copy";
  const name = document.createElement("strong");
  name.textContent = email;
  const small = document.createElement("small");
  small.textContent = detail;
  copy.append(name, small);
  const actions = document.createElement("div");
  actions.className = "access-actions";
  row.append(copy, actions);
  return { row, copy, actions };
}

function actionButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

async function loadAccess() {
  [elements.accountRequestList, elements.resetRequestList, elements.ownerList, elements.adminList]
    .forEach((container) => {
      container.replaceChildren();
      emptyAccessList(container, "Loading…");
    });
  try {
    const payload = await api("/api/owner/access");
    renderAccess(payload.accounts || [], payload.passwordResets || []);
    refreshPendingCount();
  } catch (error) {
    toast(error.message, "error");
  }
}

function renderAccess(accounts, resets) {
  const pending = accounts.filter((account) => account.status === "pending");
  const owners = accounts.filter(
    (account) => account.status === "active" && account.role === "owner",
  );
  const admins = accounts.filter(
    (account) => account.status === "active" && account.role === "admin",
  );
  elements.accountRequestCount.textContent = String(pending.length);
  elements.resetRequestCount.textContent = String(resets.length);
  elements.ownerCount.textContent = String(owners.length);
  elements.adminCount.textContent = String(admins.length);
  [
    elements.accountRequestList,
    elements.resetRequestList,
    elements.ownerList,
    elements.adminList,
  ].forEach((container) => container.replaceChildren());

  if (!pending.length) emptyAccessList(elements.accountRequestList, "No access requests.");
  pending.forEach((account) => {
    const { row, actions } = accessRow(
      account.email,
      `Requested ${formatDate(account.createdAt, "recently")}`,
    );
    actions.append(
      actionButton("Approve", "approve-action", () =>
        runAccessAction(`/api/owner/accounts/${account.id}/approve`, "Account approved."),
      ),
      actionButton("Reject", "reject-action", () =>
        runAccessAction(`/api/owner/accounts/${account.id}/reject`, "Request rejected."),
      ),
    );
    elements.accountRequestList.append(row);
  });

  if (!resets.length) emptyAccessList(elements.resetRequestList, "No password reset pings.");
  resets.forEach((reset) => {
    const { row, actions } = accessRow(
      reset.email,
      `Requested ${formatDate(reset.createdAt, "recently")}`,
    );
    actions.append(
      actionButton("Approve", "approve-action", () => approveReset(reset.id)),
      actionButton("Reject", "reject-action", () =>
        runAccessAction(
          `/api/owner/password-resets/${reset.id}/reject`,
          "Password reset rejected.",
        ),
      ),
    );
    elements.resetRequestList.append(row);
  });

  if (!owners.length) emptyAccessList(elements.ownerList, "No Owners.");
  owners.forEach((account) => renderActiveAccount(account, elements.ownerList, owners.length));
  if (!admins.length) emptyAccessList(elements.adminList, "No Admins.");
  admins.forEach((account) => renderActiveAccount(account, elements.adminList, owners.length));
}

function renderActiveAccount(account, container, ownerTotal) {
  const { row, copy, actions } = accessRow(
    account.email,
    account.lastLoginAt ? `Last login ${formatDate(account.lastLoginAt)}` : "Has not signed in yet",
  );
  if (account.managedByEnv) {
    const badge = document.createElement("span");
    badge.className = "env-badge";
    badge.textContent = "Cloudflare root";
    copy.append(badge);
  }

  const isSelf = account.id === state.account?.id;
  if (!account.managedByEnv && !isSelf) {
    const role = document.createElement("select");
    role.setAttribute("aria-label", `Role for ${account.email}`);
    role.innerHTML =
      '<option value="admin">Admin</option><option value="owner">Owner</option>';
    role.value = account.role;
    role.addEventListener("change", async () => {
      try {
        await api(`/api/owner/accounts/${account.id}`, {
          method: "PATCH",
          body: JSON.stringify({ role: role.value }),
        });
        toast(`${account.email} is now an ${role.value === "owner" ? "Owner" : "Admin"}.`);
        await loadAccess();
      } catch (error) {
        toast(error.message, "error");
        role.value = account.role;
      }
    });
    actions.append(role);
    const remove = actionButton("Remove", "reject-action", async () => {
      if (!window.confirm(`Remove access for ${account.email}?`)) return;
      try {
        await api(`/api/owner/accounts/${account.id}`, { method: "DELETE" });
        toast("Account removed.");
        await loadAccess();
      } catch (error) {
        toast(error.message, "error");
      }
    });
    remove.disabled = account.role === "owner" && ownerTotal <= 1;
    actions.append(remove);
  }
  container.append(row);
}

async function runAccessAction(path, successMessage) {
  try {
    await api(path, { method: "POST" });
    toast(successMessage);
    await loadAccess();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function approveReset(id) {
  try {
    const payload = await api(`/api/owner/password-resets/${id}/approve`, {
      method: "POST",
    });
    elements.temporaryPasswordEmail.textContent = payload.email;
    elements.temporaryPasswordValue.textContent = payload.temporaryPassword;
    elements.temporaryPasswordDialog.showModal();
    await loadAccess();
  } catch (error) {
    toast(error.message, "error");
  }
}

function resetEntryForm() {
  state.entryMode = "create";
  state.editingEntry = null;
  state.selectedOfficial = null;
  state.entrySource = "official";
  elements.entryForm.reset();
  elements.entryStatus.value = "forbidden";
  elements.entryDialogTitle.textContent = "Add a card";
  elements.saveEntryButton.textContent = "Add to list";
  elements.deleteEntryButton.classList.add("hidden");
  elements.sourceTabs.classList.remove("hidden");
  elements.officialSearch.disabled = false;
  renderOfficialResults([], "Type at least 2 characters to search.");
  elements.selectedOfficial.replaceChildren();
  elements.selectedOfficial.classList.add("hidden");
  renderCustomPreview();
  setEntrySource("official");
  showMessage(elements.entryError, "");
}

function setEntrySource(source) {
  state.entrySource = source;
  document.querySelectorAll(".source-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.source === source);
  });
  elements.officialPanel.classList.toggle("hidden", source !== "official");
  elements.customPanel.classList.toggle("hidden", source !== "custom");
}

function renderSelectedOfficial() {
  elements.selectedOfficial.replaceChildren();
  if (!state.selectedOfficial) {
    elements.selectedOfficial.classList.add("hidden");
    return;
  }
  const card = state.selectedOfficial;
  elements.selectedOfficial.append(imageWithFallback(card.imageUrlSmall || card.imageUrl, ""));
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = card.name;
  const detail = document.createElement("small");
  detail.textContent = `${card.type || "Official card"} · ID ${card.id}`;
  copy.append(name, detail);
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = state.entryMode === "edit" ? "Selected" : "Change";
  clear.disabled = state.entryMode === "edit";
  clear.addEventListener("click", () => {
    state.selectedOfficial = null;
    renderSelectedOfficial();
    elements.officialSearch.focus();
  });
  elements.selectedOfficial.append(copy, clear);
  elements.selectedOfficial.classList.remove("hidden");
}

function renderOfficialResults(cards, message = "") {
  elements.officialResults.replaceChildren();
  if (message || !cards.length) {
    const prompt = document.createElement("p");
    prompt.className = "search-prompt";
    prompt.textContent = message || "No cards found. Try another name.";
    elements.officialResults.append(prompt);
    return;
  }
  cards.forEach((card) => {
    const result = document.createElement("button");
    result.className = "official-result";
    result.type = "button";
    result.append(imageWithFallback(card.imageUrlSmall || card.imageUrl, ""));
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = card.name;
    const detail = document.createElement("small");
    detail.textContent = card.type || "Official card";
    copy.append(name, detail);
    result.append(copy);
    result.addEventListener("click", () => {
      state.selectedOfficial = card;
      elements.officialSearch.value = card.name;
      elements.officialResults.replaceChildren();
      renderSelectedOfficial();
    });
    elements.officialResults.append(result);
  });
}

async function searchOfficialCards(query) {
  renderOfficialResults([], "Searching the official database…");
  try {
    const payload = await api(`/api/cards/search?q=${encodeURIComponent(query)}`, {
      auth: false,
    });
    if (elements.officialSearch.value.trim() === query) {
      renderOfficialResults(payload.cards || []);
    }
  } catch (error) {
    renderOfficialResults([], error.message);
  }
}

function renderCustomPreview() {
  elements.customPreview.replaceChildren();
  const url = elements.customImageUrl.value.trim();
  if (!url) {
    const label = document.createElement("span");
    label.textContent = "Image preview";
    elements.customPreview.append(label);
  } else {
    elements.customPreview.append(imageWithFallback(url, "Custom card preview"));
  }
}

function openCreateEntry() {
  resetEntryForm();
  elements.entryDialog.showModal();
}

function openEditEntry(entry) {
  resetEntryForm();
  state.entryMode = "edit";
  state.editingEntry = entry;
  state.entrySource = entry.isCustom ? "custom" : "official";
  elements.entryDialogTitle.textContent = "Edit restriction";
  elements.saveEntryButton.textContent = "Save changes";
  elements.deleteEntryButton.classList.remove("hidden");
  elements.sourceTabs.classList.add("hidden");
  elements.entryStatus.value = entry.status;
  elements.entryNote.value = entry.note || "";
  if (entry.isCustom) {
    setEntrySource("custom");
    elements.customName.value = entry.name;
    elements.customImageUrl.value = entry.imageUrl;
    renderCustomPreview();
  } else {
    setEntrySource("official");
    state.selectedOfficial = {
      id: entry.cardId,
      name: entry.name,
      imageUrl: entry.imageUrl,
      imageUrlSmall: entry.imageUrl,
      type: "Official card",
    };
    elements.officialSearch.disabled = true;
    elements.officialSearch.value = entry.name;
    elements.officialResults.replaceChildren();
    renderSelectedOfficial();
  }
  elements.entryDialog.showModal();
}

function openDetails() {
  elements.metaTitle.value = state.meta.title || "";
  elements.metaDescription.value = state.meta.description || "";
  elements.metaEffectiveDate.value = state.meta.effectiveDate || "";
  showMessage(elements.detailsError, "");
  elements.detailsDialog.showModal();
}

elements.listSearch.addEventListener("input", () => {
  state.query = elements.listSearch.value;
  renderBanlist();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => $(`#${button.dataset.close}`)?.close());
});

document.querySelectorAll("[data-auth-panel]").forEach((button) => {
  button.addEventListener("click", () => setAuthPanel(button.dataset.authPanel));
});

elements.adminButton.addEventListener("click", () => {
  if (state.account?.mustChangePassword) openForcedPassword();
  else if (state.account) elements.adminDock.classList.remove("hidden");
  else openLogin();
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(elements.loginForm);
  const submit = elements.loginForm.querySelector('button[type="submit"]');
  setBusy(submit, true, "Signing in…");
  showMessage(elements.loginError, "");
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    setAccountSession(payload.token, payload.account);
    elements.loginForm.reset();
    elements.loginDialog.close();
    if (payload.account.mustChangePassword) openForcedPassword();
    else toast(`Signed in as ${payload.account.role}.`);
  } catch (error) {
    showMessage(elements.loginError, error.message);
  } finally {
    setBusy(submit, false);
  }
});

elements.requestAccessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(elements.requestAccessForm);
  const submit = elements.requestAccessForm.querySelector('button[type="submit"]');
  setBusy(submit, true, "Sending…");
  showMessage(elements.requestAccessError, "");
  showMessage(elements.requestAccessSuccess, "");
  try {
    const payload = await api("/api/auth/request-account", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
    });
    elements.requestAccessForm.reset();
    showMessage(elements.requestAccessSuccess, payload.message);
  } catch (error) {
    showMessage(elements.requestAccessError, error.message);
  } finally {
    setBusy(submit, false);
  }
});

elements.resetRequestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(elements.resetRequestForm);
  const submit = elements.resetRequestForm.querySelector('button[type="submit"]');
  setBusy(submit, true, "Sending…");
  showMessage(elements.resetRequestError, "");
  showMessage(elements.resetRequestSuccess, "");
  try {
    const payload = await api("/api/auth/request-password-reset", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email: data.get("email") }),
    });
    elements.resetRequestForm.reset();
    showMessage(elements.resetRequestSuccess, payload.message);
  } catch (error) {
    showMessage(elements.resetRequestError, error.message);
  } finally {
    setBusy(submit, false);
  }
});

$("#logoutButton").addEventListener("click", () => {
  if (elements.forcedPasswordDialog.open) elements.forcedPasswordDialog.close();
  setAccountSession("", null);
  toast("Signed out.");
});

$("#forcedLogoutButton").addEventListener("click", () => {
  elements.forcedPasswordDialog.close();
  setAccountSession("", null);
  toast("Signed out.");
});

$("#addCardButton").addEventListener("click", openCreateEntry);
$("#editDetailsButton").addEventListener("click", openDetails);
elements.manageAccessButton.addEventListener("click", async () => {
  elements.accessDialog.showModal();
  await loadAccess();
});

$("#accountButton").addEventListener("click", () => {
  elements.accountDialogEmail.textContent = state.account.email;
  elements.accountDialogRole.textContent = state.account.role;
  const managed = Boolean(state.account.managedByEnv);
  elements.managedOwnerNote.classList.toggle("hidden", !managed);
  elements.passwordForm.classList.toggle("hidden", managed);
  elements.passwordForm.reset();
  showMessage(elements.passwordError, "");
  elements.accountDialog.showModal();
});

document.querySelectorAll(".source-tab").forEach((tab) => {
  tab.addEventListener("click", () => setEntrySource(tab.dataset.source));
});

elements.officialSearch.addEventListener("input", () => {
  window.clearTimeout(state.officialSearchTimer);
  const query = elements.officialSearch.value.trim();
  if (query.length < 2) {
    renderOfficialResults([], "Type at least 2 characters to search.");
    return;
  }
  state.officialSearchTimer = window.setTimeout(() => searchOfficialCards(query), 450);
});

elements.customImageUrl.addEventListener("input", () => {
  window.clearTimeout(elements.customImageUrl.previewTimer);
  elements.customImageUrl.previewTimer = window.setTimeout(renderCustomPreview, 350);
});

elements.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    status: elements.entryStatus.value,
    note: elements.entryNote.value.trim(),
  };
  if (state.entryMode === "create") {
    payload.source = state.entrySource;
    if (state.entrySource === "official") {
      if (!state.selectedOfficial) {
        showMessage(elements.entryError, "Choose an official card from the search results.");
        return;
      }
      Object.assign(payload, {
        cardId: state.selectedOfficial.id,
        name: state.selectedOfficial.name,
        imageUrl: state.selectedOfficial.imageUrl,
      });
    } else {
      Object.assign(payload, {
        name: elements.customName.value.trim(),
        imageUrl: elements.customImageUrl.value.trim(),
      });
    }
  } else if (state.editingEntry?.isCustom) {
    payload.name = elements.customName.value.trim();
    payload.imageUrl = elements.customImageUrl.value.trim();
  }

  setBusy(elements.saveEntryButton, true, "Saving…");
  showMessage(elements.entryError, "");
  try {
    if (state.entryMode === "create") {
      await api("/api/admin/entries", { method: "POST", body: JSON.stringify(payload) });
      toast(`${payload.name} was added to the list.`);
    } else {
      await api(`/api/admin/entries/${state.editingEntry.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      toast("Restriction updated.");
    }
    elements.entryDialog.close();
    await loadBanlist({ silent: true });
  } catch (error) {
    showMessage(elements.entryError, error.message);
  } finally {
    setBusy(elements.saveEntryButton, false);
  }
});

elements.deleteEntryButton.addEventListener("click", async () => {
  if (!state.editingEntry) return;
  if (!window.confirm(`Remove “${state.editingEntry.name}” from the banlist?`)) return;
  setBusy(elements.deleteEntryButton, true, "Removing…");
  try {
    await api(`/api/admin/entries/${state.editingEntry.id}`, { method: "DELETE" });
    elements.entryDialog.close();
    toast("Card removed from the list.");
    await loadBanlist({ silent: true });
  } catch (error) {
    showMessage(elements.entryError, error.message);
  } finally {
    setBusy(elements.deleteEntryButton, false);
  }
});

elements.detailsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = elements.detailsForm.querySelector('button[type="submit"]');
  setBusy(submit, true, "Publishing…");
  showMessage(elements.detailsError, "");
  try {
    await api("/api/admin/meta", {
      method: "PUT",
      body: JSON.stringify({
        title: elements.metaTitle.value.trim(),
        description: elements.metaDescription.value.trim(),
        effectiveDate: elements.metaEffectiveDate.value || null,
      }),
    });
    elements.detailsDialog.close();
    toast("List details published.");
    await loadBanlist({ silent: true });
  } catch (error) {
    showMessage(elements.detailsError, error.message);
  } finally {
    setBusy(submit, false);
  }
});

async function submitPasswordForm(form, errorElement, forced) {
  const data = new FormData(form);
  const submit = form.querySelector('button[type="submit"]');
  setBusy(submit, true, "Updating…");
  showMessage(errorElement, "");
  try {
    const payload = await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: data.get("currentPassword"),
        newPassword: data.get("newPassword"),
      }),
    });
    setAccountSession(payload.token, payload.account);
    form.reset();
    if (forced) elements.forcedPasswordDialog.close();
    else elements.accountDialog.close();
    toast("Password updated. Older sessions were signed out.");
  } catch (error) {
    showMessage(errorElement, error.message);
  } finally {
    setBusy(submit, false);
  }
}

elements.passwordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPasswordForm(elements.passwordForm, elements.passwordError, false);
});

elements.forcedPasswordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPasswordForm(elements.forcedPasswordForm, elements.forcedPasswordError, true);
});

elements.forcedPasswordDialog.addEventListener("cancel", (event) => {
  if (state.account?.mustChangePassword) event.preventDefault();
});

elements.copyTemporaryPassword.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.temporaryPasswordValue.textContent);
    toast("Temporary password copied.");
  } catch {
    toast("Copy failed. Select the temporary password manually.", "error");
  }
});

configureView();
renderMeta();
loadBanlist();
restoreSession();
window.setInterval(() => {
  if (state.account?.role === "owner" && !state.account.mustChangePassword) {
    refreshPendingCount();
  }
}, 60_000);
