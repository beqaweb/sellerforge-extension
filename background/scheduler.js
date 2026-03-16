/**
 * SellerForge Scheduler — daily automated runs via chrome.alarms.
 *
 * Stores schedule config in chrome.storage.local:
 *   { enabled: boolean, time: "HH:MM", ordersUrl: string }
 *
 * When the alarm fires, opens the orders URL in a new tab,
 * triggers a run, then closes the tab when done.
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  var ALARM_NAME = "sellerforge-daily-run";
  var STORAGE_KEY = "sellerforge-schedule";
  var LAST_RUN_KEY = "sellerforge-last-run-date";

  var DEFAULT_SCHEDULE = {
    enabled: false,
    time: "09:00",
    ordersUrl: "https://sellercentral.amazon.ca/orders-v3",
  };

  /**
   * Returns the saved schedule config (or defaults).
   */
  SF.getSchedule = function () {
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORAGE_KEY, function (result) {
        resolve(result[STORAGE_KEY] || Object.assign({}, DEFAULT_SCHEDULE));
      });
    });
  };

  /**
   * Saves schedule config and creates/clears the alarm accordingly.
   */
  SF.setSchedule = async function (schedule) {
    var obj = {};
    obj[STORAGE_KEY] = schedule;
    await chrome.storage.local.set(obj);

    if (schedule.enabled && schedule.time && schedule.ordersUrl) {
      await createAlarm(schedule.time);
    } else {
      await chrome.alarms.clear(ALARM_NAME);
    }

    return schedule;
  };

  /**
   * Restores the alarm on service worker startup (if schedule is enabled).
   * Also checks if a run is overdue and triggers it.
   */
  SF.restoreScheduleAlarm = async function (runManager) {
    var schedule = await SF.getSchedule();
    if (!schedule.enabled || !schedule.time || !schedule.ordersUrl) return;

    var existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
      await createAlarm(schedule.time);
    }

    // Check if we missed today's run (e.g. laptop was closed)
    var today = todayDateStr();
    var lastRun = await getLastRunDate();
    if (lastRun !== today) {
      // Only trigger if the scheduled time has already passed today
      var parts = schedule.time.split(":");
      var scheduledMinutes =
        parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      var now = new Date();
      var nowMinutes = now.getHours() * 60 + now.getMinutes();
      if (nowMinutes >= scheduledMinutes && runManager) {
        SF.log("Overdue scheduled run detected — triggering now");
        SF.handleScheduledRun(runManager);
      }
    }
  };

  /**
   * Handles the alarm firing. Opens a tab, runs the cycle, closes it.
   */
  SF.handleScheduledRun = async function (runManager) {
    SF.log("Scheduled run triggered");

    // Wait for Firebase auth to restore session
    var user = await SF.getCurrentUser();
    if (!user) {
      SF.log("Scheduled run skipped — not signed in");
      return;
    }

    var schedule = await SF.getSchedule();
    if (!schedule.enabled || !schedule.ordersUrl) {
      SF.log("Scheduled run skipped — schedule disabled or no URL");
      return;
    }

    // Don't start if a run is already in progress
    var state = runManager.getState();
    if (
      state.status === SF.RUN_STATUS.DISCOVERING ||
      state.status === SF.RUN_STATUS.PROCESSING
    ) {
      SF.log("Scheduled run skipped — already running");
      return;
    }

    // Don't run if already ran today
    var today = todayDateStr();
    var lastRun = await getLastRunDate();
    if (lastRun === today) {
      SF.log("Scheduled run skipped — already ran today (", today, ")");
      return;
    }

    // Mark today as run date before starting
    await setLastRunDate(today);

    try {
      // Open the orders page in a new pinned background tab
      var tab = await chrome.tabs.create({
        url: schedule.ordersUrl,
        active: false,
        pinned: true,
      });

      SF.log("Opened scheduled tab:", tab.id);

      // Start the run on that tab
      await runManager.startScheduledRun(tab.id, schedule.ordersUrl);

      // Close the tab when done
      try {
        await chrome.tabs.remove(tab.id);
        SF.log("Closed scheduled tab");
      } catch (e) {
        // Tab may have been closed manually
      }
    } catch (err) {
      SF.log("Scheduled run error:", err.message);
    }
  };

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Creates an alarm for the given time (HH:MM) — fires daily.
   */
  async function createAlarm(timeStr) {
    var parts = timeStr.split(":");
    var hour = parseInt(parts[0], 10);
    var minute = parseInt(parts[1], 10);

    var now = new Date();
    var target = new Date();
    target.setHours(hour, minute, 0, 0);

    var diffMs = target.getTime() - now.getTime();

    // If the target time already passed today, schedule for tomorrow
    // UNLESS it passed less than 5 minutes ago — then fire in 1 minute
    var delayMinutes;
    if (diffMs < 0 && diffMs > -5 * 60 * 1000) {
      // Just missed it — fire soon
      delayMinutes = 1;
    } else if (diffMs <= 0) {
      // Missed by more than 5 min — schedule tomorrow
      target.setDate(target.getDate() + 1);
      delayMinutes = (target.getTime() - now.getTime()) / 60000;
    } else {
      delayMinutes = diffMs / 60000;
    }

    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: delayMinutes,
      periodInMinutes: 24 * 60, // repeat every 24 hours
    });

    // Verify the alarm was created
    var created = await chrome.alarms.get(ALARM_NAME);
    SF.log(
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
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function getLastRunDate() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(LAST_RUN_KEY, function (result) {
        resolve(result[LAST_RUN_KEY] || null);
      });
    });
  }

  function setLastRunDate(dateStr) {
    var obj = {};
    obj[LAST_RUN_KEY] = dateStr;
    return chrome.storage.local.set(obj);
  }

  SF.SCHEDULER_ALARM_NAME = ALARM_NAME;
})();
