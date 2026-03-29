import { MSG } from "../shared/constants";

let currentHost = null;
let currentShadow = null;

export function showAsinInfoOverlay(data) {
  if (data.loading) {
    showLoading();
    return;
  }

  if (data.error) {
    showError(data.error);
    return;
  }

  showProduct(data.product, data.suppliers || []);
}

function showLoading() {
  removeOverlay();
  const { host, shadow, dlg } = createDialog(`
    <div class="loading">Loading…</div>
  `);
  wireClose(dlg);
}

function showProduct(product, suppliers) {
  // If already showing loading, reuse its host; otherwise create fresh
  if (!currentHost) {
    removeOverlay();
    createDialog("");
  }
  const shadow = currentShadow;
  const dlg = shadow.getElementById("dlg");

  dlg.innerHTML = `
    <form method="dialog">
      <button class="close-btn" title="Close">&times;</button>
    </form>
    <div class="header">
      ${product.image ? `<img class="thumb" src="${escapeAttr(product.image)}" alt="" />` : ""}
      <strong>${escapeHtml(product.title || "No title")}</strong>
    </div>
    <table>
      ${row("ASIN", product.asin)}
      ${row("UPC", product.upc)}
      ${row("EAN", product.ean)}
      ${row("MPN", product.mpn)}
    </table>
    <div class="suppliers-section" data-asin="${escapeAttr(product.asin)}">
      <div class="suppliers-header">Suppliers</div>
      <div class="supplier-add-row">
        <input type="url" class="supplier-input" placeholder="https://supplier-website.com" />
        <button type="button" class="supplier-add-btn">Add</button>
      </div>
      <div class="supplier-error" style="display:none"></div>
      <div class="supplier-list">
        ${suppliers.map((s) => supplierItem(s)).join("")}
      </div>
    </div>
  `;

  wireClose(dlg);
  wireSuppliers(shadow);

  shadow.querySelectorAll("tr[data-value]").forEach((tr) => {
    tr.addEventListener("click", () => {
      navigator.clipboard.writeText(tr.dataset.value).then(() => {
        tr.classList.add("copied");
        setTimeout(() => tr.classList.remove("copied"), 1200);
      });
    });
  });
}

function showError(message) {
  if (!currentHost) {
    removeOverlay();
    createDialog("");
  }
  const dlg = currentShadow.getElementById("dlg");

  dlg.innerHTML = `
    <form method="dialog">
      <button class="close-btn" title="Close">&times;</button>
    </form>
    <p style="color:#c62828;margin:0">Failed to load ASIN info:<br/>${escapeHtml(message)}</p>
  `;

  wireClose(dlg);
  setTimeout(removeOverlay, 5000);
}

function createDialog(content) {
  removeOverlay();
  const host = document.createElement("div");
  host.id = "sf-asin-info-host";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>${getStyles()}</style>
    <dialog id="dlg">${content}</dialog>
  `;

  document.body.appendChild(host);
  currentHost = host;
  currentShadow = shadow;

  const dlg = shadow.getElementById("dlg");
  dlg.showModal();
  return { host, shadow, dlg };
}

function wireClose(dlg) {
  dlg.addEventListener("click", (e) => {
    const rect = dlg.getBoundingClientRect();
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;
    if (clickedOutside) removeOverlay();
  });
  dlg.addEventListener("close", removeOverlay);
}

function removeOverlay() {
  if (currentHost) {
    currentHost.remove();
    currentHost = null;
    currentShadow = null;
  }
}

function row(label, value) {
  if (!value) return "";
  return `
    <tr data-value="${escapeAttr(value)}">
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(value)}</td>
    </tr>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function supplierItem(supplier) {
  let hostname;
  try {
    hostname = new URL(supplier.url).hostname;
  } catch {
    hostname = supplier.url;
  }
  const title = supplier.title || hostname;
  const iconHtml = supplier.icon
    ? `<img class="supplier-icon" src="${escapeAttr(supplier.icon)}" alt="" />`
    : `<span class="supplier-icon-placeholder">\uD83C\uDF10</span>`;
  return `
    <div class="supplier-item" data-id="${escapeAttr(supplier.id)}">
      ${iconHtml}
      <a class="supplier-link" href="${escapeAttr(supplier.url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>
      <button class="supplier-remove" title="Remove">&times;</button>
    </div>
  `;
}

