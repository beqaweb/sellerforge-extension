let currentHost = null;
let currentShadow = null;
let currentFontFamily = null;

export function showAsinInfoOverlay(data) {
  if (data.fontFamily) currentFontFamily = data.fontFamily;

  if (data.loading) {
    showLoading();
    return;
  }

  if (data.error) {
    showError(data.error);
    return;
  }

  showProduct(data.product);
}

function showLoading() {
  removeOverlay();
  const { host, shadow, dlg } = createDialog(`
    <div class="loading">Loading…</div>
  `);
  wireClose(dlg);
}

function showProduct(product) {
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
      ${row("Domain", product.domain)}
      ${product.image ? row("Image URL", product.image) : ""}
    </table>
  `;

  wireClose(dlg);

  shadow.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(btn.dataset.value).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1200);
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
    currentFontFamily = null;
  }
}

function row(label, value) {
  if (!value) return "";
  return `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${escapeHtml(value)}</td>
      <td><button class="copy-btn" data-value="${escapeAttr(value)}">Copy</button></td>
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

function getStyles() {
  const font = currentFontFamily
    ? `font-family: ${currentFontFamily};`
    : "font: inherit;";
  return `
    :host { ${font} }
    dialog { ${font} border: none; border-radius: 10px; padding: 20px; max-width: 440px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.25); outline: none; }
    dialog::backdrop { background: rgba(0,0,0,0.4); }
    .close-btn { position: absolute; top: 6px; right: 10px; background: none; border: none; font-size: 1.4em; cursor: pointer; color: #666; }
    .close-btn:hover { color: #000; }
    .header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; padding-right: 24px; line-height: 1.4; }
    .thumb { width: 80px; height: 80px; object-fit: contain; border-radius: 6px; border: 1px solid #e0e0e0; background: #fafafa; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 0.8em; text-transform: uppercase; color: #888; padding: 5px 8px; white-space: nowrap; }
    td { padding: 5px 8px; user-select: all; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr:hover { background: #f5f5f5; }
    .copy-btn { font: inherit; font-size: 0.85em; padding: 2px 8px; cursor: pointer; }
    .loading { text-align: center; padding: 24px; color: #666; }
  `;
}
