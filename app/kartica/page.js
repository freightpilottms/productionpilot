"use client";

import { Suspense } from "react";
import DesktopAppHeader from "@/app/_ui/DesktopAppHeader";
import KarticaClient from "./KarticaClient";

function LoadingFallback() {
  return (
    <main className="container page">
      <DesktopAppHeader title="Kartica" subtitle="Učitavanje…" status="Učitavanje…" />

      <div className="topbar mobileOnlyHeader">
        <div>
          <div className="brand">Kartica</div>
          <div className="subtitle">Učitavanje…</div>
        </div>
        <div className="pill">Učitavanje…</div>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        Učitavanje podataka…
      </div>
    </main>
  );
}

export default function KarticaPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <KarticaClient />
    </Suspense>
  );
}
