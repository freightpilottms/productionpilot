"use client";

import TabBar from "@/app/_ui/TabBar";
import DesktopSidebar from "@/app/_ui/DesktopSidebar";
import PwaRegister from "@/app/_ui/PwaRegister";
import { clearDataCache, clearSessionCache, readAuthSession, refreshAuthSession, setActiveCacheScope } from "@/app/_ui/clientCache";
import { announcePrijemNavigationBlocked, shouldBlockPrijemNavigation } from "@/app/_ui/prijemProcessingGuard";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

function getSavedTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    return localStorage.getItem("theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function isEditableElement(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable
  );
}

const STOCK_SCAN_STORAGE_KEY = "becleven:pending-stock-scan";

function isInventoryPath(pathname) {
  return pathname === "/inventura" || pathname?.startsWith("/inventura/");
}

function createScanToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function queueStockScan(code, token) {
  if (typeof window === "undefined") return;

  try {
    sessionStorage.setItem(
      STOCK_SCAN_STORAGE_KEY,
      JSON.stringify({ code, token, at: Date.now() })
    );
  } catch {}
}

function broadcastStockScan(code, token) {
  if (typeof window === "undefined") return;

  const detail = { code, token };
  [0, 80, 220, 520].forEach((delay) => {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("barcode-scan", { detail }));
    }, delay);
  });
}

function stockScanUrl(code, token) {
  return `/zalihe?scan=${encodeURIComponent(code)}&_=${encodeURIComponent(token)}`;
}

function openStockScan(code, token, pathname, router) {
  const url = stockScanUrl(code, token);
  const alreadyOnStock = pathname === "/zalihe";

  queueStockScan(code, token);

  if (alreadyOnStock) {
    router.push(url);
    broadcastStockScan(code, token);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.href = url;
    return;
  }

  router.push(url);
}

export default function AppShell({ children }) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const authenticatedRef = useRef(false);

  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === "/" || pathname === "/login";
  const isRestaurantApp = pathname === "/restaurant-app" || pathname?.startsWith("/restaurant-app/");

  function markAuthenticated(value) {
    authenticatedRef.current = value;
    setAuthenticated(value);
  }

  useEffect(() => {
    const t = getSavedTheme();
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.lang = "bs";
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    document.body?.setAttribute("translate", "no");
    document.body?.classList.add("notranslate");
  }, []);

  useEffect(() => {
    function stopBrowserTextActions(e) {
      if (isEditableElement(e.target)) return;
      e.preventDefault();
    }

    document.addEventListener("selectstart", stopBrowserTextActions);
    document.addEventListener("contextmenu", stopBrowserTextActions);
    return () => {
      document.removeEventListener("selectstart", stopBrowserTextActions);
      document.removeEventListener("contextmenu", stopBrowserTextActions);
    };
  }, []);

  useEffect(() => {
    function blockInternalNavigationWhileReceivingGoods(event) {
      const anchor = event.target?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;

      const href = anchor.getAttribute("href") || anchor.href || "";
      if (!shouldBlockPrijemNavigation(href)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      announcePrijemNavigationBlocked();
    }

    function blockHistoryNavigationWhileReceivingGoods() {
      if (!shouldBlockPrijemNavigation(window.location.pathname)) return;
      announcePrijemNavigationBlocked();
      window.history.forward();
    }

    document.addEventListener("click", blockInternalNavigationWhileReceivingGoods, true);
    window.addEventListener("popstate", blockHistoryNavigationWhileReceivingGoods);
    return () => {
      document.removeEventListener("click", blockInternalNavigationWhileReceivingGoods, true);
      window.removeEventListener("popstate", blockHistoryNavigationWhileReceivingGoods);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      if (isLoginPage || isRestaurantApp) {
        if (!alive) return;
        markAuthenticated(false);
        setAuthChecked(true);
        return;
      }

      if (!authenticatedRef.current) {
        setAuthChecked(false);
      }

      const cachedSession = readAuthSession();
      if (cachedSession?.data?.authenticated && !cachedSession.stale) {
        setActiveCacheScope(cachedSession.data);
        markAuthenticated(true);
        setAuthChecked(true);
      }

      try {
        const j = await refreshAuthSession({ force: !cachedSession?.data?.authenticated });

        if (!alive) return;

        if (j?.authenticated) {
          const previousScope = setActiveCacheScope(j);
          if (previousScope) {
            clearDataCache();
          }

          markAuthenticated(true);
          setAuthChecked(true);
          return;
        }
      } catch (error) {
        if (
          cachedSession?.data?.authenticated &&
          error?.status !== 401 &&
          error?.status !== 403
        ) {
          markAuthenticated(true);
          setAuthChecked(true);
          return;
        }
      }

      if (!alive) return;
      clearSessionCache();
      clearDataCache();
      markAuthenticated(false);
      setAuthChecked(true);
      router.replace("/login");
    }

    checkSession();

    return () => {
      alive = false;
    };
  }, [isLoginPage, isRestaurantApp, router]);

  useEffect(() => {
    if (isLoginPage || isRestaurantApp || !authenticated) return;

    let buffer = "";
    let lastKeyAt = 0;
    let clearTimer = null;

    function flushToApp(code) {
      const value = String(code || "").trim();
      if (!value || value.length < 3) return;

      const token = createScanToken();

      if (isInventoryPath(pathname)) {
        window.dispatchEvent(
          new CustomEvent("becleven-scan", { detail: { code: value, token } })
        );
        return;
      }

      openStockScan(value, token, pathname, router);
    }

    function onPaste(e) {
      const active = document.activeElement;

      if (isInventoryPath(pathname)) {
        if (isEditableElement(active) && active?.dataset?.scannerSink !== "true") {
          return;
        }

        const value = e.clipboardData?.getData("text") || "";
        if (String(value || "").trim().length >= 3) e.preventDefault();
        flushToApp(value);
        return;
      }

      if (pathname === "/zalihe" && isEditableElement(active)) return;

      const value = e.clipboardData?.getData("text") || "";
      if (String(value || "").trim().length >= 3) e.preventDefault();
      flushToApp(value);
    }

    function onKeyDown(e) {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const active = document.activeElement;
      if (isInventoryPath(pathname) && isEditableElement(active)) return;

      const now = Date.now();
      if (now - lastKeyAt > 140) {
        buffer = "";
      }
      lastKeyAt = now;

      if (e.key === "Enter") {
        const code = buffer.trim();
        buffer = "";
        if (clearTimer) clearTimeout(clearTimer);
        flushToApp(code);
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
          buffer = "";
        }, 220);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste, true);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [authenticated, isLoginPage, isRestaurantApp, pathname, router]);

  const protectedReady = isLoginPage || isRestaurantApp || (authChecked && authenticated);
  const showAppChrome = protectedReady && !isLoginPage && !isRestaurantApp;

  return (
    <body translate="no" className="notranslate">
      <PwaRegister />
      <div className={`app-shell ${showAppChrome ? "desktopSidebarShell" : ""}`.trim()}>
        {showAppChrome && <DesktopSidebar />}
        <div className="app-content">
          <div className="page-content">
            {protectedReady ? (
              <>
                {children}
              </>
            ) : null}
          </div>
          {showAppChrome && (
            <div className="app-footer globalCopyright">
              © {new Date().getFullYear()} BeCleven App | AK Solutions • Sva prava pridržana
            </div>
          )}
        </div>

        {showAppChrome && <TabBar />}
      </div>
    </body>
  );
}
