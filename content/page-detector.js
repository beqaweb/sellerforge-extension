/**
 * Page Detector for SellerForge.
 *
 * Detects which Amazon Seller Central page the content script is running on.
 * Uses a layered strategy: URL patterns first, then text/DOM confirmation.
 *
 * NOTE: Amazon Seller Central DOM selectors are fragile and may change.
 * Text matching is the primary reliable fallback.
 */

(function () {
  var SF = self.SellerForge;
  var PAGE_TYPE = SF.PAGE_TYPE;

  /**
   * Detects the current page type.
   */
  SF.detectPageType = function () {
    var url = window.location.href;
    var bodyText = document.body ? document.body.innerText : "";

    // Check order details FIRST (more specific URL)
    if (isOrderDetailsPage(url, bodyText)) {
      return PAGE_TYPE.ORDER_DETAILS;
    }

    if (isManageOrdersPage(url, bodyText)) {
      return PAGE_TYPE.MANAGE_ORDERS;
    }

    return PAGE_TYPE.UNKNOWN;
  };

  /**
   * Detects the review state on the order details page.
   * Uses real Amazon selectors for the #ayb-app review widget.
   */
  SF.detectReviewResult = function () {
    // Check for success alert first
    var successAlert = document.querySelector(
      "#ayb-app kat-alert > span[slot=header]",
    );
    if (
      successAlert &&
      successAlert.innerText.includes("review will be requested")
    ) {
      return PAGE_TYPE.REVIEW_SUCCESS;
    }

    // Check for error messages
    var errorEl = document.querySelector(
      "#ayb-app .ayb-request-review-error-description",
    );
    if (errorEl) {
      var errorText = errorEl.innerText;
      if (errorText.includes("already requested a review")) {
        return PAGE_TYPE.REVIEW_ALREADY_REQUESTED;
      }
      if (
        errorText.includes("5-30 day range") ||
        errorText.includes("4-30 day range") ||
        errorText.includes("can't use this feature")
      ) {
        return PAGE_TYPE.REVIEW_TOO_EARLY;
      }
      // Any other error = failed
      return PAGE_TYPE.REVIEW_TOO_EARLY;
    }

    // Check for Yes button (eligible to request)
    var yesBtn = document.querySelector(
      '#ayb-app .ayb-reviews-button-container kat-button[label="Yes"]',
    );
    if (yesBtn) {
      return PAGE_TYPE.REVIEW_ELIGIBLE;
    }

    return PAGE_TYPE.UNKNOWN;
  };

  function isManageOrdersPage(url, bodyText) {
    // Exclude order detail URLs
    if (
      url.includes("/orders-v3/order/") ||
      url.includes("/order-details") ||
      /\/orders\/[0-9-]+/.test(url)
    ) {
      return false;
    }
    if (
      url.includes("/orders-v3") ||
      url.includes("/orders/") ||
      url.includes("myo/orders")
    ) {
      return true;
    }
    if (bodyText.includes("Manage Orders") && bodyText.includes("Order ID")) {
      return true;
    }
    return false;
  }

  function isOrderDetailsPage(url, bodyText) {
    if (
      url.includes("/orders-v3/order/") ||
      url.includes("/order-details") ||
      /\/orders\/[0-9-]+/.test(url)
    ) {
      return true;
    }
    var hasOrderIdPattern = /\d{3}-\d{7}-\d{7}/.test(bodyText);
    if (hasOrderIdPattern && bodyText.includes("Order details")) {
      return true;
    }
    return false;
  }
})();
