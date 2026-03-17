import { getCurrentUser } from "../firebase/auth";
import { log, RUN_STATUS } from "../shared/constants";

export const SCHEDULER_ALARM_NAME = "sellerforge-daily-run";
const STORAGE_KEY = "sellerforge-schedule";
const LAST_RUN_KEY = "sellerforge-last-run-date";

const DEFAULT_SCHEDULE = {
  enabled: false,
  time: "09:00",
  ordersUrl: "https://sellercentral.amazon.ca/orders-v3",
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

  const today = todayDateStr();
  const lastRun = await getLastRunDate();
  if (lastRun !== today) {
    const [h, m] = schedule.time.split(":").map(Number);
    const scheduledMinutes = h * 60 + m;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes >= scheduledMinutes && runManager) {
      log("Overdue scheduled run detected — triggering now");
      handleScheduledRun(runManager);
    }
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

  const today = todayDateStr();
  const lastRun = await getLastRunDate();
  if (lastRun === today) {
    log("Scheduled run skipped — already ran today (", today, ")");
    return;
  }

  await setLastRunDate(today);

  try {
    const tab = await chrome.tabs.create({
      url: schedule.ordersUrl,
      active: false,
      pinned: true,
    });

    log("Opened scheduled tab:", tab.id);

    await runManager.startScheduledRun(tab.id, schedule.ordersUrl);

    try {
      await chrome.tabs.remove(tab.id);
      log("Closed scheduled tab");
    } catch {
      // Tab may have been closed manually
    }
  } catch (err) {
    log("Scheduled run error:", err.message);
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
