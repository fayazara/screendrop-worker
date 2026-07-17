export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(`${dateString.replace(" ", "T")}Z`)
  const difference = Math.floor((Date.now() - date.getTime()) / 1000)
  if (difference < 60) return "just now"
  if (difference < 3600) return `${Math.floor(difference / 60)} min ago`
  if (difference < 86400) return `${Math.floor(difference / 3600)} hours ago`
  if (difference < 2592000) {
    return `${Math.floor(difference / 86400)} days ago`
  }
  return date.toLocaleDateString()
}

/** `1:04` / `1:02:45`, for durations and timestamps. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
  }
  return `${minutes}:${String(remaining).padStart(2, "0")}`
}

export function formatViews(views: number): string {
  if (views === 1) return "1 view"
  if (views < 1000) return `${views} views`
  return `${(views / 1000).toFixed(1)}k views`
}