function wireSuppliers(shadow) {
  const input = shadow.querySelector(".supplier-input");
  const addBtn = shadow.querySelector(".supplier-add-btn");
  const errorEl = shadow.querySelector(".supplier-error");
  const list = shadow.querySelector(".supplier-list");
  const asin = shadow.querySelector(".suppliers-section").dataset.asin;

  addBtn.addEventListener("click", async () => {
    const url = input.value.trim();
    errorEl.style.display = "none";
    errorEl.textContent = "";

    try {
      new URL(url);
    } catch {
      errorEl.textContent = "Please enter a valid URL";
      errorEl.style.display = "block";
      return;
    }

    addBtn.disabled = true;
    addBtn.textContent = "Adding\u2026";

    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.ADD_SUPPLIER,
        asin,
        url,
      });
      if (!response.ok) throw new Error(response.error);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = supplierItem(response.supplier);
      const el = wrapper.firstElementChild;
      list.prepend(el);
      wireRemoveBtn(el, list, errorEl);
      input.value = "";
    } catch (err) {
      errorEl.textContent = err.message || "Failed to add supplier";
      errorEl.style.display = "block";
    } finally {
      addBtn.disabled = false;
      addBtn.textContent = "Add";
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addBtn.click();
  });

  list.querySelectorAll(".supplier-item").forEach((el) => {
    wireRemoveBtn(el, list, errorEl);
  });
}

function wireRemoveBtn(el, list, errorEl) {
  const removeBtn = el.querySelector(".supplier-remove");
  removeBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = el.dataset.id;
    const asin = el.closest(".suppliers-section").dataset.asin;
    try {
      const response = await chrome.runtime.sendMessage({
        type: MSG.REMOVE_SUPPLIER,
        asin,
        supplierId: id,
      });
      if (!response.ok) throw new Error(response.error);
      el.remove();
    } catch (err) {
      errorEl.textContent = err.message || "Failed to remove supplier";
      errorEl.style.display = "block";
    }
  });
}

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function getStyles() {
  return `
    :host { font-family: ${FONT_FAMILY}; font-size: 14px; }
    dialog { font: inherit; border: none; border-radius: 10px; padding: 20px; max-width: 440px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.25); outline: none; }
    dialog::backdrop { background: rgba(0,0,0,0.4); }
    .close-btn { position: absolute; top: 6px; right: 10px; background: none; border: none; font-size: 1.4em; cursor: pointer; color: #666; }
    .close-btn:hover { color: #000; }
    .header { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; padding-right: 24px; line-height: 1.4; }
    .thumb { width: 80px; height: 80px; flex-shrink: 0; object-fit: contain; border-radius: 6px; border: 1px solid #e0e0e0; background: #fafafa; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.9em; text-transform: uppercase; color: #888; padding: 5px 8px; white-space: nowrap; }
    td { padding: 5px 8px; user-select: all; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; }
    tr[data-value] { cursor: pointer; }
    tr[data-value]:hover { background: #f5f5f5; }
    tr.copied td:last-child::after { content: '✓ Copied'; position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #4caf50; font-size: 0.8em; }
    .loading { text-align: center; padding: 24px; color: #666; }    .suppliers-section { margin-top: 16px; border-top: 1px solid #e0e0e0; padding-top: 12px; }
    .suppliers-header { font-weight: 600; font-size: 0.95em; margin-bottom: 8px; }
    .supplier-add-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .supplier-input { flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; font: inherit; font-size: 0.9em; }
    .supplier-input:focus { outline: none; border-color: #1976d2; }
    .supplier-add-btn { padding: 6px 14px; background: #1976d2; color: #fff; border: none; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.9em; white-space: nowrap; }
    .supplier-add-btn:hover { background: #1565c0; }
    .supplier-add-btn:disabled { background: #90caf9; cursor: not-allowed; }
    .supplier-error { color: #c62828; font-size: 0.85em; margin-bottom: 6px; }
    .supplier-list { display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto; }
    .supplier-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; }
    .supplier-item:hover { background: #f5f5f5; }
    .supplier-icon { width: 16px; height: 16px; flex-shrink: 0; object-fit: contain; }
    .supplier-icon-placeholder { width: 16px; height: 16px; flex-shrink: 0; font-size: 14px; line-height: 16px; text-align: center; }
    .supplier-link { flex: 1; color: #1976d2; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.9em; }
    .supplier-link:hover { text-decoration: underline; }
    .supplier-remove { background: none; border: none; color: #999; cursor: pointer; font-size: 1.2em; padding: 0 4px; flex-shrink: 0; }
    .supplier-remove:hover { color: #c62828; }  `;
}
