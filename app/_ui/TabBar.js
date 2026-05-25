"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { readAuthSession, refreshAuthSession } from "@/app/_ui/clientCache";
import { isNavItemActive, NavIcon, primaryTabs } from "@/app/_ui/navItems";
import { cachedPermissions, moduleAllowedForHref, normalizePermissions, PERMISSION_DENIED_SUBTEXT, PERMISSION_DENIED_TEXT } from "@/app/_ui/permissions";

export default function TabBar() {
  const p = usePathname() || "/";
  const [permissions, setPermissions] = useState(() => cachedPermissions());

  useEffect(() => {
    let alive = true;

    async function loadPermissions() {
      const cached = readAuthSession();
      if (cached?.data?.permissions) {
        setPermissions(normalizePermissions(cached.data.permissions));
      }

      try {
        const session = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive || !session?.authenticated) return;
        setPermissions(normalizePermissions(session.permissions));
      } catch {}
    }

    loadPermissions();
    return () => {
      alive = false;
    };
  }, []);

  if (p === "/") return null;

  return (
    <nav
      className="tabbar mobileOnlyTabbar"
      aria-label="Glavna navigacija"
      style={{
        paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="tabs">
        {primaryTabs.map((tab) => {
          const active = isNavItemActive(p, tab);
          const allowed = moduleAllowedForHref(permissions, tab.href);
          const title = allowed ? tab.label : `${PERMISSION_DENIED_TEXT} ${PERMISSION_DENIED_SUBTEXT}`;

          if (!allowed) {
            return (
              <span
                key={tab.href}
                className="tab permissionDisabledTab"
                aria-label={tab.label}
                aria-disabled="true"
                title={title}
              >
                <NavIcon name={tab.icon} />
                <span className="navText">{tab.label}</span>
              </span>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab clickable ${active ? "active" : ""}`}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              title={title}
            >
              <NavIcon name={tab.icon} />
              <span className="navText">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
