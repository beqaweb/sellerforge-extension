export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowISO() {
  return new Date().toISOString();
}

export function extractMarketplace(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("sellercentral.", "");
  } catch {
    return "unknown";
  }
}
