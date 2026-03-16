/**
 * SellerForge Popup Script.
 *
 * Manages the popup UI: auth state, run controls, progress display.
 * Communicates with the background service worker via chrome.runtime messages.
 */

// We can't use ES module imports in the popup easily with MV3,
// so we duplicate the message type strings here.
const MSG = {
  START_RUN: "START_RUN",
  STOP_RUN: "STOP_RUN",
  GET_STATE: "GET_STATE",
  SIGN_IN: "SIGN_IN",
  SIGN_OUT: "SIGN_OUT",
  GET_AUTH_STATE: "GET_AUTH_STATE",
  STATE_UPDATE: "STATE_UPDATE",
  AUTH_STATE_UPDATE: "AUTH_STATE_UPDATE",
  GET_SCHEDULE: "GET_SCHEDULE",
  SET_SCHEDULE: "SET_SCHEDULE",
  GET_REQUESTED_ORDERS: "GET_REQUESTED_ORDERS",
  REQUESTED_ORDERS_UPDATE: "REQUESTED_ORDERS_UPDATE",
};

// ------------------------------------------------------------------
// DOM references
// ------------------------------------------------------------------

const els = {
  // Auth
  signedOutView: document.getElementById("signed-out-view"),
  signedInView: document.getElementById("signed-in-view"),
  btnSignIn: document.getElementById("btn-sign-in"),
  btnSignOut: document.getElementById("btn-sign-out"),
  userAvatar: document.getElementById("user-avatar"),
  userName: document.getElementById("user-name"),
  userEmail: document.getElementById("user-email"),

  // Controls
  controlsSection: document.getElementById("controls-section"),
  btnStart: document.getElementById("btn-start"),
  btnStop: document.getElementById("btn-stop"),

  // Status
  statusSection: document.getElementById("status-section"),
  statusText: document.getElementById("status-text"),
  currentOrder: document.getElementById("current-order"),
  currentOrderId: document.getElementById("current-order-id"),
  progressFraction: document.getElementById("progress-fraction"),

  // Counters
  countersSection: document.getElementById("counters-section"),
  countDiscovered: document.getElementById("count-discovered"),
  countQueued: document.getElementById("count-queued"),
  countProcessed: document.getElementById("count-processed"),
  countRequested: document.getElementById("count-requested"),
  countAlready: document.getElementById("count-already"),
  countTooEarly: document.getElementById("count-too-early"),
  countFailed: document.getElementById("count-failed"),

  // Error
  errorSection: document.getElementById("error-section"),
  errorText: document.getElementById("error-text"),

  // Schedule
  scheduleSection: document.getElementById("schedule-section"),
  scheduleEnabled: document.getElementById("schedule-enabled"),
  scheduleFields: document.getElementById("schedule-fields"),
  scheduleTime: document.getElementById("schedule-time"),
  scheduleUrl: document.getElementById("schedule-url"),
  btnSaveSchedule: document.getElementById("btn-save-schedule"),
  scheduleStatus: document.getElementById("schedule-status"),

  // Orders table
  ordersListSection: document.getElementById("orders-list-section"),
  ordersTable: document.getElementById("orders-table"),
  ordersTbody: document.getElementById("orders-tbody"),
  ordersListEmpty: document.getElementById("orders-list-empty"),
  ordersPagination: document.getElementById("orders-pagination"),
  btnPrevPage: document.getElementById("btn-prev-page"),
  btnNextPage: document.getElementById("btn-next-page"),
  ordersPageInfo: document.getElementById("orders-page-info"),
};

// ------------------------------------------------------------------
// Initialization
// ------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  // Check auth state
  await refreshAuthState();
  // Check run state
  await refreshRunState();

  // Wire up event listeners
  els.btnSignIn.addEventListener("click", handleSignIn);
  els.btnSignOut.addEventListener("click", handleSignOut);
  els.btnStart.addEventListener("click", handleStart);
  els.btnStop.addEventListener("click", handleStop);

  // Schedule listeners
  els.scheduleEnabled.addEventListener("change", handleScheduleToggle);
  els.btnSaveSchedule.addEventListener("click", handleSaveSchedule);
  els.btnPrevPage.addEventListener("click", () => goToPage(currentPage - 1));
  els.btnNextPage.addEventListener("click", () => goToPage(currentPage + 1));
});

// Listen for state updates pushed from the background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.STATE_UPDATE) {
    renderRunState(message.payload);
  }
  if (message.type === MSG.REQUESTED_ORDERS_UPDATE) {
    renderOrdersList(message.orders);
  }
});

