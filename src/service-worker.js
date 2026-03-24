import { RunManager } from "./background/run-manager";
import {
  SCHEDULER_ALARM_NAME,
  getSchedule,
  handleScheduledRun,
  restoreScheduleAlarm,
  setSchedule,
} from "./background/scheduler";
import { getCurrentUser, initFirebase, signIn, signOut } from "./firebase/auth";
import {
  getRequestedOrders,
  stopWatchingOrders,
  watchRequestedOrders,
} from "./firebase/firestore";
import { API_BASE } from "./shared/api";
import { MSG, log } from "./shared/constants";

// Initialize Firebase
initFirebase();

// --- Context menus ---

function createContextMenu(id, title, contexts = ["selection"]) {
  chrome.contextMenus.remove(id, () => {
    if (
      chrome.runtime.lastError &&
      chrome.runtime.lastError.message &&
      !chrome.runtime.lastError.message.includes("Cannot find menu item")
    ) {
      console.warn(
        "Context menu remove error:",
        chrome.runtime.lastError.message,
      );
    }
    chrome.contextMenus.create({
      id,
      title,
      contexts,
    });
  });
}

createContextMenu("generate-fnsku-label", "Generate FNSKU label", [
  "selection",
  "page",
]);
createContextMenu("asin-info", "ASIN info", ["selection", "page"]);

// Ensure the content script is injected in the given frame (needed for non-Seller Central pages)
async function ensureContentScript(tabId, frameId = 0) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.PING }, { frameId });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["content.js"],
      });
    } catch (err) {
      log("Cannot inject content script into frame", frameId, ":", err.message);
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "generate-fnsku-label") {
    return handleGenerateLabel(info, tab);
  }
  if (info.menuItemId === "asin-info") {
    return handleAsinInfo(info, tab);
  }
});

async function handleGenerateLabel(info, tab) {
  const selectedText = (info.selectionText || "").trim();
  log("Context menu clicked, selection:", selectedText);

  // Ensure content script is available in the right-clicked frame
  await ensureContentScript(tab.id, info.frameId);

  // Ask content script to scrape product details from the DOM (in the frame that was right-clicked)
  let details = null;
  try {
    details = await chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SCRAPE_PRODUCT_DETAILS,
      },
      { frameId: info.frameId },
    );
  } catch (err) {
    log("Could not scrape product details:", err.message);
  }

  const code = details?.fnsku || details?.asin || selectedText;
  const title = details?.title || "";
  const condition = details?.condition || "New";

  if (!code) {
    log("No code found, skipping label generation");
    return;
  }

  // Build API URL and open the inline PDF directly in a new tab, next to the current tab
  const params = new URLSearchParams({ code });
  if (title) params.set("title", title);
  if (condition) params.set("condition", condition);

  const pdfUrl = `${API_BASE}/api/label?${params}`;
  log("Opening label PDF:", pdfUrl);

  // Open beside the current tab if possible
  chrome.tabs.create({
    url: pdfUrl,
    index: tab.index + 1,
    openerTabId: tab.id,
  });
}

async function handleAsinInfo(info, tab) {
  let asin = null;

  // Ensure content script is available in both the right-clicked frame and the top frame
  await ensureContentScript(tab.id, info.frameId);
  if (info.frameId !== 0) await ensureContentScript(tab.id, 0);

  // 1) Try scraping product details from the DOM (in the frame that was right-clicked)
  try {
    const details = await chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SCRAPE_PRODUCT_DETAILS,
      },
      { frameId: info.frameId },
    );
    if (details?.asin) asin = details.asin;
  } catch (err) {
    log("Could not scrape product details:", err.message);
  }

  // 2) Fall back to selected text or right-clicked element (in the correct frame)
  if (!asin) {
    asin = (info.selectionText || "").trim();
  }
  if (!asin) {
    try {
      const result = await chrome.tabs.sendMessage(
        tab.id,
        {
          type: MSG.GET_CLICKED_ASIN,
        },
        { frameId: info.frameId },
      );
      asin = result?.asin || "";
    } catch (err) {
      log("Could not get clicked ASIN:", err.message);
    }
  }

  if (!asin) {
    log("No ASIN found, skipping");
    return;
  }

  // Validate ASIN format (starts with B0, 10 alphanumeric characters)
  if (!/^B0[A-Z0-9]{8}$/i.test(asin)) {
    log("Invalid ASIN format:", asin);
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_INFO,
        error: `"${asin}" is not a valid ASIN`,
      },
      { frameId: 0 },
    );
    return;
  }

  log("ASIN info lookup:", asin);

  // Show loading overlay in the top frame
  chrome.tabs.sendMessage(
    tab.id,
    { type: MSG.SHOW_ASIN_INFO_LOADING },
    { frameId: 0 },
  );

  try {
    const res = await fetch(
      `${API_BASE}/api/product/${encodeURIComponent(asin)}`,
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Server error (${res.status})`);
    }
    const product = await res.json();
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_INFO,
        product,
      },
      { frameId: 0 },
    );
  } catch (err) {
    log("ASIN info error:", err.message);
    chrome.tabs.sendMessage(
      tab.id,
      {
        type: MSG.SHOW_ASIN_INFO,
        error: err.message,
      },
      { frameId: 0 },
    );
  }
}

// Single RunManager instance
const runManager = new RunManager();

// Start watching requested orders once auth is ready
getCurrentUser().then((user) => {
  if (user) startOrdersWatcher();
});

function startOrdersWatcher() {
  watchRequestedOrders((orders) => {
    chrome.runtime
      .sendMessage({ type: MSG.REQUESTED_ORDERS_UPDATE, orders })
      .catch(() => {});
  });
}

// Restore scheduled alarm
restoreScheduleAlarm(runManager);

// --- Alarm listener ---
chrome.alarms.onAlarm.addListener((alarm) => {
  log("Alarm fired:", alarm.name, "at", new Date().toLocaleTimeString());
  if (alarm.name === SCHEDULER_ALARM_NAME) {
    handleScheduledRun(runManager);
  }
});

// --- Message router ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;

  switch (type) {
    case MSG.GET_AUTH_STATE:
      getCurrentUser().then((user) => sendResponse({ user }));
      return true;

    case MSG.SIGN_IN:
      handleSignIn(sendResponse);
      return true;

    case MSG.SIGN_OUT:
      handleSignOut(sendResponse);
      return true;

    case MSG.GET_STATE:
      sendResponse(runManager.getState());
      return false;

    case MSG.START_RUN:
      handleStartRun(sendResponse);
      return true;

    case MSG.STOP_RUN:
      runManager.requestStop();
      sendResponse({ ok: true });
      return false;

    case MSG.GET_SCHEDULE:
      getSchedule().then((schedule) => sendResponse(schedule));
      return true;

    case MSG.SET_SCHEDULE:
      setSchedule(message.payload).then((schedule) =>
        sendResponse({ ok: true, schedule }),
      );
      return true;

    case MSG.GET_REQUESTED_ORDERS:
      getRequestedOrders()
        .then((orders) => sendResponse({ ok: true, orders }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

// --- Async handlers ---

async function handleSignIn(sendResponse) {
  try {
    const user = await signIn();
    startOrdersWatcher();
    sendResponse({ ok: true, user });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleSignOut(sendResponse) {
  try {
    stopWatchingOrders();
    await signOut();
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleStartRun(sendResponse) {
  sendResponse({ ok: true });
  await runManager.startRun();
}
