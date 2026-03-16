/**
 * In-memory order queue for the current run.
 *
 * Manages the list of discovered orders, deduplication,
 * and the processing queue.
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  function OrderQueue() {
    this.reset();
  }

  OrderQueue.prototype.reset = function () {
    this.discovered = new Map();
    this.queue = [];
    this.currentIndex = 0;
  };

  /**
   * Adds discovered orders. Deduplicates by orderId.
   * @returns {number} number of new orders added
   */
  OrderQueue.prototype.addDiscoveredOrders = function (orders) {
    var newCount = 0;
    for (var i = 0; i < orders.length; i++) {
      var order = orders[i];
      if (!this.discovered.has(order.orderId)) {
        this.discovered.set(order.orderId, order);
        newCount++;
      }
    }
    return newCount;
  };

  /**
   * Builds the processing queue by removing skippable order IDs.
   */
  OrderQueue.prototype.buildQueue = function (skippableIds) {
    this.queue = [];
    this.currentIndex = 0;

    this.discovered.forEach(
      function (order, orderId) {
        if (!skippableIds.has(orderId)) {
          this.queue.push(orderId);
        }
      }.bind(this),
    );
  };

  /**
   * Returns the next order to process, or null if done.
   */
  OrderQueue.prototype.next = function () {
    if (this.currentIndex >= this.queue.length) return null;
    var orderId = this.queue[this.currentIndex];
    this.currentIndex++;
    return this.discovered.get(orderId);
  };

  OrderQueue.prototype.hasNext = function () {
    return this.currentIndex < this.queue.length;
  };

  OrderQueue.prototype.getAllDiscoveredIds = function () {
    return Array.from(this.discovered.keys());
  };

  Object.defineProperty(OrderQueue.prototype, "discoveredCount", {
    get: function () {
      return this.discovered.size;
    },
  });

  Object.defineProperty(OrderQueue.prototype, "queuedCount", {
    get: function () {
      return this.queue.length;
    },
  });

  Object.defineProperty(OrderQueue.prototype, "processedCount", {
    get: function () {
      return this.currentIndex;
    },
  });

  SF.OrderQueue = OrderQueue;
})();