// ------------------------------------------------------------------
// Auth handlers
// ------------------------------------------------------------------

async function refreshAuthState() {
  const response = await sendMessage({ type: MSG.GET_AUTH_STATE });
  renderAuthState(response?.user || null);
}

async function handleSignIn() {
  els.btnSignIn.disabled = true;
  els.btnSignIn.textContent = "Signing in…";

  const response = await sendMessage({ type: MSG.SIGN_IN });

  if (response?.ok) {
    renderAuthState(response.user);
  } else {
    showError(response?.error || "Sign-in failed");
  }

  els.btnSignIn.disabled = false;
  els.btnSignIn.textContent = "Sign in with Google";
}

async function handleSignOut() {
  await sendMessage({ type: MSG.SIGN_OUT });
  renderAuthState(null);
}

function renderAuthState(user) {
  if (user) {
    els.signedOutView.classList.add("hidden");
    els.signedInView.classList.remove("hidden");
    els.controlsSection.classList.remove("hidden");
    els.statusSection.classList.remove("hidden");
    els.countersSection.classList.remove("hidden");
    els.scheduleSection.classList.remove("hidden");

    els.userName.textContent = user.displayName || "User";
    els.userEmail.textContent = user.email || "";
    if (user.photoURL) {
      els.userAvatar.src = user.photoURL;
      els.userAvatar.classList.remove("hidden");
    } else {
      els.userAvatar.classList.add("hidden");
    }

    loadSchedule();
    loadRequestedOrders();
  } else {
    els.signedOutView.classList.remove("hidden");
    els.signedInView.classList.add("hidden");
    els.controlsSection.classList.add("hidden");
    els.statusSection.classList.add("hidden");
    els.countersSection.classList.add("hidden");
    els.scheduleSection.classList.add("hidden");
    els.ordersListSection.classList.add("hidden");
    hideError();
  }
}

// ------------------------------------------------------------------
// Run control handlers
// ------------------------------------------------------------------

async function refreshRunState() {
  const state = await sendMessage({ type: MSG.GET_STATE });
  if (state) {
    renderRunState(state);
  }
}

async function handleStart() {
  hideError();
  await sendMessage({ type: MSG.START_RUN });
}

async function handleStop() {
  await sendMessage({ type: MSG.STOP_RUN });
}

function renderRunState(state) {
  if (!state) return;

  // Status text
  els.statusText.textContent = formatStatus(state.status);

  // Button states
  const isRunning =
    state.status === "discovering" || state.status === "processing";
  els.btnStart.disabled = isRunning;
  els.btnStop.disabled = !isRunning;

  // Current order
  if (state.currentOrderId && isRunning) {
    els.currentOrder.classList.remove("hidden");
    els.currentOrderId.textContent = state.currentOrderId;
    els.progressFraction.textContent = `${state.currentIndex} / ${state.totalInQueue}`;
  } else {
    els.currentOrder.classList.add("hidden");
  }

  // Counters
  els.countDiscovered.textContent = state.discoveredCount;
  els.countQueued.textContent = state.queuedCount;
  els.countProcessed.textContent = state.processedCount;
  els.countRequested.textContent = state.requestedCount;
  els.countAlready.textContent = state.alreadyRequestedCount;
  els.countTooEarly.textContent = state.tooEarlyCount;
  els.countFailed.textContent = state.failedCount;

  // Error
  if (state.error) {
    showError(state.error);
  } else {
    hideError();
  }
}

function formatStatus(status) {
  const labels = {
    idle: "Idle",
    discovering: "Discovering orders…",
    processing: "Processing orders…",
    completed: "Completed",
    stopped: "Stopped",
  };
  return labels[status] || status;
}

// ------------------------------------------------------------------
// Error display
// ------------------------------------------------------------------

function showError(message) {
  els.errorSection.classList.remove("hidden");
  els.errorText.textContent = message;
}

function hideError() {
  els.errorSection.classList.add("hidden");
  els.errorText.textContent = "";
}

// ------------------------------------------------------------------
// Messaging helper
// ------------------------------------------------------------------

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "SellerForge popup message error:",
          chrome.runtime.lastError.message,
        );
        resolve(null);
      } else {
        resolve(response);
      }
    });
  });
}

// ------------------------------------------------------------------
// Schedule handlers
// ------------------------------------------------------------------

