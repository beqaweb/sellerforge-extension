/**
 * Pagination Handler for SellerForge.
 *
 * Navigates through pages on the Manage Orders screen.
 * Uses layered detection to find and click the "Next" button.
 */

(function () {
  var SF = self.SellerForge;

  /**
   * Checks if there is a next page and clicks it if available.
   * @returns {{ navigated: boolean, hasNextPage: boolean }}
   */
  SF.goToNextPage = function () {
    var nextButton = findNextButton();

    if (nextButton && !isDisabled(nextButton)) {
      nextButton.click();
      return { navigated: true, hasNextPage: true };
    }

    return { navigated: false, hasNextPage: false };
  };

  /**
   * Checks if a next page button exists and is enabled (without clicking).
   */
  SF.hasNextPage = function () {
    var nextButton = findNextButton();
    return nextButton !== null && !isDisabled(nextButton);
  };

  function findNextButton() {
    // Strategy 1: Common pagination button/link with "Next" text
    var allButtons = document.querySelectorAll(
      'button, a[class*="pagination"], a[class*="paging"], input[type="submit"]',
    );
    for (var i = 0; i < allButtons.length; i++) {
      var text = allButtons[i].textContent.trim().toLowerCase();
      if (
        text === "next" ||
        text === "next page" ||
        text === "\u203A" ||
        text === "\u00BB"
      ) {
        return allButtons[i];
      }
    }

    // Strategy 2: aria-label
    var ariaNext = document.querySelector(
      '[aria-label="Next"], [aria-label="Next page"]',
    );
    if (ariaNext) return ariaNext;

    // Strategy 3: Generic clickable elements
    var allClickable = document.querySelectorAll('a, button, [role="button"]');
    for (var j = 0; j < allClickable.length; j++) {
      var btnText = allClickable[j].textContent.trim();
      if (btnText === "Next" || btnText === "Next \u2192") {
        return allClickable[j];
      }
    }

    return null;
  }

  function isDisabled(element) {
    if (element.disabled) return true;
    if (element.getAttribute("aria-disabled") === "true") return true;
    if (element.classList.contains("disabled")) return true;
    var styles = window.getComputedStyle(element);
    if (styles.pointerEvents === "none" && parseFloat(styles.opacity) < 0.5)
      return true;
    return false;
  }
})();
