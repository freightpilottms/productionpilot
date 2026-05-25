"use client";

import { readAuthSession, refreshAuthSession } from "@/app/_ui/clientCache";
import { useEffect, useState } from "react";

export default function DesktopAppHeader({
  status = "—",
  title,
  subtitle,
  className = "",
  statusTitle = "Status",
  showMeta = true,
}) {
  const [firma, setFirma] = useState("—");

  useEffect(() => {
    if (!showMeta) return;

    let alive = true;
    (async () => {
      const cached = readAuthSession();
      if (cached?.data?.authenticated && !cached.stale) {
        setFirma(cached.data.companyName || cached.data.database || "—");
      }

      try {
        const j = await refreshAuthSession({ force: !cached?.data?.authenticated });
        if (!alive) return;
        if (j?.authenticated) {
          setFirma(j.companyName || j.database || "—");
        }
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [showMeta]);

  return (
    <>
      {showMeta && (
        <div className={`desktopHeaderMetaRow ${className}`.trim()}>
          <div className="firmaStack">
            <div className="firmaLabel">Firma:</div>
            <div className="firmaName" title={firma}>
              {firma}
            </div>
          </div>

          <div className="pill clickable pageStatusPill" role="button" tabIndex={0} title={statusTitle}>
            {status}
          </div>
        </div>
      )}

      {(title || subtitle) && (
        <div className="desktopPageTitleBlock">
          {title && <div className="brand">{title}</div>}
          {subtitle && <div className="subtitle">{subtitle}</div>}
        </div>
      )}
    </>
  );
}