async function loadSchedule() {
  const schedule = await sendMessage({ type: MSG.GET_SCHEDULE });
  if (!schedule) return;

  els.scheduleEnabled.checked = schedule.enabled;
  els.scheduleTime.value = schedule.time || "09:00";
  els.scheduleUrl.value = schedule.ordersUrl || "";

  if (schedule.enabled) {
    els.scheduleFields.classList.remove("hidden");
  } else {
    els.scheduleFields.classList.add("hidden");
  }
}

function handleScheduleToggle() {
  if (els.scheduleEnabled.checked) {
    els.scheduleFields.classList.remove("hidden");
  } else {
    els.scheduleFields.classList.add("hidden");
    // Save disabled state immediately
    sendMessage({
      type: MSG.SET_SCHEDULE,
      payload: {
        enabled: false,
        time: els.scheduleTime.value,
        ordersUrl: els.scheduleUrl.value,
      },
    });
    showScheduleStatus("Schedule disabled");
  }
}

async function handleSaveSchedule() {
  const url = els.scheduleUrl.value.trim();
  if (!url) {
    showError("Please enter your Manage Orders page URL");
    return;
  }

  els.btnSaveSchedule.disabled = true;
  els.btnSaveSchedule.textContent = "Saving…";

  const response = await sendMessage({
    type: MSG.SET_SCHEDULE,
    payload: {
      enabled: els.scheduleEnabled.checked,
      time: els.scheduleTime.value,
      ordersUrl: url,
    },
  });

  if (response?.ok) {
    showScheduleStatus("Saved — next run at " + els.scheduleTime.value);
  } else {
    showError("Failed to save schedule");
  }

  els.btnSaveSchedule.textContent = "Save schedule";
  els.btnSaveSchedule.disabled = false;
}

function showScheduleStatus(text) {
  els.scheduleStatus.textContent = text;
  els.scheduleStatus.classList.remove("hidden");
  setTimeout(() => {
    els.scheduleStatus.classList.add("hidden");
  }, 3000);
}

// ------------------------------------------------------------------
// Requested orders table with pagination
// ------------------------------------------------------------------

const ORDERS_PER_PAGE = 10;
let allOrders = [];
let currentPage = 1;

async function loadRequestedOrders() {
  els.ordersListSection.classList.remove("hidden");

  const response = await sendMessage({ type: MSG.GET_REQUESTED_ORDERS });

  if (!response?.ok || !response.orders) {
    els.ordersListEmpty.textContent = "Failed to load orders.";
    els.ordersListEmpty.classList.remove("hidden");
    els.ordersTable.classList.add("hidden");
    els.ordersPagination.classList.add("hidden");
    return;
  }

  renderOrdersList(response.orders);
}

function renderOrdersList(orders) {
  allOrders = orders || [];
  currentPage = 1;
  renderPage();
}

function goToPage(page) {
  const totalPages = Math.ceil(allOrders.length / ORDERS_PER_PAGE) || 1;
  if (page < 1 || page > totalPages) return;
  currentPage = page;
  renderPage();
}

function renderPage() {
  els.ordersTbody.innerHTML = "";

  if (allOrders.length === 0) {
    els.ordersListEmpty.classList.remove("hidden");
    els.ordersTable.classList.add("hidden");
    els.ordersPagination.classList.add("hidden");
    return;
  }

  els.ordersListEmpty.classList.add("hidden");
  els.ordersTable.classList.remove("hidden");

  const totalPages = Math.ceil(allOrders.length / ORDERS_PER_PAGE);
  const start = (currentPage - 1) * ORDERS_PER_PAGE;
  const pageOrders = allOrders.slice(start, start + ORDERS_PER_PAGE);

  pageOrders.forEach((order, i) => {
    const tr = document.createElement("tr");

    const tdNum = document.createElement("td");
    tdNum.textContent = start + i + 1;

    const tdId = document.createElement("td");
    tdId.className = "td-id";
    tdId.textContent = order.orderId;

    const tdDate = document.createElement("td");
    tdDate.className = "td-date";
    tdDate.textContent = formatOrderDate(order.lastRequestedAt);

    tr.appendChild(tdNum);
    tr.appendChild(tdId);
    tr.appendChild(tdDate);
    els.ordersTbody.appendChild(tr);
  });

  // Pagination controls
  if (totalPages > 1) {
    els.ordersPagination.classList.remove("hidden");
    els.btnPrevPage.disabled = currentPage <= 1;
    els.btnNextPage.disabled = currentPage >= totalPages;
    els.ordersPageInfo.textContent = currentPage + " / " + totalPages;
  } else {
    els.ordersPagination.classList.add("hidden");
  }
}

function formatOrderDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}
