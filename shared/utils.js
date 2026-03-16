/**
 * Shared utility functions for SellerForge.
 */

(function () {
  var SF = (self.SellerForge = self.SellerForge || {});

  /**
   * Returns a promise that resolves after `ms` milliseconds.
   */
  SF.wait = function (ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  };

  /**
   * Returns the current ISO timestamp string.
   */
  SF.nowISO = function () {
    return new Date().toISOString();
  };

  /**
   * Extracts the marketplace domain from a URL string.
   * E.g. "https://sellercentral.amazon.com/..." → "amazon.com"
   */
  SF.extractMarketplace = function (url) {
    try {
      var hostname = new URL(url).hostname;
      return hostname.replace("sellercentral.", "");
    } catch (e) {
      return "unknown";
    }
  };
})();
