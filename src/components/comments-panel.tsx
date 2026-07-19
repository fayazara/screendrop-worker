import { Button } from "@cloudflare/kumo/components/button";
import {
  CheckIcon,
  ClockIcon,
  GithubLogoIcon,
  GoogleLogoIcon,
  PaperPlaneRightIcon,
  PencilSimpleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type SVGProps } from "react";
import type { Comment } from "@/db/schema";
import type { AuthProvider, AuthState } from "@/lib/use-auth";
import { formatDuration, formatTimeAgo } from "@/lib/format";
import {
  getViewerId,
  getViewerName,
  setViewerName,
} from "@/lib/viewer-identity";

function Avatar({
  name,
  src,
  size = 32,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  return (
    <img
      src={
        src ||
        `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`
      }
      alt={name}
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    />
  );
}

export function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="size-5"
      viewBox="0 0 24 24"
      {...props}
    >
      {/* Icon from Material Design Icons by Pictogrammers - https://github.com/Templarian/MaterialDesign/blob/master/LICENSE */}
      <path
        fill="currentColor"
        d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
      />
    </svg>
  );
}

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      {...props}
    >
      {/* Icon from Material Icon Theme by Material Extensions - https://github.com/material-extensions/vscode-material-icon-theme/blob/main/LICENSE */}
      <g fill="none" fillRule="evenodd" clipRule="evenodd">
        <path
          fill="#f44336"
          d="M7.209 1.061c.725-.081 1.154-.081 1.933 0a6.57 6.57 0 0 1 3.65 1.82a100 100 0 0 0-1.986 1.93q-1.876-1.59-4.188-.734q-1.696.78-2.362 2.528a78 78 0 0 1-2.148-1.658a.26.26 0 0 0-.16-.027q1.683-3.245 5.26-3.86"
          opacity=".987"
        />
        <path
          fill="#ffc107"
          d="M1.946 4.92q.085-.013.161.027a78 78 0 0 0 2.148 1.658A7.6 7.6 0 0 0 4.04 7.99q.037.678.215 1.331L2 11.116Q.527 8.038 1.946 4.92"
          opacity=".997"
        />
        <path
          fill="#448aff"
          d="M12.685 13.29a26 26 0 0 0-2.202-1.74q1.15-.812 1.396-2.228H8.122V6.713q3.25-.027 6.497.055q.616 3.345-1.423 6.032a7 7 0 0 1-.51.49"
          opacity=".999"
        />
        <path
          fill="#43a047"
          d="M4.255 9.322q1.23 3.057 4.51 2.854a3.94 3.94 0 0 0 1.718-.626q1.148.812 2.202 1.74a6.62 6.62 0 0 1-4.027 1.684a6.4 6.4 0 0 1-1.02 0Q3.82 14.524 2 11.116z"
          opacity=".993"
        />
      </g>
    </svg>
  );
}

const PROVIDER_LABELS: Record<
  AuthProvider,
  { label: string; icon: typeof GithubIcon }
> = {
  github: { label: "GitHub", icon: GithubIcon },
  google: { label: "Google", icon: GoogleIcon },
};

interface CommentsPanelProps {
  uploadId: string;
  currentTime: number;
  onSeek: (time: number) => void;
  /** Shared auth state from useAuth; null while it loads. */
  auth: AuthState | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The comments panel, ported from Bloom: timestamped comments that seek
 * the player and inline edit/delete for the viewer's own comments.
 * Identity is either the OAuth session (when the deployment configures
 * it) or an anonymous localStorage viewer id.
 */
export function CommentsPanel({
  uploadId,
  currentTime,
  onSeek,
  auth,
  className,
  style,
}: CommentsPanelProps) {
  const [comments, setComments] = useState<Array<Comment>>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [attachTimestamp, setAttachTimestamp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [viewerId, setViewerId] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // localStorage only exists client-side; resolve identity after mount.
  useEffect(() => {
    setViewerId(getViewerId());
    setName(getViewerName());
  }, []);

  const authEnabled = auth?.authEnabled ?? false;
  const user = auth?.user ?? null;

  // Fetch comments
  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments/${uploadId}`);
      if (res.ok) {
        const data: { comments: Array<Comment> } = JSON.parse(await res.text());
        setComments(data.comments);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [uploadId]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  // Submit a new comment
  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    // Anonymous mode needs a display name; signed-in identity comes
    // from the session cookie server-side.
    if (!authEnabled && !name.trim()) {
      setShowNamePrompt(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          timestamp: attachTimestamp ? currentTime : null,
          ...(authEnabled ? {} : { viewerId, authorName: name.trim() }),
        }),
      });

      if (res.ok) {
        const data: { comment: Comment } = JSON.parse(await res.text());
        setComments((prev) => [...prev, data.comment]);
        setText("");
        setAttachTimestamp(false);
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  // Submit after name is set from prompt
  const handleNameSubmit = () => {
    if (!name.trim()) return;
    setViewerName(name.trim());
    setShowNamePrompt(false);
    void handleSubmit();
  };

  // Edit a comment
  const handleEdit = async (commentId: string) => {
    const trimmed = editText.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId,
          viewerId,
          text: trimmed,
        }),
      });

      if (res.ok) {
        const data: { comment: Comment } = JSON.parse(await res.text());
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? data.comment : c)),
        );
        setEditingId(null);
        setEditText("");
      }
    } catch {
      // silently fail
    }
  };

  // Delete a comment
  const handleDelete = async (commentId: string) => {
    try {
      const res = await fetch(`/api/comments/${uploadId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, viewerId }),
      });

      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch {
      // silently fail
    }
  };

  // Handle name change
  const handleNameChange = (newName: string) => {
    setName(newName);
    setViewerName(newName);
  };

  return (
    <div
      className={`flex flex-col overflow-hidden ${className ?? ""}`}
      style={style}
    >
      {/* Name prompt overlay */}
      {showNamePrompt && (
        <div className="shrink-0 rounded-xl bg-neutral-50 px-4 py-3">
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
            const isOwn = authEnabled
              ? user !== null && item.viewerId === user.id
              : item.viewerId === viewerId;
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="group flex gap-3">
                <Avatar
                  name={item.authorName}
                  src={item.authorAvatar}
                  size={32}
                />
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
                            setEditingId(item.id);
                            setEditText(item.text);
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
                          if (e.key === "Enter") void handleEdit(item.id);
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditText("");
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
                          setEditingId(null);
                          setEditText("");
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
            );
          })
        )}
      </div>

      {/* Comment input */}
      {auth !== null && authEnabled && !user ? (
        <div className="shrink-0 border-t border-neutral-100 px-4 py-4">
          <p className="mb-3 text-center text-xs text-neutral-500">
            Sign in to comment
          </p>
          <div className="flex items-center justify-center gap-2">
            {auth.providers.map((provider) => {
              const { label, icon: Icon } = PROVIDER_LABELS[provider];
              return (
                <a
                  key={provider}
                  href={`/api/auth/login?provider=${provider}&redirect=${encodeURIComponent(
                    window.location.pathname,
                  )}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                >
                  <Icon />
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      ) : auth !== null ? (
        <div className="shrink-0 border-t border-neutral-100 px-4 py-3">
          {/* Name display / edit row (anonymous mode) */}
          {!authEnabled && name && (
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
            <Avatar
              name={user?.name || name || viewerId || "anonymous"}
              src={user?.avatar}
              size={32}
            />
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
      ) : null}
    </div>
  );
}
