import { useEffect, useState } from "react";
import type { User } from "../types";
import { DEMO_ADMIN, login, signup } from "../lib/auth";
import { CloseIcon, LockIcon, RadarMark, UserIcon } from "./icons";

interface Props {
  open: boolean;
  intent: "generic" | "admin" | "follow";
  onClose: () => void;
  onAuthed: (user: User) => void;
}

const INTENT_COPY: Record<Props["intent"], { title: string; sub: string }> = {
  generic: {
    title: "Get on the radar",
    sub: "Sign in to follow card tiers and merchants — your own slice of the board, saved on this device.",
  },
  admin: {
    title: "Admin sign-in required",
    sub: "The source registry is restricted to the web admin. Sign in with an admin account to register banks or vendors.",
  },
  follow: {
    title: "Sign in to follow",
    sub: "Following is per-account — create one (takes ten seconds) and your radar is saved on this device.",
  },
};

export default function AuthModal({ open, intent, onClose, onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = INTENT_COPY[intent];

  const submit = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // tiny beat so the button state is perceptible
    window.setTimeout(() => {
      const res =
        mode === "login"
          ? login(username, password)
          : signup(username, password, displayName);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        setShake((s) => s + 1);
        return;
      }
      setUsername("");
      setPassword("");
      setDisplayName("");
      onAuthed(res.user);
    }, 320);
  };

  const fillAdmin = () => {
    setMode("login");
    setUsername(DEMO_ADMIN.username);
    setPassword(DEMO_ADMIN.password);
    setError(null);
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-brick focus:outline-none focus:ring-2 focus:ring-brick/20 transition-shadow";

  return (
    <div
      className="fade-in fixed inset-0 z-[80] flex items-end justify-center bg-term/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <div
        key={shake}
        className={`modal-pop relative w-full max-w-md rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6 ${error ? "shake-x" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3.5 top-3.5 rounded-full border border-line p-2 text-ink-faint transition-all hover:rotate-90 hover:border-brick hover:text-brick"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <div className="flex items-center gap-3">
          <RadarMark className="h-9 w-9 text-brick" />
          <div>
            <h2 className="font-display text-[21px] font-extrabold tracking-tight text-ink">
              {copy.title}
            </h2>
          </div>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{copy.sub}</p>

        {/* tabs */}
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-1">
          {(
            [
              { id: "login", label: "Sign in", Icon: UserIcon },
              { id: "signup", label: "Create account", Icon: LockIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => {
                setMode(id);
                setError(null);
              }}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all ${
                mode === id
                  ? "bg-brick font-semibold text-paper shadow-[0_2px_10px_-2px_rgba(200,16,46,0.5)]"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Username"
            autoFocus
            className={inputCls}
            aria-label="Username"
          />
          {mode === "signup" && (
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Display name (optional)"
              className={inputCls}
              aria-label="Display name"
            />
          )}
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            type="password"
            placeholder="Password"
            className={inputCls}
            aria-label="Password"
          />

          {error && (
            <p className="fade-in flex items-center gap-2 rounded-lg border border-ember/40 bg-ember-soft px-3 py-2 text-[12.5px] font-medium text-ember">
              <CloseIcon className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brick px-5 py-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-paper transition-all hover:bg-ink active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? (
              <>
                <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-paper/30 border-t-paper" />
                Checking…
              </>
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-dashed border-line bg-paper/70 px-3.5 py-3">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
            Demo admin
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="rounded border border-brick/40 bg-tint px-2 py-0.5 font-mono text-[11.5px] font-semibold text-brick">
              {DEMO_ADMIN.username} / {DEMO_ADMIN.password}
            </code>
            <button
              onClick={fillAdmin}
              className="rounded-full bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-brick"
            >
              Fill
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
            Accounts live only in this browser — nothing is sent anywhere.
          </p>
        </div>
      </div>
    </div>
  );
}
