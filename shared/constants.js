/**
 * SellerForge shared constants.
 * Loaded via manifest js array (content) or importScripts (background).
 * Attaches to self.SellerForge global namespace.
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  // --- Debug mode (set to false to silence logs) ---
  SF.DEBUG = true;

  SF.log = function () {
    if (SF.DEBUG) {
      console.log.apply(
        console,
        ["[SF]"].concat(Array.prototype.slice.call(arguments)),
      );
    }
  };

  // --- Order statuses stored in Firestore ---
  SF.ORDER_STATUS = {
    DISCOVERED: "discovered",
    PROCESSING: "processing",
    REQUESTED: "requested",
    ALREADY_REQUESTED: "already_requested",
    TOO_EARLY: "too_early",
    FAILED: "failed",
    UNRECOGNIZED_PAGE: "unrecognized_page",
  };

  // Statuses that mean "do not retry this order"
  SF.TERMINAL_STATUSES = [
    SF.ORDER_STATUS.REQUESTED,
    SF.ORDER_STATUS.ALREADY_REQUESTED,
  ];

  // --- Run states ---
  SF.RUN_STATUS = {
    IDLE: "idle",
    DISCOVERING: "discovering",
    PROCESSING: "processing",
    COMPLETED: "completed",
    STOPPED: "stopped",
  };

  // --- Page types detected by content script ---
  SF.PAGE_TYPE = {
    MANAGE_ORDERS: "manage_orders",
    ORDER_DETAILS: "order_details",
    REVIEW_TOO_EARLY: "review_too_early",
    REVIEW_ALREADY_REQUESTED: "review_already_requested",
    REVIEW_ELIGIBLE: "review_eligible",
    REVIEW_SUCCESS: "review_success",
    UNKNOWN: "unknown",
  };

  // --- Message types ---
  SF.MSG = {
    // Popup → Background
    START_RUN: "START_RUN",
    STOP_RUN: "STOP_RUN",
    GET_STATE: "GET_STATE",
    SIGN_IN: "SIGN_IN",
    SIGN_OUT: "SIGN_OUT",
    GET_AUTH_STATE: "GET_AUTH_STATE",

    // Background → Content Script
    DETECT_PAGE: "DETECT_PAGE",
    EXTRACT_ORDERS: "EXTRACT_ORDERS",
    GO_NEXT_PAGE: "GO_NEXT_PAGE",
    CLICK_REQUEST_REVIEW: "CLICK_REQUEST_REVIEW",
    DETECT_REVIEW_RESULT: "DETECT_REVIEW_RESULT",
    CLICK_CONFIRM_YES: "CLICK_CONFIRM_YES",
    EXTRACT_ORDER_ID: "EXTRACT_ORDER_ID",

    // Background → Popup
    STATE_UPDATE: "STATE_UPDATE",
    AUTH_STATE_UPDATE: "AUTH_STATE_UPDATE",

    // Schedule
    GET_SCHEDULE: "GET_SCHEDULE",
    SET_SCHEDULE: "SET_SCHEDULE",

    // Orders list
    GET_REQUESTED_ORDERS: "GET_REQUESTED_ORDERS",
    REQUESTED_ORDERS_UPDATE: "REQUESTED_ORDERS_UPDATE",
  };

  // --- Timing constants ---
  SF.TIMING = {
    PAGE_LOAD_WAIT_MS: 3000,
    AFTER_CLICK_WAIT_MS: 2000,
    BETWEEN_ORDERS_MS: 1500,
    PAGINATION_WAIT_MS: 2500,
    REVIEW_RESULT_POLL_MS: 1500,
    MAX_REVIEW_WAIT_MS: 15000,
  };
})();
