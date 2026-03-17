import { MSG, log } from "../shared/constants";
import {
  clickConfirmYes,
  clickRequestReview,
  detectPageType,
  detectReviewResult,
  extractOrderIdFromPage,
  extractOrders,
  goToNextPage,
  scrapeProductDetails,
} from "./dom";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type } = message;
  let response;

  switch (type) {
    case MSG.DETECT_PAGE:
      response = detectPageType();
      log("DETECT_PAGE →", response);
      sendResponse(response);
      break;

    case MSG.EXTRACT_ORDERS:
      response = extractOrders();
      log("EXTRACT_ORDERS →", response.length, "orders", response);
      sendResponse(response);
      break;

    case MSG.GO_NEXT_PAGE:
      response = goToNextPage();
      log("GO_NEXT_PAGE →", response);
      sendResponse(response);
      break;

    case MSG.CLICK_REQUEST_REVIEW:
      response = clickRequestReview();
      log("CLICK_REQUEST_REVIEW →", response);
      sendResponse(response);
      break;

    case MSG.DETECT_REVIEW_RESULT:
      response = detectReviewResult();
      log("DETECT_REVIEW_RESULT →", response);
      sendResponse(response);
      break;

    case MSG.CLICK_CONFIRM_YES:
      response = clickConfirmYes();
      log("CLICK_CONFIRM_YES →", response);
      sendResponse(response);
      break;

    case MSG.EXTRACT_ORDER_ID:
      response = extractOrderIdFromPage();
      log("EXTRACT_ORDER_ID →", response);
      sendResponse(response);
      break;

    case MSG.SCRAPE_PRODUCT_DETAILS:
      response = scrapeProductDetails();
      log("SCRAPE_PRODUCT_DETAILS →", response);
      sendResponse(response);
      break;

    default:
      sendResponse({ error: "Unknown message type" });
  }

  return false;
});
