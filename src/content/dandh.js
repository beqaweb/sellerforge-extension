import { MSG, log } from "../shared/constants";

const SAS_ICON_URL =
  "chrome-extension://kidmffepbniamfbibhfgdakkggchipjl/images/sas-logo2-32.png";

function init() {
  const resultsList = document.querySelector("#resultsList");
  if (!resultsList) return;

  const items = resultsList.querySelectorAll(".single-item-display");
  items.forEach((item) => {
    const titleEl = item.querySelector(".title");
    if (!titleEl || titleEl.querySelector(".sf-sas-icon")) return;

    const anchor = titleEl.querySelector("a");
    if (!anchor) return;

    const fullUrl = new URL(anchor.getAttribute("href"), window.location.origin)
      .href;

    const icon = document.createElement("img");
    icon.src = SAS_ICON_URL;
    icon.className = "sf-sas-icon";
    icon.title = "Look up on SellerAmp";
    icon.style.cssText =
      "width:20px;height:20px;cursor:pointer;margin-top:6px;display:block;";

    icon.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      icon.style.opacity = "0.4";

      try {
        const response = await chrome.runtime.sendMessage({
          type: MSG.PARSE_SUPPLIER,
          url: fullUrl,
        });
        const upc = response?.data?.upc;
        if (!upc) {
          log("No UPC found for", fullUrl);
          return;
        }
        chrome.runtime.sendMessage({
          type: MSG.OPEN_SELLERAMP,
          searchTerm: upc,
        });
      } catch (err) {
        log("SellerAmp lookup failed:", err.message);
      } finally {
        icon.style.opacity = "1";
      }
    });

    titleEl.appendChild(icon);
  });
}

// Run on page load and observe for dynamic content
init();

const observer = new MutationObserver(() => init());
observer.observe(document.body, { childList: true, subtree: true });
