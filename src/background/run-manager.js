import { getRawUser } from "../firebase/auth";
import { getSkippableOrderIds, saveOrderState } from "../firebase/firestore";
import {
  MSG,
  ORDER_STATUS,
  PAGE_TYPE,
  RUN_STATUS,
  TIMING,
  log,
} from "../shared/constants";
import { extractMarketplace, wait } from "../shared/utils";
import { OrderQueue } from "./order-queue";

export class RunManager {
  constructor() {
    this.queue = new OrderQueue();
    this.resetState();
  }

  resetState() {
    this.state = {
      status: RUN_STATUS.IDLE,
      discoveredCount: 0,
      queuedCount: 0,
      processedCount: 0,
      requestedCount: 0,
      alreadyRequestedCount: 0,
      tooEarlyCount: 0,
      failedCount: 0,
      currentOrderId: null,
      currentIndex: 0,
      totalInQueue: 0,
      error: null,
    };
    this.stopRequested = false;
    this.activeTabId = null;
  }

  getState() {
    return { ...this.state };
  }

  broadcastState() {
    chrome.runtime
      .sendMessage({ type: MSG.STATE_UPDATE, payload: this.getState() })
      .catch(() => {});
  }

  requestStop() {
    if (
      this.state.status === RUN_STATUS.DISCOVERING ||
      this.state.status === RUN_STATUS.PROCESSING
    ) {
      this.stopRequested = true;
      this.state.status = RUN_STATUS.STOPPED;
      this.broadcastState();
    }
  }

  async startRun() {
    const user = getRawUser();
    if (!user) {
      this.state.error = "Not signed in";
      this.broadcastState();
      return;
    }

    if (
      this.state.status === RUN_STATUS.DISCOVERING ||
      this.state.status === RUN_STATUS.PROCESSING
    ) {
      return;
    }

    this.queue.reset();
    this.resetState();
    this.stopRequested = false;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) {
      this.state.error = "No active tab found";
      this.broadcastState();
      return;
    }
    this.activeTabId = tab.id;
    this.startUrl = tab.url;

