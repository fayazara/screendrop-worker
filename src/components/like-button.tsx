import { Button } from "@cloudflare/kumo/components/button";
import { useEffect, useRef, useState } from "react";
import type { AuthState } from "@/lib/use-auth";
import { SignInPopover } from "@/components/sign-in-popover";
import { getViewerId } from "@/lib/viewer-identity";

/** px the burst particles travel; matches the CSS animation scale. */
const PARTICLE_DISTANCE = 20;

interface LikeButtonProps {
  uploadId: string;
  /** Shared auth state from useAuth; null while it loads. */
  auth: AuthState | null;
  /** Server-rendered like total, so the count never flashes in. */
  initialCount: number;
  size?: "sm" | "base";
}

/**
 * Heart-with-count like button — a regular Kumo Button whose icon plays
 * the Transitions.dev like animation: liking fills the heart, springs a
 * pop, and fires an 8-dot particle burst with re-randomised vectors
 * each time. When OAuth is configured and the viewer is signed out,
 * clicking offers the sign-in providers instead.
 */
export function LikeButton({
  uploadId,
  auth,
  initialCount,
  size = "base",
}: LikeButtonProps) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);
  // Animation root: the span carrying data-liked/is-bursting, inside the
  // Kumo button so the CSS hooks don't depend on its class merging.
  const rootRef = useRef<HTMLSpanElement>(null);

  // Whether this viewer already liked — session cookie decides when auth
  // is enabled; the anonymous localStorage id otherwise.
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/likes/${uploadId}?viewerId=${encodeURIComponent(getViewerId())}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const data: { count: number; liked: boolean } = JSON.parse(
          await res.text(),
        );
        setCount(data.count);
        setLiked(data.liked);
      } catch {
        // leave the server-rendered count
      }
    })();
    return () => controller.abort();
  }, [uploadId]);

  const seedParticles = () => {
    const dots = rootRef.current?.querySelectorAll(".t-like-particles i");
    dots?.forEach((dot, i) => {
      const angle = (360 / dots.length) * i + (Math.random() * 2 - 1) * 16;
      const magnitude = PARTICLE_DISTANCE * (0.68 + Math.random() * 0.5);
      const radians = (angle * Math.PI) / 180;
      const style = (dot as HTMLElement).style;
      style.setProperty(
        "--px",
        `${(Math.cos(radians) * magnitude).toFixed(2)}px`,
      );
      style.setProperty(
        "--py",
        `${(Math.sin(radians) * magnitude).toFixed(2)}px`,
      );
      style.setProperty(
        "--pdur",
        `calc(var(--like-particle-dur) * ${(0.78 + Math.random() * 0.44).toFixed(3)})`,
      );
      style.setProperty("--pdelay", `${Math.round(Math.random() * 70)}ms`);
      style.setProperty(
        "--p-end-scale",
        (0.35 + Math.random() * 0.4).toFixed(2),
      );
      style.setProperty("--psize", (0.6 + Math.random() * 0.8).toFixed(2));
    });
  };

  const playBurst = () => {
    const el = rootRef.current;
    if (!el) return;
    el.classList.remove("is-bursting");
    seedParticles();
    void el.offsetWidth; // reflow so the burst replays
    el.classList.add("is-bursting");
  };

  const toggle = async () => {
    if (!auth || pending) return;
    const next = !liked;
    setPending(true);
    setLiked(next);
    setCount((value) => Math.max(0, value + (next ? 1 : -1)));
    if (next) playBurst();
    else rootRef.current?.classList.remove("is-bursting");

    try {
      const res = await fetch(`/api/likes/${uploadId}`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          auth.authEnabled ? {} : { viewerId: getViewerId() },
        ),
      });
      if (res.ok) {
        const data: { count: number; liked: boolean } = JSON.parse(
          await res.text(),
        );
        setCount(data.count);
        setLiked(data.liked);
      } else {
        setLiked(!next);
        setCount((value) => Math.max(0, value + (next ? -1 : 1)));
      }
    } catch {
      setLiked(!next);
      setCount((value) => Math.max(0, value + (next ? -1 : 1)));
    } finally {
      setPending(false);
    }
  };

  const signedOut = auth?.authEnabled === true && auth.user === null;
  const button = (
    <Button
      variant="secondary"
      size={size}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      onClick={signedOut ? undefined : () => void toggle()}
    >
      <span
        ref={rootRef}
        className="t-like flex items-center gap-1.5"
        data-liked={liked ? "true" : "false"}
      >
        <span className="relative flex">
          <span className="t-like-icon flex">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="t-like-heart"
            >
              <path
                d="M7.99511 3.42388C6.66221 1.8656 4.4395 1.44643 2.76947 2.87334C1.09944 4.30026 0.86432 6.68598 2.17581 8.3736C3.26622 9.77674 6.56619 12.7361 7.64774 13.6939C7.76874 13.801 7.82925 13.8546 7.89982 13.8757C7.96141 13.8941 8.02881 13.8941 8.0904 13.8757C8.16097 13.8546 8.22147 13.801 8.34248 13.6939C9.42403 12.7361 12.724 9.77674 13.8144 8.3736C15.1259 6.68598 14.9195 4.28525 13.2207 2.87334C11.522 1.46144 9.32801 1.8656 7.99511 3.42388Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="t-like-particles" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        </span>
        <span className="tabular-nums">{count}</span>
      </span>
    </Button>
  );

  // Signed out on an auth-enabled deployment: the button opens a
  // sign-in popover instead of liking.
  if (signedOut) {
    return (
      <SignInPopover
        providers={auth.providers}
        title="Sign in to like"
        trigger={button}
      />
    );
  }

  return button;
}
