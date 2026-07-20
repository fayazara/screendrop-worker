import { Popover } from "@cloudflare/kumo";
import type { ReactElement, SVGProps } from "react";
import type { AuthProvider } from "@/lib/use-auth";

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
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

export const PROVIDER_LABELS: Record<
  AuthProvider,
  { label: string; icon: typeof GithubIcon }
> = {
  github: { label: "GitHub", icon: GithubIcon },
  google: { label: "Google", icon: GoogleIcon },
};

interface SignInPopoverProps {
  providers: Array<AuthProvider>;
  title: string;
  /** The element that opens the popover, e.g. a Button or a fake input. */
  trigger: ReactElement;
}

/**
 * Sign-in prompt shown right where the viewer tried to act (like,
 * comment) instead of a separate empty state: the trigger opens a
 * popover listing the configured OAuth providers, and signing in
 * returns to this page.
 */
export function SignInPopover({
  providers,
  title,
  trigger,
}: SignInPopoverProps) {
  return (
    <Popover>
      <Popover.Trigger render={trigger} />
      <Popover.Content className="w-60">
        <Popover.Title>{title}</Popover.Title>
        <Popover.Description>
          You'll come right back to this page.
        </Popover.Description>
        <div className="mt-3 flex flex-col gap-2">
          {providers.map((provider) => {
            const { label, icon: Icon } = PROVIDER_LABELS[provider];
            return (
              <a
                key={provider}
                href={`/api/auth/login?provider=${provider}&redirect=${encodeURIComponent(
                  window.location.pathname,
                )}`}
                className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                <Icon className="size-4" />
                Continue with {label}
              </a>
            );
          })}
        </div>
      </Popover.Content>
    </Popover>
  );
}
