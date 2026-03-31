import { MSG, log } from "../shared/constants";
import { COLORS } from "./styles";

const SAS_ICON_URL =
  "chrome-extension://kidmffepbniamfbibhfgdakkggchipjl/images/sas-logo2-32.png";

const STYLE_ID = "sf-dandh-styles";

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const c = COLORS;
  style.textContent = `
    .sf-sas-wrapper { display: flex; align-items: center; gap: 4px; margin-top: 6px; }
    .sf-sas-icon { width: 20px; height: 20px; cursor: pointer; display: block; }
    .sf-sas-upc { font-size: 12px; color: ${c.muted}; display: none; }
    .sf-sas-upc.sf-sas-upc-visible { display: inline; }
  `;
  document.head.appendChild(style);
}

function init() {
  injectStyles();
  const resultsList = document.querySelector("#resultsList");
  if (!resultsList) return;

  const items = resultsList.querySelectorAll(".single-item-display");
  items.forEach((item) => {
    const titleEl = item.querySelector(".title");
    if (!titleEl || titleEl.querySelector(".sf-sas-wrapper")) return;

    const anchor = titleEl.querySelector("a");
    if (!anchor) return;

    const fullUrl = new URL(anchor.getAttribute("href"), window.location.origin)
      .href;

    const wrapper = document.createElement("div");
    wrapper.className = "sf-sas-wrapper";

    const icon = document.createElement("img");
    icon.src = SAS_ICON_URL;
    icon.className = "sf-sas-icon";
    icon.title = "Look up on SellerAmp";

    const upcLabel = document.createElement("span");
    upcLabel.className = "sf-sas-upc";

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
        const price = response?.data?.price;
        if (!upc) {
          log("No UPC found for", fullUrl);
          return;
        }
        upcLabel.textContent = `UPC: ${upc}`;
        upcLabel.classList.add("sf-sas-upc-visible");
        chrome.runtime.sendMessage({
          type: MSG.OPEN_SELLERAMP,
          searchTerm: upc,
          sasCostPrice: price,
        });
      } catch (err) {
        log("SellerAmp lookup failed:", err.message);
      } finally {
        icon.style.opacity = "1";
      }
    });

    wrapper.appendChild(icon);
    wrapper.appendChild(upcLabel);
    titleEl.appendChild(wrapper);
  });
}

// Run on page load and observe for dynamic content
init();

const observer = new MutationObserver(() => init());
observer.observe(document.body, { childList: true, subtree: true });
