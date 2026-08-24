"use client";

import * as React from "react";

import { cn } from "../../utils";

// ─── InstallPrompt ──────────────────────────────────────────────────────────
// A one-tap "Install app" bar, so neither app depends on the user knowing to
// dig through a browser menu for "Add to Home Screen".
//
// ─── What actually happens per platform ─────────────────────────────────────
// Chromium (Android Chrome, desktop Chrome/Edge, Samsung Internet) fires
// `beforeinstallprompt` once the install criteria are met. We stash that event
// and re-fire it from our own button, which opens the REAL native install
// dialog. That is the whole trick — there is no API to install a web app
// outright, only this one deferred handle to the browser's own dialog.
//
// 🔴 iOS/Safari does NOT implement `beforeinstallprompt` and never has. No web
// page on iOS can trigger an install prompt — that is an Apple platform
// decision, not something a manifest or a polyfill can work around. The honest
// fallback is to detect iOS and show the Share → Add to Home Screen steps,
// which is what `iosHint` below renders. Do not replace this with a library
// claiming otherwise; they all do exactly this.
//
// ─── Install criteria (all four, or the event never fires) ──────────────────
//   1. served over HTTPS (localhost counts as secure for development)
//   2. a linked manifest with name, 192px + 512px icons, start_url, and a
//      `display` of standalone / fullscreen / minimal-ui
//   3. a registered service worker WITH a fetch handler
//   4. not already installed
// Both apps' ServiceWorkerRegister is production-only, so on `npm run dev` this
// component renders nothing. Verify with `npm run build && npm start`, or on
// the deployed URL.

const DISMISS_KEY = "b2b:install-prompt-dismissed";

/**
 * The Chromium-only event. Not in lib.dom, so it is declared here rather than
 * cast through `any` (the repo is strict-mode, no `any`).
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the page is already running as an installed app. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses a non-standard navigator flag; everything else reports the
  // display-mode media query.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

/** iOS Safari — the one platform with no install API. */
function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, so the touch-point check is required to
  // tell an iPad from a desktop Safari that genuinely cannot install either.
  const iPadOS = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
}

export interface InstallPromptProps {
  /** App name shown in the copy, e.g. "Field Agent". */
  appName: string;
  /** Two-character mark on the badge — matches that app's icon ("B2" / "FA"). */
  mark?: string;
  /** One line on why installing is worth it. App-specific, so it is a prop. */
  blurb?: string;
  className?: string;
}

export function InstallPrompt({
  appName,
  mark = "B2",
  blurb = "Add it to your home screen — it opens full-screen, like a normal app.",
  className,
}: InstallPromptProps) {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(true); // assume dismissed until mounted

  React.useEffect(() => {
    if (isStandalone()) return; // already installed — nothing to offer

    // localStorage throws in some privacy modes; a broken storage read must not
    // take the whole screen down with it.
    let alreadyDismissed = false;
    try {
      alreadyDismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      alreadyDismissed = false;
    }
    if (alreadyDismissed) return;

    setDismissed(false);

    // iOS can't fire the event, so the hint is the only affordance available.
    if (isIos()) {
      setIosHint(true);
      return;
    }

    const onBeforeInstall = (e: Event) => {
      // Suppress Chrome's own mini-infobar so ours is the only prompt, then
      // keep the event — it is the only handle to the install dialog and it is
      // valid exactly once.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    // Fired after a successful install, including one done from the browser
    // menu rather than our button.
    const onInstalled = () => {
      setDeferred(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = React.useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not being able to remember the dismissal is survivable — the bar simply
      // comes back next visit. Failing to close it would not be.
    }
  }, []);

  const install = React.useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event cannot be reused whichever way it went; Chrome re-fires
    // `beforeinstallprompt` on a later visit if they declined.
    setDeferred(null);
    if (outcome === "accepted") close();
  }, [deferred, close]);

  if (dismissed) return null;
  if (!deferred && !iosHint) return null; // criteria not met yet

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[10px] bg-primary-black px-4 py-3 text-white",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-green font-mono text-xs font-bold text-primary-black"
      >
        {mark}
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm font-semibold leading-snug">Install {appName}</p>

        {iosHint ? (
          <p className="text-xs leading-relaxed text-white/70">
            Tap the Share icon in Safari, then <b className="text-white">Add to Home Screen</b>.
            Safari has no one-tap install, so this is the way in on iPhone.
          </p>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-white/70">{blurb}</p>
            <button
              type="button"
              onClick={install}
              className="mt-1 self-start rounded-lg bg-primary-green px-3 py-1.5 text-xs font-bold text-primary-black"
            >
              Install app
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={close}
        aria-label="Dismiss install prompt"
        className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-white/50 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
