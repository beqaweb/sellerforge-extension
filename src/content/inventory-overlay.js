import { MSG, log } from "../shared/constants";
import { formatPrice } from "../shared/utils";
import { scrapeProductDetails } from "./dom";
import {
  COLORS,
  productTableCSS,
  supplierCSS,
  supplierListCSS,
} from "./styles";

const HEADER_CELL_SEL =
  '[class*="__table-"] [class*="__tableHeaderRow-"] > div';
const LISTING_ROW_SEL = '[class*="__table-"] [data-sku]';
const LISTING_CELL_SEL = '[class*="__tableContentRow-"] > div';

const PROCESSED_ATTR = "data-sf-suppliers";
const STYLE_ID = "sf-inventory-overlay-styles";

let observer = null;
let bodyObserver = null;
let currentTable = null;

export function initInventoryOverlay() {
  if (!isManageInventoryPage()) return;
  log("Inventory overlay: initializing");
  injectStyles();
  waitForTable();
  watchForChanges();
}

export function destroyInventoryOverlay() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
  currentTable = null;
}

function isManageInventoryPage() {
  const url = window.location.href;
  return (
    url.includes("sellercentral") &&
    (url.includes("/inventory") || url.includes("/myinventory"))
  );
}

function findColumnIndex(text) {
  const headerCells = document.querySelectorAll(HEADER_CELL_SEL);
  const lower = text.toLowerCase();
  for (let i = 0; i < headerCells.length; i++) {
    if (headerCells[i].innerText.trim().toLowerCase().includes(lower)) {
      return i;
    }
  }
  return -1;
}

function processTable() {
  const detailsColIndex = findColumnIndex("product details");
  const priceColIndex = findColumnIndex("price and shipping cost");
  if (detailsColIndex === -1) {
    log("Inventory overlay: Product details column not found");
    return;
  }

  log(
    "Inventory overlay: Product details col",
    detailsColIndex,
    "Price col",
    priceColIndex,
  );

  const rows = document.querySelectorAll(LISTING_ROW_SEL);
  rows.forEach((row) => {
    if (row.hasAttribute(PROCESSED_ATTR)) return;
    row.setAttribute(PROCESSED_ATTR, "true");

    const cells = row.querySelectorAll(LISTING_CELL_SEL);
    const detailsCell = cells[detailsColIndex];
    if (!detailsCell) return;

    const priceCell = priceColIndex !== -1 ? cells[priceColIndex] : null;

    const details = scrapeProductDetails("", row);
    const asin = details?.asin;
    if (!asin) return;

    loadProductAndSuppliers(detailsCell, priceCell, asin);
  });
}

async function loadProductAndSuppliers(detailsCell, priceCell, asin) {
  log("Inventory overlay: loading data for ASIN", asin);

  try {
    const res = await chrome.runtime.sendMessage({
      type: MSG.GET_ASIN_DATA,
      asin,
    });
    if (!res?.ok) throw new Error(res?.error || "Failed to fetch ASIN data");

    // Render product info table (UPC, EAN, MPN) into __textFieldsContainer- inside details cell
    if (res.product) {
      const p = res.product;
      const rows = [
        ["UPC", p.upc],
        ["EAN", p.ean],
        ["MPN", p.mpn],
      ].filter(([, v]) => v);

      if (rows.length) {
        const target =
          detailsCell.querySelector('[class*="__textFieldsContainer-"]') ||
          detailsCell;
        const table = document.createElement("table");
        table.className = "sf-product-table";
        for (const [label, value] of rows) {
          const tr = document.createElement("tr");
          tr.dataset.value = value;
          tr.addEventListener("click", () => {
            navigator.clipboard.writeText(value).then(() => {
              tr.classList.add("sf-copied");
              setTimeout(() => tr.classList.remove("sf-copied"), 1200);
            });
          });
          const th = document.createElement("th");
          th.textContent = label;
          const td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(th);
          tr.appendChild(td);
          table.appendChild(tr);
        }
        target.appendChild(table);
      }
    }

    // Render suppliers into price column cell
    if (res.suppliers?.length && priceCell) {
      const suppliersDiv = document.createElement("div");
      suppliersDiv.className = "sf-supplier-list";
      for (const supplier of res.suppliers) {
        const el = renderSupplierItem(supplier);
        suppliersDiv.appendChild(el);
        fetchSupplierData(el, supplier.url);
      }
      priceCell.appendChild(suppliersDiv);
    }
  } catch (err) {
    log("Inventory overlay: failed to load data for", asin, err.message);
  }
}

