/**
 * Order Extractor for SellerForge.
 *
 * Extracts order IDs and detail URLs from the Manage Orders page.
 * Order IDs follow Amazon's pattern: XXX-XXXXXXX-XXXXXXX (3-7-7 digits).
 */

(function () {
  var SF = self.SellerForge;
  var ORDER_ID_REGEX = /\d{3}-\d{7}-\d{7}/;

  /**
   * Extracts all orders visible on the current Manage Orders page.
   * @returns {Array<{orderId: string, detailsUrl: string}>}
   */
  SF.extractOrders = function () {
    var orders = [];
    var seenIds = new Set();

    var rows = document.querySelectorAll("#orders-table tbody tr");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var links = row.querySelectorAll("a");
      for (var j = 0; j < links.length; j++) {
        var link = links[j];
        var match = link.textContent.match(ORDER_ID_REGEX);
        if (match) {
          var orderId = match[0];
          if (!seenIds.has(orderId)) {
            seenIds.add(orderId);
            var detailsUrl = link.href || buildOrderDetailsUrl(orderId);
            orders.push({ orderId: orderId, detailsUrl: detailsUrl });
          }
          break;
        }
      }
    }

    return orders;
  };

  function buildOrderDetailsUrl(orderId) {
    return window.location.origin + "/orders-v3/order/" + orderId;
  }
})();
