/**
 * Review Requester for SellerForge.
 *
 * Handles clicking the "Request a Review" button and the "Yes" confirmation
 * on the Amazon order details page.
 */

(function () {
  var SF = self.SellerForge;

  /**
   * Finds and clicks the "Request a Review" link on the Order Details page.
   * If the button is missing, the order is too early to request.
   * @returns {{ clicked: boolean, tooEarly?: boolean, error?: string }}
   */
  SF.clickRequestReview = function () {
    var button = document.querySelector(
      "[data-test-id=plugin-button-requestAReview] a",
    );

    if (!button) {
      return {
        clicked: false,
        tooEarly: true,
        error: "Request a Review button not found — likely too early",
      };
    }

    try {
      button.click();
      return { clicked: true };
    } catch (err) {
      return { clicked: false, error: "Click failed: " + err.message };
    }
  };

  /**
   * Finds and clicks the "Yes" confirmation button inside the review widget.
   * @returns {{ clicked: boolean, error?: string }}
   */
  SF.clickConfirmYes = function () {
    var button = document.querySelector(
      '#ayb-app .ayb-reviews-button-container kat-button[label="Yes"]',
    );

    if (!button) {
      return { clicked: false, error: "Yes button not found" };
    }

    try {
      button.click();
      return { clicked: true };
    } catch (err) {
      return { clicked: false, error: "Click failed: " + err.message };
    }
  };

  /**
   * Extracts the order ID from the current Order Details page.
   * @returns {string|null}
   */
  SF.extractOrderIdFromPage = function () {
    var bodyText = document.body ? document.body.innerText : "";
    var match = bodyText.match(/\d{3}-\d{7}-\d{7}/);
    return match ? match[0] : null;
  };
})();
