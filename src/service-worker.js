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
import { MSG, log } from "./shared/constants";

// Initialize Firebase
initFirebase();

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
