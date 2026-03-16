/**
 * SellerForge Content Script — entry point.
 *
 * Injected into Amazon Seller Central pages.
 * Listens for messages from the background service worker,
 * delegates to the appropriate handler, and responds.
 *
 * Must be loaded AFTER constants, page-detector, order-extractor,
 * pagination-handler, and review-requester (all attach to self.SellerForge).
 */

(function () {
  var SF = self.SellerForge;
  var MSG = SF.MSG;

  chrome.runtime.onMessage.addListener(
    function (message, sender, sendResponse) {
      var type = message.type;
      var response;

      switch (type) {
        case MSG.DETECT_PAGE:
          response = SF.detectPageType();
          SF.log("DETECT_PAGE →", response);
          sendResponse(response);
          break;

        case MSG.EXTRACT_ORDERS:
          response = SF.extractOrders();
          SF.log("EXTRACT_ORDERS →", response.length, "orders", response);
          sendResponse(response);
          break;

        case MSG.GO_NEXT_PAGE:
          response = SF.goToNextPage();
          SF.log("GO_NEXT_PAGE →", response);
          sendResponse(response);
          break;

        case MSG.CLICK_REQUEST_REVIEW:
          response = SF.clickRequestReview();
          SF.log("CLICK_REQUEST_REVIEW →", response);
          sendResponse(response);
          break;

        case MSG.DETECT_REVIEW_RESULT:
          response = SF.detectReviewResult();
          SF.log("DETECT_REVIEW_RESULT →", response);
          sendResponse(response);
          break;

        case MSG.CLICK_CONFIRM_YES:
          response = SF.clickConfirmYes();
          SF.log("CLICK_CONFIRM_YES →", response);
          sendResponse(response);
          break;

        case MSG.EXTRACT_ORDER_ID:
          response = SF.extractOrderIdFromPage();
          SF.log("EXTRACT_ORDER_ID →", response);
          sendResponse(response);
          break;

        default:
          sendResponse({ error: "Unknown message type" });
      }

      return false; // synchronous response
    },
  );
})();
