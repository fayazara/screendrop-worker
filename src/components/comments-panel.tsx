import { Button } from "@cloudflare/kumo/components/button"
import {
  CheckIcon,
  ClockIcon,
  PaperPlaneRightIcon,
  PencilSimpleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Comment } from "@/db/schema"
import { formatDuration, formatTimeAgo } from "@/lib/format"
import {
  getViewerId,
  getViewerName,
  setViewerName,
} from "@/lib/viewer-identity"

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <img
      src={`https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`}
      alt={name}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    />
  )
}

interface CommentsPanelProps {
  uploadId: string
  currentTime: number
  onSeek: (time: number) => void
  className?: string
  style?: React.CSSProperties
}

/**
 * The comments panel, ported from Bloom: anonymous viewer identity in
 * localStorage, timestamped comments that seek the player, and inline
 * edit/delete for the viewer's own comments.
 */
export function CommentsPanel({
  uploadId,
  currentTime,
  onSeek,
  className,
  style,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<Array<Comment>>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState("")
  const [name, setName] = useState("")
  const [attachTimestamp, setAttachTimestamp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [viewerId, setViewerId] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // localStorage only exists client-side; resolve identity after mount.
  useEffect(() => {
    setViewerId(getViewerId())
    setName(getViewerName())
  }, [])

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments/${uploadId}`)
      if (res.ok) {
        const data: { comments: Array<Comment> } = JSON.parse(await res.text())
        setComments(data.comments)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [uploadId])

  useEffect(() => {
    void fetchComments()
  }, [fetchComments])

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingId])

  // Submit a new comment
  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed || submitting) return

    // If no name set yet, show prompt
    if (!name.trim()) {
      setShowNamePrompt(true)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewerId,
          authorName: name.trim(),
          text: trimmed,
          timestamp: attachTimestamp ? currentTime : null,
        }),
      })

      if (res.ok) {
        const data: { comment: Comment } = JSON.parse(await res.text())
        setComments((prev) => [...prev, data.comment])
        setText("")
        setAttachTimestamp(false)
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false)
    }
  }

  // Submit after name is set from prompt
  const handleNameSubmit = () => {
    if (!name.trim()) return
    setViewerName(name.trim())
    setShowNamePrompt(false)
    void handleSubmit()
  }

  // Edit a comment
  const handleEdit = async (commentId: string) => {
    const trimmed = editText.trim()
    if (!trimmed) return

    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          viewerId,
          text: trimmed,
        }),
      })

      if (res.ok) {
        const data: { comment: Comment } = JSON.parse(await res.text())
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? data.comment : c)),
        )
        setEditingId(null)
        setEditText("")
      }
    } catch {
      // silently fail
    }
  }

  // Delete a comment
  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, viewerId }),
      })

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId))
      }
    } catch {
      // silently fail
    }
  }

  // Handle name change
  const handleNameChange = (newName: string) => {
    setName(newName)
    setViewerName(newName)
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white ${className ?? ""}`}
      style={style}
    >
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-neutral-500">Comments</h2>
            <span className="text-xs text-neutral-400">{comments.length}</span>
          </div>
        </div>
      </div>

      {/* Name prompt overlay */}
      {showNamePrompt && (
        <div className="shrink-0 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          <p className="mb-2 text-xs text-neutral-600">What's your name?</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
              placeholder="Your name"
              autoFocus
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleNameSubmit}
              disabled={!name.trim()}
            >
              Save
            </Button>
            <button
              onClick={() => setShowNamePrompt(false)}
              className="cursor-pointer p-1.5 text-neutral-400 transition-colors hover:text-neutral-600"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-neutral-400">
              No comments yet. Be the first!
            </p>
          </div>
        ) : (
          comments.map((item) => {
            const isOwn = item.viewerId === viewerId
            const isEditing = editingId === item.id

            return (
              <div key={item.id} className="group flex gap-3">
                <Avatar name={item.authorName} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-900">
                      {item.authorName}
                    </span>
                    <span className="text-xs text-neutral-400">
                      &middot; {formatTimeAgo(item.createdAt)}
                    </span>
                    {item.timestamp !== null && (
                      <button
                        onClick={() => onSeek(item.timestamp!)}
                        className="inline-flex cursor-pointer items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700 transition-colors hover:bg-neutral-200"
                      >
                        <ClockIcon size={10} />
                        {formatDuration(item.timestamp)}
                      </button>
                    )}
                    {/* Edit / Delete actions (own comments only) */}
                    {isOwn && !isEditing && (
                      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingId(item.id)
                            setEditText(item.text)
                          }}
                          className="cursor-pointer p-1 text-neutral-400 transition-colors hover:text-neutral-600"
                          title="Edit"
                        >
                          <PencilSimpleIcon size={12} />
                        </button>
                        <button
                          onClick={() => void handleDelete(item.id)}
                          className="cursor-pointer p-1 text-neutral-400 transition-colors hover:text-red-500"
                          title="Delete"
                        >
                          <TrashIcon size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        ref={editInputRef}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleEdit(item.id)
                          if (e.key === "Escape") {
                            setEditingId(null)
                            setEditText("")
                          }
                        }}
                        className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm transition-colors focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none"
                      />
                      <button
                        onClick={() => void handleEdit(item.id)}
                        className="cursor-pointer p-1 text-green-600 transition-colors hover:text-green-700"
                        title="Save"
                      >
                        <CheckIcon size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null)
                          setEditText("")
                        }}
                        className="cursor-pointer p-1 text-neutral-400 transition-colors hover:text-neutral-600"
                        title="Cancel"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {item.text}
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Comment input */}
      <div className="shrink-0 border-t border-neutral-200 px-4 py-3">
        {/* Name display / edit row */}
        {name && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-neutral-400">Commenting as</span>
            <input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="border-b border-transparent bg-transparent px-0 py-0 text-xs font-medium text-neutral-700 transition-colors hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
              style={{ width: `${Math.max(name.length, 4)}ch` }}
            />
          </div>
        )}

        <div className="flex items-center gap-3">
          <Avatar name={name || viewerId || "anonymous"} size={32} />
          <div className="flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && !e.shiftKey && void handleSubmit()
                }
                placeholder="Add a comment..."
                disabled={submitting}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 pr-10 text-sm transition-colors placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-900/10 focus:outline-none disabled:opacity-50"
              />
              {/* Timestamp toggle inside input */}
              <button
                onClick={() => setAttachTimestamp((v) => !v)}
                title={
                  attachTimestamp
                    ? `Timestamp at ${formatDuration(currentTime)} (click to remove)`
                    : "Attach current timestamp"
                }
                className={`absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 transition-colors ${
                  attachTimestamp
                    ? "bg-neutral-200 text-neutral-900"
                    : "text-neutral-400 hover:text-neutral-600"
                }`}
              >
                <ClockIcon size={14} />
              </button>
            </div>
            {attachTimestamp && (
              <span className="font-mono text-xs whitespace-nowrap text-neutral-700">
                @{formatDuration(currentTime)}
              </span>
            )}
            <button
              onClick={() => void handleSubmit()}
              disabled={!text.trim() || submitting}
              className="cursor-pointer rounded-lg p-2 text-neutral-900 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              title="Send"
            >
              <PaperPlaneRightIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
