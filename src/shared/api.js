export const API_BASE = "https://amz-tools.shekmachine.duckdns.org";

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Server error (${res.status})`);
  }
  return res;
}
