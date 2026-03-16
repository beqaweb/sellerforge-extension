/**
 * Run Manager — the state machine that drives the SellerForge workflow.
 *
 * Orchestrates discovery (Phase 1) and processing (Phase 2).
 * Communicates with content scripts via chrome.tabs.sendMessage
 * and persists results via the Firebase/Firestore layer.
 */

(function () {
  var SF = self.SellerForge;
  var RUN_STATUS = SF.RUN_STATUS;
  var ORDER_STATUS = SF.ORDER_STATUS;
  var MSG = SF.MSG;
  var TIMING = SF.TIMING;
  var PAGE_TYPE = SF.PAGE_TYPE;
  var wait = SF.wait;
  var extractMarketplace = SF.extractMarketplace;

  function RunManager() {
    this.queue = new SF.OrderQueue();
    this.resetState();
  }

  RunManager.prototype.resetState = function () {
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
  };

  RunManager.prototype.getState = function () {
    return Object.assign({}, this.state);
  };

  RunManager.prototype.broadcastState = function () {
    chrome.runtime
      .sendMessage({
        type: MSG.STATE_UPDATE,
        payload: this.getState(),
      })
      .catch(function () {
        // Popup may not be open
      });
  };

  RunManager.prototype.requestStop = function () {
    if (
      this.state.status === RUN_STATUS.DISCOVERING ||
      this.state.status === RUN_STATUS.PROCESSING
    ) {
      this.stopRequested = true;
      this.state.status = RUN_STATUS.STOPPED;
      this.broadcastState();
    }
  };

  /**
   * Main entry point: starts a full run (discovery + processing).
   */
  RunManager.prototype.startRun = async function () {
    var user = SF.getRawUser();
    if (!user) {
      this.state.error = "Not signed in";
      this.broadcastState();
      return;
    }

    if (
      this.state.status === RUN_STATUS.DISCOVERING ||
      this.state.status === RUN_STATUS.PROCESSING
    ) {
      return; // Already running
    }

    this.queue.reset();
    this.resetState();
    this.stopRequested = false;

    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab) {
      this.state.error = "No active tab found";
      this.broadcastState();
      return;
    }
    this.activeTabId = tab.id;
    this.startUrl = tab.url;

    try {
      // Phase 1: Discovery
      await this.runDiscovery();
      if (this.stopRequested) {
        await this.navigateBack();
        return;
      }

      // Phase 2: Processing
      await this.runProcessing();
      await this.navigateBack();
    } catch (err) {
      this.state.error = err.message;
      this.state.status = RUN_STATUS.STOPPED;
      this.broadcastState();
      await this.navigateBack();
    }
  };

  /**
   * Navigate back to the page where the run started.
   */
  RunManager.prototype.navigateBack = async function () {
    if (this.activeTabId && this.startUrl) {
      try {
        await chrome.tabs.update(this.activeTabId, { url: this.startUrl });
      } catch (e) {
        // Tab may have been closed
      }
    }
  };

  // ------------------------------------------------------------------
  // Phase 1: Discovery
  // ------------------------------------------------------------------

  RunManager.prototype.runDiscovery = async function () {
    this.state.status = RUN_STATUS.DISCOVERING;
    this.broadcastState();

    var hasMorePages = true;

    while (hasMorePages && !this.stopRequested) {
      await wait(TIMING.PAGE_LOAD_WAIT_MS);

      var pageType = await this.sendToTab(MSG.DETECT_PAGE);
      if (pageType !== PAGE_TYPE.MANAGE_ORDERS) {
        this.state.error =
          "Not on Manage Orders page. Please navigate there and try again.";
        this.state.status = RUN_STATUS.STOPPED;
        this.broadcastState();
        return;
      }

      var orders = await this.sendToTab(MSG.EXTRACT_ORDERS);
      if (orders && orders.length > 0) {
        this.queue.addDiscoveredOrders(orders);
        this.state.discoveredCount = this.queue.discoveredCount;
        this.broadcastState();
      }

      var paginationResult = await this.sendToTab(MSG.GO_NEXT_PAGE);
      hasMorePages = paginationResult && paginationResult.navigated;

      if (hasMorePages) {
        await wait(TIMING.PAGINATION_WAIT_MS);
      }
    }

    if (this.stopRequested) return;

    // Dedup against Firestore
    var allIds = this.queue.getAllDiscoveredIds();
    var skippable = await SF.getSkippableOrderIds(allIds);
    this.state.alreadyRequestedCount = skippable.size;

    this.queue.buildQueue(skippable);
    this.state.queuedCount = this.queue.queuedCount;
    this.state.totalInQueue = this.queue.queuedCount;
    this.broadcastState();
  };

  // ------------------------------------------------------------------
  // Phase 2: Processing
  // ------------------------------------------------------------------

  RunManager.prototype.runProcessing = async function () {
    this.state.status = RUN_STATUS.PROCESSING;
    this.broadcastState();

    while (this.queue.hasNext() && !this.stopRequested) {
      var order = this.queue.next();
      if (!order) break;

      this.state.currentOrderId = order.orderId;
      this.state.currentIndex = this.queue.processedCount;
      this.broadcastState();

      try {
        var result = await this.processOrder(order);
        this.updateCounters(result);
      } catch (err) {
        SF.log("Order", order.orderId, "threw:", err.message, err);
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
  };

  /**
   * Processes a single order.
   */
  RunManager.prototype.processOrder = async function (order) {
    SF.log("Processing order:", order.orderId, order.detailsUrl);

    // Navigate to order details page
    await chrome.tabs.update(this.activeTabId, { url: order.detailsUrl });
    await wait(TIMING.PAGE_LOAD_WAIT_MS);

    var pageType = await this.sendToTabWithRetry(MSG.DETECT_PAGE, 3);
    SF.log("Page type:", pageType);

    if (pageType !== PAGE_TYPE.ORDER_DETAILS) {
      SF.log("Not order details page, got:", pageType);
      await this.saveResult(order, ORDER_STATUS.UNRECOGNIZED_PAGE);
      return ORDER_STATUS.UNRECOGNIZED_PAGE;
    }

    // Click "Request a Review"
    var clickResult = await this.sendToTab(MSG.CLICK_REQUEST_REVIEW);
    SF.log("Click result:", clickResult);
    if (!clickResult || !clickResult.clicked) {
      // Button missing means too early (payment not settled, etc.)
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

    // Detect what appeared after clicking the button
    var reviewResult = await this.pollForReviewResult();
    SF.log("Review result:", reviewResult);

    switch (reviewResult) {
      case PAGE_TYPE.REVIEW_TOO_EARLY:
        await this.saveResult(order, ORDER_STATUS.TOO_EARLY);
        return ORDER_STATUS.TOO_EARLY;

      case PAGE_TYPE.REVIEW_ALREADY_REQUESTED:
        await this.saveResult(order, ORDER_STATUS.ALREADY_REQUESTED);
        return ORDER_STATUS.ALREADY_REQUESTED;

      case PAGE_TYPE.REVIEW_ELIGIBLE:
        // Check for errors before clicking Yes
        var errorCheck = await this.sendToTab(MSG.DETECT_REVIEW_RESULT);
        if (
          errorCheck === PAGE_TYPE.REVIEW_TOO_EARLY ||
          errorCheck === PAGE_TYPE.REVIEW_ALREADY_REQUESTED
        ) {
          await this.saveResult(
            order,
            errorCheck === PAGE_TYPE.REVIEW_TOO_EARLY
              ? ORDER_STATUS.TOO_EARLY
              : ORDER_STATUS.ALREADY_REQUESTED,
          );
          return errorCheck === PAGE_TYPE.REVIEW_TOO_EARLY
            ? ORDER_STATUS.TOO_EARLY
            : ORDER_STATUS.ALREADY_REQUESTED;
        }

        var confirmResult = await this.sendToTab(MSG.CLICK_CONFIRM_YES);
        if (confirmResult && confirmResult.clicked) {
          await wait(TIMING.AFTER_CLICK_WAIT_MS);
          // Poll for success alert
          var successResult = await this.pollForReviewResult();
          if (successResult === PAGE_TYPE.REVIEW_SUCCESS) {
            await this.saveResult(order, ORDER_STATUS.REQUESTED);
            return ORDER_STATUS.REQUESTED;
          }
          // Still count as requested if no alert but click succeeded
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

      case PAGE_TYPE.REVIEW_SUCCESS:
        await this.saveResult(order, ORDER_STATUS.REQUESTED);
        return ORDER_STATUS.REQUESTED;

      default:
        await this.saveResult(order, ORDER_STATUS.UNRECOGNIZED_PAGE);
        return ORDER_STATUS.UNRECOGNIZED_PAGE;
    }
  };

  /**
   * Polls for review result with timeout.
   */
  RunManager.prototype.pollForReviewResult = async function () {
    var maxAttempts = Math.ceil(
      TIMING.MAX_REVIEW_WAIT_MS / TIMING.REVIEW_RESULT_POLL_MS,
    );

    for (var i = 0; i < maxAttempts; i++) {
      var result = await this.sendToTab(MSG.DETECT_REVIEW_RESULT);
      if (result && result !== PAGE_TYPE.UNKNOWN) {
        return result;
      }
      await wait(TIMING.REVIEW_RESULT_POLL_MS);
    }

    return PAGE_TYPE.UNKNOWN;
  };

  /**
   * Persists order result to Firestore.
   */
  RunManager.prototype.saveResult = async function (
    order,
    status,
    errorMessage,
  ) {
    var data = {
      orderId: order.orderId,
      status: status,
      detailsUrl: order.detailsUrl,
      marketplace: extractMarketplace(order.detailsUrl),
    };

    if (errorMessage) {
      data.errorMessage = errorMessage;
    }

    if (status === ORDER_STATUS.REQUESTED) {
      data.lastRequestedAt = new Date().toISOString();
    }

    await SF.saveOrderState(data);
  };

  RunManager.prototype.updateCounters = function (status) {
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
  };

  // ------------------------------------------------------------------
  // Content script communication
  // ------------------------------------------------------------------

  RunManager.prototype.sendToTab = async function (type, data) {
    if (!this.activeTabId) throw new Error("No active tab");
    try {
      var response = await chrome.tabs.sendMessage(
        this.activeTabId,
        Object.assign({ type: type }, data || {}),
      );
      return response;
    } catch (err) {
      throw new Error("Content script communication failed: " + err.message);
    }
  };

  RunManager.prototype.sendToTabWithRetry = async function (
    type,
    maxRetries,
    data,
  ) {
    for (var attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.sendToTab(type, data);
      } catch (e) {
        if (attempt < maxRetries - 1) {
          await wait(TIMING.PAGE_LOAD_WAIT_MS);
        }
      }
    }
    throw new Error(
      "Failed to communicate with content script after " +
        maxRetries +
        " attempts",
    );
  };

  /**
   * Starts a run on a specific tab (used by the scheduler).
   * Unlike startRun, this does NOT navigate back — the caller closes the tab.
   */
  RunManager.prototype.startScheduledRun = async function (tabId, ordersUrl) {
    var user = SF.getRawUser();
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
  };

  SF.RunManager = RunManager;
})();
