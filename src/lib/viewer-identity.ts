/**
 * Anonymous viewer identity for comments and view counting: a random id
 * plus a chosen display name, both kept in localStorage. No auth — the
 * id only lets a viewer edit or delete their own comments from the same
 * browser.
 */

const VIEWER_ID_KEY = "screendrop_viewer_id";
const VIEWER_NAME_KEY = "screendrop_viewer_name";

export function getViewerId(): string {
  if (typeof localStorage === "undefined") return "server";
  let id = localStorage.getItem(VIEWER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VIEWER_ID_KEY, id);
  }
  return id;
}

export function getViewerName(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(VIEWER_NAME_KEY) ?? "";
}

export function setViewerName(name: string) {
  localStorage.setItem(VIEWER_NAME_KEY, name.trim());
}

export function hasViewedShare(shareId: string): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(`screendrop_viewed_${shareId}`) === "1";
}

export function markShareViewed(shareId: string) {
  localStorage.setItem(`screendrop_viewed_${shareId}`, "1");
}

/**
 * Count this viewer once per share (localStorage-guarded) and record the
 * analytics event server-side. Resolves true when a view was counted.
 */
export async function recordShareView(shareId: string): Promise<boolean> {
  if (hasViewedShare(shareId)) return false;
  markShareViewed(shareId);
  try {
    const response = await fetch(`/api/view/${shareId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrer: document.referrer || null }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
