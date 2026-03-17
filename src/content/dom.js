import { PAGE_TYPE } from "../shared/constants";

const ORDER_ID_REGEX = /\d{3}-\d{7}-\d{7}/;

export function detectPageType() {
  const url = window.location.href;
  const bodyText = document.body ? document.body.innerText : "";

  if (isOrderDetailsPage(url, bodyText)) {
    return PAGE_TYPE.ORDER_DETAILS;
  }

  if (isManageOrdersPage(url, bodyText)) {
    return PAGE_TYPE.MANAGE_ORDERS;
  }

  return PAGE_TYPE.UNKNOWN;
}

export function detectReviewResult() {
  const successAlert = document.querySelector(
    "#ayb-app kat-alert > span[slot=header]",
  );
  if (
    successAlert &&
    successAlert.innerText.includes("review will be requested")
  ) {
    return PAGE_TYPE.REVIEW_SUCCESS;
  }

  const errorEl = document.querySelector(
    "#ayb-app .ayb-request-review-error-description",
  );
  if (errorEl) {
    const errorText = errorEl.innerText;
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
    return PAGE_TYPE.REVIEW_TOO_EARLY;
  }

  const yesBtn = document.querySelector(
    '#ayb-app .ayb-reviews-button-container kat-button[label="Yes"]',
  );
  if (yesBtn) {
    return PAGE_TYPE.REVIEW_ELIGIBLE;
  }

  return PAGE_TYPE.UNKNOWN;
}

export function extractOrders() {
  const orders = [];
  const seenIds = new Set();

  const rows = document.querySelectorAll("#orders-table tbody tr");
  for (const row of rows) {
    const links = row.querySelectorAll("a");
    for (const link of links) {
      const match = link.textContent.match(ORDER_ID_REGEX);
      if (match) {
        const orderId = match[0];
        if (!seenIds.has(orderId)) {
          seenIds.add(orderId);
          const detailsUrl =
            link.href || `${window.location.origin}/orders-v3/order/${orderId}`;
          orders.push({ orderId, detailsUrl });
        }
        break;
      }
    }
  }

  return orders;
}

export function goToNextPage() {
  const nextButton = findNextButton();

  if (nextButton && !isDisabled(nextButton)) {
    nextButton.click();
    return { navigated: true, hasNextPage: true };
  }

  return { navigated: false, hasNextPage: false };
}

export function clickRequestReview() {
  const button = document.querySelector(
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
}

export function clickConfirmYes() {
  const button = document.querySelector(
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
}

export function extractOrderIdFromPage() {
  const bodyText = document.body ? document.body.innerText : "";
  const match = bodyText.match(ORDER_ID_REGEX);
  return match ? match[0] : null;
}

// --- Internal helpers ---

function isManageOrdersPage(url, bodyText) {
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
  const hasOrderIdPattern = /\d{3}-\d{7}-\d{7}/.test(bodyText);
  if (hasOrderIdPattern && bodyText.includes("Order details")) {
    return true;
  }
  return false;
}

function findNextButton() {
  const allButtons = document.querySelectorAll(
    'button, a[class*="pagination"], a[class*="paging"], input[type="submit"]',
  );
  for (const btn of allButtons) {
    const text = btn.textContent.trim().toLowerCase();
    if (
      text === "next" ||
      text === "next page" ||
      text === "\u203A" ||
      text === "\u00BB"
    ) {
      return btn;
    }
  }

  const ariaNext = document.querySelector(
    '[aria-label="Next"], [aria-label="Next page"]',
  );
  if (ariaNext) return ariaNext;

  const allClickable = document.querySelectorAll('a, button, [role="button"]');
  for (const el of allClickable) {
    const btnText = el.textContent.trim();
    if (btnText === "Next" || btnText === "Next \u2192") {
      return el;
    }
  }

  return null;
}

function isDisabled(element) {
  if (element.disabled) return true;
  if (element.getAttribute("aria-disabled") === "true") return true;
  if (element.classList.contains("disabled")) return true;
  const styles = window.getComputedStyle(element);
  if (styles.pointerEvents === "none" && parseFloat(styles.opacity) < 0.5)
    return true;
  return false;
}