function renderSupplierItem(supplier) {
  let hostname;
  try {
    hostname = new URL(supplier.url).hostname;
  } catch {
    hostname = supplier.url;
  }
  const title = supplier.title || hostname;

  const el = document.createElement("div");
  el.className = "sf-supplier-item";
  el.dataset.url = supplier.url;

  const link = document.createElement("a");
  link.className = "sf-supplier-row";
  link.href = supplier.url;
  link.target = "_blank";
  link.rel = "noopener";

  if (supplier.icon) {
    const icon = document.createElement("img");
    icon.className = "sf-supplier-icon";
    icon.src = supplier.icon;
    icon.alt = "";
    link.appendChild(icon);
  }

  const nameSpan = document.createElement("span");
  nameSpan.className = "sf-supplier-link";
  nameSpan.textContent = title;
  link.appendChild(nameSpan);

  el.appendChild(link);
  return el;
}

async function fetchSupplierData(el, url) {
  if (!url) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: MSG.PARSE_SUPPLIER,
      url,
    });
    if (!response?.ok || !response.data) return;
    const d = response.data;

    if (!d.price && !(d.stock || []).length) return;

    const info = document.createElement("div");
    info.className = "sf-supplier-parsed";

    if (d.price) {
      const priceEl = document.createElement("span");
      priceEl.className = "sf-sp-price";
      priceEl.title = "Click to copy";
      priceEl.textContent = `$${formatPrice(d.price)}`;
      priceEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard
          .writeText(priceEl.textContent.replace(/[^0-9.]/g, ""))
          .then(() => {
            priceEl.classList.add("sf-copied");
            setTimeout(() => priceEl.classList.remove("sf-copied"), 1200);
          });
      });
      info.appendChild(priceEl);
    }

    if (d.stock && d.stock.length) {
      const stockDiv = document.createElement("div");
      stockDiv.className = "sf-sp-stock";
      for (const s of d.stock) {
        const stockSpan = document.createElement("span");
        const inStock = parseInt(s.stock, 10) > 0;
        stockSpan.className = `sf-sp-stock-item ${inStock ? "sf-in-stock" : "sf-no-stock"}`;

        const locText = document.createTextNode(`${s.location}: `);
        stockSpan.appendChild(locText);

        const strong = document.createElement("strong");
        strong.textContent = s.stock;
        stockSpan.appendChild(strong);

        if (s.shipping_eta) {
          const eta = document.createTextNode(` (${s.shipping_eta})`);
          stockSpan.appendChild(eta);
        }

        stockDiv.appendChild(stockSpan);
      }
      info.appendChild(stockDiv);
    }

    el.appendChild(info);
  } catch {
    // silently ignore
  }
}

function waitForTable() {
  const table = document.querySelector('[class*="__table-"]');
  if (table && findColumnIndex("product details") !== -1) {
    processTable();
    observeTableChanges(table);
    return;
  }

  // Table or headers not ready yet — watch for them to appear
  const bodyObserver = new MutationObserver(() => {
    const t = document.querySelector('[class*="__table-"]');
    if (t && findColumnIndex("product details") !== -1) {
      bodyObserver.disconnect();
      processTable();
      observeTableChanges(t);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function observeTableChanges(table) {
  if (!table || table === currentTable) return;
  currentTable = table;

  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    processTable();
  });

  observer.observe(table, { childList: true, subtree: true });
}

function watchForChanges() {
  if (bodyObserver) return;

  // Watch the body for table replacements (search/filter redraws the table
  // element entirely) and SPA navigations that change the URL.
  bodyObserver = new MutationObserver(() => {
    const table = document.querySelector('[class*="__table-"]');
    if (
      table &&
      table !== currentTable &&
      findColumnIndex("product details") !== -1
    ) {
      log("Inventory overlay: table replaced, re-attaching");
      processTable();
      observeTableChanges(table);
    }
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const c = COLORS;
  style.textContent = `
    .sf-supplier-overlay {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
      font-size: 12px;
    }
    ${productTableCSS("sf-")}
    ${supplierListCSS("sf-")}
    ${supplierCSS("sf-")}
    .sf-supplier-item { border: 1px solid ${c.borderLight}; background: #f8f8f8; }
    .sf-supplier-item:hover { background: #f0f0f0; }
  `;
  document.head.appendChild(style);
}
