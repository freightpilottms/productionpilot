"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let deferredPrompt = null;
    let promptStarted = false;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    const tryPromptInstall = () => {
      if (!deferredPrompt || promptStarted) return;

      promptStarted = true;
      deferredPrompt.prompt().catch(() => {
        promptStarted = false;
      });
      deferredPrompt.userChoice
        ?.catch(() => null)
        .finally(() => {
          deferredPrompt = null;
        });
    };

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      deferredPrompt = event;
      window.setTimeout(tryPromptInstall, 700);
      window.addEventListener("pointerdown", tryPromptInstall, { once: true });
      window.addEventListener("keydown", tryPromptInstall, { once: true });
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    if (document.readyState === "complete") {
      register();
      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.removeEventListener("pointerdown", tryPromptInstall);
        window.removeEventListener("keydown", tryPromptInstall);
      };
    }

    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("pointerdown", tryPromptInstall);
      window.removeEventListener("keydown", tryPromptInstall);
    };
  }, []);

  return null;
}