    try {
      await this.runDiscovery();
      if (this.stopRequested) {
        await this.navigateBack();
        return;
      }

      await this.runProcessing();
      await this.navigateBack();
    } catch (err) {
      this.state.error = err.message;
      this.state.status = RUN_STATUS.STOPPED;
      this.broadcastState();
      await this.navigateBack();
    }
  }

  async navigateBack() {
    if (this.activeTabId && this.startUrl) {
      try {
        await chrome.tabs.update(this.activeTabId, { url: this.startUrl });
      } catch {
        // Tab may have been closed
      }
    }
  }

  // --- Phase 1: Discovery ---

  async runDiscovery() {
    this.state.status = RUN_STATUS.DISCOVERING;
    this.broadcastState();

    let hasMorePages = true;

    while (hasMorePages && !this.stopRequested) {
      await wait(TIMING.PAGE_LOAD_WAIT_MS);

      const pageType = await this.sendToTab(MSG.DETECT_PAGE);
      if (pageType !== PAGE_TYPE.MANAGE_ORDERS) {
        this.state.error =
          "Not on Manage Orders page. Please navigate there and try again.";
        this.state.status = RUN_STATUS.STOPPED;
        this.broadcastState();
        return;
      }

      const orders = await this.sendToTab(MSG.EXTRACT_ORDERS);
      if (orders && orders.length > 0) {
        this.queue.addDiscoveredOrders(orders);
        this.state.discoveredCount = this.queue.discoveredCount;
        this.broadcastState();
      }

      const paginationResult = await this.sendToTab(MSG.GO_NEXT_PAGE);
      hasMorePages = paginationResult && paginationResult.navigated;

      if (hasMorePages) {
        await wait(TIMING.PAGINATION_WAIT_MS);
      }
    }

    if (this.stopRequested) return;

    const allIds = this.queue.getAllDiscoveredIds();
    const skippable = await getSkippableOrderIds(allIds);
    this.state.alreadyRequestedCount = skippable.size;

    this.queue.buildQueue(skippable);
    this.state.queuedCount = this.queue.queuedCount;
    this.state.totalInQueue = this.queue.queuedCount;
    this.broadcastState();
  }

  // --- Phase 2: Processing ---

  async runProcessing() {
    this.state.status = RUN_STATUS.PROCESSING;
    this.broadcastState();

    while (this.queue.hasNext() && !this.stopRequested) {
      const order = this.queue.next();
      if (!order) break;

      this.state.currentOrderId = order.orderId;
      this.state.currentIndex = this.queue.processedCount;
      this.broadcastState();

      try {
        const result = await this.processOrder(order);
        this.updateCounters(result);
      } catch (err) {
        log("Order", order.orderId, "threw:", err.message, err);
        await this.saveResult(order, ORDER_STATUS.FAILED, err.message);
        this.state.failedCount++;
      }

      this.state.processedCount = this.queue.processedCount;
      this.broadcastState();

      if (this.queue.hasNext() && !this.stopRequested) {
        await wait(TIMING.BETWEEN_ORDERS_MS);
      }
    }

    if (!this.stopRequested) {
      this.state.status = RUN_STATUS.COMPLETED;
      this.state.currentOrderId = null;
      this.broadcastState();
    }
  }

  async processOrder(order) {
    log("Processing order:", order.orderId, order.detailsUrl);

    await chrome.tabs.update(this.activeTabId, { url: order.detailsUrl });
    await wait(TIMING.PAGE_LOAD_WAIT_MS);

    const pageType = await this.sendToTabWithRetry(MSG.DETECT_PAGE, 3);
    log("Page type:", pageType);

    if (pageType !== PAGE_TYPE.ORDER_DETAILS) {
      log("Not order details page, got:", pageType);
      await this.saveResult(order, ORDER_STATUS.UNRECOGNIZED_PAGE);
      return ORDER_STATUS.UNRECOGNIZED_PAGE;
    }

    const clickResult = await this.sendToTab(MSG.CLICK_REQUEST_REVIEW);
    log("Click result:", clickResult);
    if (!clickResult || !clickResult.clicked) {
      if (clickResult && clickResult.tooEarly) {
        await this.saveResult(order, ORDER_STATUS.TOO_EARLY);
        return ORDER_STATUS.TOO_EARLY;
      }
      await this.saveResult(
        order,
        ORDER_STATUS.FAILED,
        clickResult ? clickResult.error : "Request a Review button not found",
      );
      return ORDER_STATUS.FAILED;
    }

    await wait(TIMING.AFTER_CLICK_WAIT_MS);

    const reviewResult = await this.pollForReviewResult();
    log("Review result:", reviewResult);

    switch (reviewResult) {
      case PAGE_TYPE.REVIEW_TOO_EARLY:
        await this.saveResult(order, ORDER_STATUS.TOO_EARLY);
        return ORDER_STATUS.TOO_EARLY;

      case PAGE_TYPE.REVIEW_ALREADY_REQUESTED:
        await this.saveResult(order, ORDER_STATUS.ALREADY_REQUESTED);
        return ORDER_STATUS.ALREADY_REQUESTED;

      case PAGE_TYPE.REVIEW_ELIGIBLE: {
        const errorCheck = await this.sendToTab(MSG.DETECT_REVIEW_RESULT);
        if (
          errorCheck === PAGE_TYPE.REVIEW_TOO_EARLY ||
          errorCheck === PAGE_TYPE.REVIEW_ALREADY_REQUESTED
        ) {
          const status =
            errorCheck === PAGE_TYPE.REVIEW_TOO_EARLY
              ? ORDER_STATUS.TOO_EARLY
              : ORDER_STATUS.ALREADY_REQUESTED;
          await this.saveResult(order, status);
          return status;
        }

        const confirmResult = await this.sendToTab(MSG.CLICK_CONFIRM_YES);
        if (confirmResult && confirmResult.clicked) {
          await wait(TIMING.AFTER_CLICK_WAIT_MS);
          const successResult = await this.pollForReviewResult();
          if (successResult === PAGE_TYPE.REVIEW_SUCCESS) {
            await this.saveResult(order, ORDER_STATUS.REQUESTED);
            return ORDER_STATUS.REQUESTED;
          }
          await this.saveResult(order, ORDER_STATUS.REQUESTED);
          return ORDER_STATUS.REQUESTED;
        } else {
          await this.saveResult(
            order,
            ORDER_STATUS.FAILED,
            "Could not click Yes button",
          );
          return ORDER_STATUS.FAILED;
        }
      }

      case PAGE_TYPE.REVIEW_SUCCESS:
        await this.saveResult(order, ORDER_STATUS.REQUESTED);
        return ORDER_STATUS.REQUESTED;

      default:
        await this.saveResult(order, ORDER_STATUS.UNRECOGNIZED_PAGE);
        return ORDER_STATUS.UNRECOGNIZED_PAGE;
    }
  }

  async pollForReviewResult() {
    const maxAttempts = Math.ceil(
      TIMING.MAX_REVIEW_WAIT_MS / TIMING.REVIEW_RESULT_POLL_MS,
    );

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.sendToTab(MSG.DETECT_REVIEW_RESULT);
      if (result && result !== PAGE_TYPE.UNKNOWN) {
        return result;
      }
      await wait(TIMING.REVIEW_RESULT_POLL_MS);
    }

    return PAGE_TYPE.UNKNOWN;
  }

  async saveResult(order, status, errorMessage) {
    const data = {
      orderId: order.orderId,
      status,
      detailsUrl: order.detailsUrl,
      marketplace: extractMarketplace(order.detailsUrl),
    };

    if (errorMessage) data.errorMessage = errorMessage;
    if (status === ORDER_STATUS.REQUESTED) {
      data.lastRequestedAt = new Date().toISOString();
    }

    await saveOrderState(data);
  }

  updateCounters(status) {
    switch (status) {
      case ORDER_STATUS.REQUESTED:
        this.state.requestedCount++;
        break;
      case ORDER_STATUS.ALREADY_REQUESTED:
        this.state.alreadyRequestedCount++;
        break;
      case ORDER_STATUS.TOO_EARLY:
        this.state.tooEarlyCount++;
        break;
      case ORDER_STATUS.FAILED:
      case ORDER_STATUS.UNRECOGNIZED_PAGE:
        this.state.failedCount++;
        break;
    }
  }

  // --- Content script communication ---

  async sendToTab(type, data) {
    if (!this.activeTabId) throw new Error("No active tab");
    try {
      return await chrome.tabs.sendMessage(this.activeTabId, {
        type,
        ...data,
      });
    } catch (err) {
      throw new Error("Content script communication failed: " + err.message);
    }
  }

  async sendToTabWithRetry(type, maxRetries, data) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.sendToTab(type, data);
      } catch {
        if (attempt < maxRetries - 1) {
          await wait(TIMING.PAGE_LOAD_WAIT_MS);
        }
      }
    }
    throw new Error(
      `Failed to communicate with content script after ${maxRetries} attempts`,
    );
  }

  async startScheduledRun(tabId, ordersUrl) {
    const user = getRawUser();
    if (!user) {
      this.state.error = "Not signed in";
      this.broadcastState();
      return;
    }

    if (
      this.state.status === RUN_STATUS.DISCOVERING ||
      this.state.status === RUN_STATUS.PROCESSING
    ) {
      return;
    }

    this.queue.reset();
    this.resetState();
    this.stopRequested = false;
    this.activeTabId = tabId;
    this.startUrl = ordersUrl;

    try {
      await this.runDiscovery();
      if (this.stopRequested) return;
      await this.runProcessing();
    } catch (err) {
      this.state.error = err.message;
      this.state.status = RUN_STATUS.STOPPED;
      this.broadcastState();
    }
  }
}
