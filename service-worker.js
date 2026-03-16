/**
 * SellerForge background service worker.
 *
 * Entry point for the extension's background logic.
 * Routes messages between popup, content scripts, and Firebase.
 */

// Load Firebase compat SDK
try {
  importScripts(
    "lib/firebase-app-compat.js",
    "lib/firebase-auth-compat.js",
    "lib/firebase-firestore-compat.js",
  );
} catch (e) {
  console.error("SellerForge: Failed to load Firebase SDK", e);
}

// Load our modules (order matters)
try {
  importScripts(
    "shared/constants.js",
    "shared/utils.js",
    "firebase/firebase-config.js",
    "firebase/firebase-auth.js",
    "firebase/firebase-firestore.js",
    "background/order-queue.js",
    "background/run-manager.js",
    "background/scheduler.js",
  );
} catch (e) {
  console.error("SellerForge: Failed to load modules", e);
}

var SF = self.SellerForge;
if (!SF) {
  throw new Error(
    "SellerForge modules failed to load. Check importScripts paths.",
  );
}
var MSG = SF.MSG;

// Initialize Firebase on service worker start
SF.initFirebase();

// Single RunManager instance
var runManager = new SF.RunManager();

// Start watching requested orders once auth is ready
SF.getCurrentUser().then(function (user) {
  if (user) {
    startOrdersWatcher();
  }
});

function startOrdersWatcher() {
  SF.watchRequestedOrders(function (orders) {
    chrome.runtime
      .sendMessage({
        type: MSG.REQUESTED_ORDERS_UPDATE,
        orders: orders,
      })
      .catch(function () {
        // Popup may not be open
      });
  });
}

// Restore scheduled alarm if one was set (and check for overdue runs)
SF.restoreScheduleAlarm(runManager);

// ------------------------------------------------------------------
// Alarm listener (scheduled daily runs)
// ------------------------------------------------------------------
chrome.alarms.onAlarm.addListener(function (alarm) {
  SF.log("Alarm fired:", alarm.name, "at", new Date().toLocaleTimeString());
  if (alarm.name === SF.SCHEDULER_ALARM_NAME) {
    SF.handleScheduledRun(runManager);
  }
});

// ------------------------------------------------------------------
// Message router
// ------------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  var type = message.type;

  switch (type) {
    case MSG.GET_AUTH_STATE:
      SF.getCurrentUser().then(function (user) {
        sendResponse({ user: user });
      });
      return true;

    case MSG.SIGN_IN:
      handleSignIn(sendResponse);
      return true; // async

    case MSG.SIGN_OUT:
      handleSignOut(sendResponse);
      return true; // async

    case MSG.GET_STATE:
      sendResponse(runManager.getState());
      return false;

    case MSG.START_RUN:
      handleStartRun(sendResponse);
      return true; // async

    case MSG.STOP_RUN:
      runManager.requestStop();
      sendResponse({ ok: true });
      return false;

    case MSG.GET_SCHEDULE:
      SF.getSchedule().then(function (schedule) {
        sendResponse(schedule);
      });
      return true;

    case MSG.SET_SCHEDULE:
      SF.setSchedule(message.payload).then(function (schedule) {
        sendResponse({ ok: true, schedule: schedule });
      });
      return true;

    case MSG.GET_REQUESTED_ORDERS:
      SF.getRequestedOrders()
        .then(function (orders) {
          sendResponse({ ok: true, orders: orders });
        })
        .catch(function (err) {
          sendResponse({ ok: false, error: err.message });
        });
      return true;

    default:
      return false;
  }
});

// ------------------------------------------------------------------
// Async handlers
// ------------------------------------------------------------------

async function handleSignIn(sendResponse) {
  try {
    var user = await SF.signIn();
    startOrdersWatcher();
    sendResponse({ ok: true, user: user });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleSignOut(sendResponse) {
  try {
    SF.stopWatchingOrders();
    await SF.signOut();
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

async function handleStartRun(sendResponse) {
  sendResponse({ ok: true });
  await runManager.startRun();
}
