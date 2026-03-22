import { getCurrentUser } from "../firebase/auth";
import { DEFAULT_ORDERS_URL, log, RUN_STATUS } from "../shared/constants";

export const SCHEDULER_ALARM_NAME = "sellerforge-daily-run";
const STORAGE_KEY = "sellerforge-schedule";
const LAST_RUN_KEY = "sellerforge-last-run-date";

const DEFAULT_SCHEDULE = {
  enabled: false,
  time: "09:00",
  ordersUrl: DEFAULT_ORDERS_URL,
};

export function getSchedule() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve(result[STORAGE_KEY] || { ...DEFAULT_SCHEDULE });
    });
  });
}

export async function setSchedule(schedule) {
  await chrome.storage.local.set({ [STORAGE_KEY]: schedule });

  if (schedule.enabled && schedule.time && schedule.ordersUrl) {
    await createAlarm(schedule.time);
  } else {
    await chrome.alarms.clear(SCHEDULER_ALARM_NAME);
  }

  return schedule;
}

export async function restoreScheduleAlarm(runManager) {
  const schedule = await getSchedule();
  if (!schedule.enabled || !schedule.time || !schedule.ordersUrl) return;

  const existing = await chrome.alarms.get(SCHEDULER_ALARM_NAME);
  if (!existing) {
    await createAlarm(schedule.time);
  }

  const lastRun = await getLastRunDate();
  const now = new Date();
  const [h, m] = schedule.time.split(":").map(Number);
  const scheduled = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    h,
    m,
    0,
    0,
  );

  let shouldRun = false;
  if (!lastRun) {
    // Never run before
    shouldRun = now >= scheduled;
  } else {
    const lastRunDate = new Date(lastRun);
    // If last run was before today or before scheduled time today, and now is after scheduled time
    if (
      (lastRunDate < scheduled && now >= scheduled) ||
      lastRunDate.getFullYear() !== now.getFullYear() ||
      lastRunDate.getMonth() !== now.getMonth() ||
      lastRunDate.getDate() !== now.getDate()
    ) {
      shouldRun = now >= scheduled;
    }
  }
  if (shouldRun && runManager) {
    log("Overdue scheduled run detected — waiting for user to be active");
    waitForUserActive(() => {
      log("User is active — triggering overdue run");
      handleScheduledRun(runManager);
    });
  }
}

export async function handleScheduledRun(runManager) {
  log("Scheduled run triggered");

  const user = await getCurrentUser();
  if (!user) {
    log("Scheduled run skipped — not signed in");
    return;
  }

  const schedule = await getSchedule();
  if (!schedule.enabled || !schedule.ordersUrl) {
    log("Scheduled run skipped — schedule disabled or no URL");
    return;
  }

  const state = runManager.getState();
  if (
    state.status === RUN_STATUS.DISCOVERING ||
    state.status === RUN_STATUS.PROCESSING
  ) {
    log("Scheduled run skipped — already running");
    return;
  }

  // Check if already ran today (using local date)
  const lastRun = await getLastRunDate();
  if (lastRun) {
    const lastRunDate = new Date(lastRun);
    const now = new Date();
    if (
      lastRunDate.getFullYear() === now.getFullYear() &&
      lastRunDate.getMonth() === now.getMonth() &&
      lastRunDate.getDate() === now.getDate()
    ) {
      log(
        "Scheduled run skipped — already ran today (",
        now.toDateString(),
        ")",
      );
      return;
    }
  }

  try {
    const tab = await chrome.tabs.create({
      url: schedule.ordersUrl,
      active: false,
      pinned: true,
    });

    log("Opened scheduled tab:", tab.id);

    await runManager.startScheduledRun(tab.id, schedule.ordersUrl);

    // Only record last run date if the run actually completed (not stopped/failed)
    const finalState = runManager.getState();
    if (finalState.status === RUN_STATUS.COMPLETED) {
      await setLastRunDate(new Date().toISOString());
      log("Scheduled run completed successfully");
    } else {
      log(
        "Scheduled run ended with status:",
        finalState.status,
        "— not recording as last run",
      );
      await clearLastRunDate();
    }

    try {
      await chrome.tabs.remove(tab.id);
      log("Closed scheduled tab");
    } catch {
      // Tab may have been closed manually
    }
  } catch (err) {
    log("Scheduled run error:", err.message);
    await clearLastRunDate();
  }
}

// --- Internal helpers ---

async function createAlarm(timeStr) {
  const [hour, minute] = timeStr.split(":").map(Number);

  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  let diffMs = target.getTime() - now.getTime();

  let delayMinutes;
  if (diffMs < 0 && diffMs > -5 * 60 * 1000) {
    delayMinutes = 1;
  } else if (diffMs <= 0) {
    target.setDate(target.getDate() + 1);
    delayMinutes = (target.getTime() - now.getTime()) / 60000;
  } else {
    delayMinutes = diffMs / 60000;
  }

  await chrome.alarms.create(SCHEDULER_ALARM_NAME, {
    delayInMinutes: delayMinutes,
    periodInMinutes: 24 * 60,
  });

  const created = await chrome.alarms.get(SCHEDULER_ALARM_NAME);
  log(
    "Alarm set for",
    timeStr,
    "— delay:",
    Math.round(delayMinutes),
    "min",
    "— fires at:",
    created
      ? new Date(created.scheduledTime).toLocaleTimeString()
      : "NOT FOUND",
  );
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLastRunDate() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LAST_RUN_KEY, (result) => {
      resolve(result[LAST_RUN_KEY] || null);
    });
  });
}

function setLastRunDate(dateStr) {
  return chrome.storage.local.set({ [LAST_RUN_KEY]: dateStr });
}

function clearLastRunDate() {
  return chrome.storage.local.remove(LAST_RUN_KEY);
}

function waitForUserActive(callback) {
  chrome.idle.queryState(60, (state) => {
    if (state === "active") {
      callback();
    } else {
      const listener = (newState) => {
        if (newState === "active") {
          chrome.idle.onStateChanged.removeListener(listener);
          callback();
        }
      };
      chrome.idle.onStateChanged.addListener(listener);
    }
  });
}
