/**
 * Firestore persistence layer for SellerForge.
 *
 * All data is scoped to: users/{userId}/orders/{orderId}
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  var db = null;

  /**
   * Returns the Firestore instance (idempotent init).
   */
  function getDb() {
    if (db) return db;
    SF.initFirebase();
    db = firebase.firestore();
    return db;
  }

  /**
   * Returns the Firestore collection reference for the current user's orders.
   * Throws if no user is signed in.
   */
  function ordersCollection() {
    var user = SF.getRawUser();
    if (!user) throw new Error("Not authenticated");
    return getDb().collection("users").doc(user.uid).collection("orders");
  }

  /**
   * Saves or updates an order document in Firestore.
   */
  SF.saveOrderState = async function (orderData) {
    var orderId = orderData.orderId;
    if (!orderId) throw new Error("orderId is required");

    var rest = Object.assign({}, orderData);
    delete rest.orderId;

    var docRef = ordersCollection().doc(orderId);
    var doc = await docRef.get();
    var now = new Date().toISOString();

    if (doc.exists) {
      await docRef.update(
        Object.assign(rest, {
          updatedAt: now,
          lastCheckedAt: now,
        }),
      );
    } else {
      await docRef.set(
        Object.assign({ orderId: orderId }, rest, {
          createdAt: now,
          updatedAt: now,
          lastCheckedAt: now,
        }),
      );
    }
  };

  /**
   * Fetches existing order states for a list of order IDs.
   * Returns a Map<orderId, orderDoc>.
   * Firestore `in` queries support max 30 items per call.
   */
  SF.getOrderStates = async function (orderIds) {
    if (!orderIds || orderIds.length === 0) return new Map();

    var col = ordersCollection();
    var result = new Map();
    var batchSize = 30;

    for (var i = 0; i < orderIds.length; i += batchSize) {
      var batch = orderIds.slice(i, i + batchSize);
      var snapshot = await col.where("orderId", "in", batch).get();

      snapshot.forEach(function (doc) {
        result.set(doc.id, doc.data());
      });
    }

    return result;
  };

  /**
   * Returns order IDs that should be skipped (terminal statuses).
   */
  SF.getSkippableOrderIds = async function (orderIds) {
    var states = await SF.getOrderStates(orderIds);
    var skippable = new Set();

    states.forEach(function (data, orderId) {
      if (SF.TERMINAL_STATUSES.indexOf(data.status) !== -1) {
        skippable.add(orderId);
      }
    });

    return skippable;
  };

  /**
   * Deletes all order documents for the current user.
   * Used by the "Clear History" feature.
   */
  SF.clearAllOrderStates = async function () {
    var col = ordersCollection();
    var batchSize = 100;

    var snapshot = await col.limit(batchSize).get();

    while (!snapshot.empty) {
      var batch = getDb().batch();
      snapshot.docs.forEach(function (doc) {
        batch.delete(doc.ref);
      });
      await batch.commit();
      snapshot = await col.limit(batchSize).get();
    }
  };

  /**
   * Returns orders with status "requested", ordered by lastRequestedAt descending.
   */
  SF.getRequestedOrders = async function () {
    var col = ordersCollection();
    var snapshot = await col
      .where("status", "==", "requested")
      .orderBy("lastRequestedAt", "desc")
      .limit(100)
      .get();

    var orders = [];
    snapshot.forEach(function (doc) {
      orders.push(doc.data());
    });
    return orders;
  };

  /**
   * Watches requested orders in real time.
   * Calls onChange(orders) whenever the result set changes.
   * Returns an unsubscribe function.
   */
  var activeWatcher = null;

  SF.watchRequestedOrders = function (onChange) {
    // Clean up any existing watcher
    if (activeWatcher) {
      activeWatcher();
      activeWatcher = null;
    }

    try {
      var col = ordersCollection();
      activeWatcher = col
        .where("status", "==", "requested")
        .orderBy("lastRequestedAt", "desc")
        .limit(100)
        .onSnapshot(
          function (snapshot) {
            var orders = [];
            snapshot.forEach(function (doc) {
              orders.push(doc.data());
            });
            onChange(orders);
          },
          function (err) {
            SF.log("Watcher error:", err.message);
          },
        );
    } catch (e) {
      SF.log("Failed to start watcher:", e.message);
    }

    return function () {
      if (activeWatcher) {
        activeWatcher();
        activeWatcher = null;
      }
    };
  };

  SF.stopWatchingOrders = function () {
    if (activeWatcher) {
      activeWatcher();
      activeWatcher = null;
    }
  };
})();
