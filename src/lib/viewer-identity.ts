/**
 * Anonymous viewer identity for comments and view counting: a random id
 * plus a chosen display name, both kept in localStorage. No auth — the
 * id only lets a viewer edit or delete their own comments from the same
 * browser.
 */

const VIEWER_ID_KEY = "screendrop_viewer_id"
const VIEWER_NAME_KEY = "screendrop_viewer_name"

export function getViewerId(): string {
  if (typeof localStorage === "undefined") return "server"
  let id = localStorage.getItem(VIEWER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VIEWER_ID_KEY, id)
  }
  return id
}

export function getViewerName(): string {
  if (typeof localStorage === "undefined") return ""
  return localStorage.getItem(VIEWER_NAME_KEY) ?? ""
}

export function setViewerName(name: string) {
  localStorage.setItem(VIEWER_NAME_KEY, name.trim())
}

export function hasViewedShare(shareId: string): boolean {
  if (typeof localStorage === "undefined") return true
  return localStorage.getItem(`screendrop_viewed_${shareId}`) === "1"
}

export function markShareViewed(shareId: string) {
  localStorage.setItem(`screendrop_viewed_${shareId}`, "1")
}
