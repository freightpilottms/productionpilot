# ProductionPilot

Modern Vercel-ready rebuild of the legacy `SemBuilding` production system.

## What Was Migrated

The original workspace contains two legacy .NET projects:

- `TMS`: ASP.NET Web Forms starter site with default Home/About/Contact pages.
- `SemBuilding`: Windows Forms production cockpit with the actual business logic.

The new deployable project is a Next.js app at the repository root. The legacy folders are kept as reference material, but the Vercel/StackBlitz/GitHub app uses the modern files in `app/`, `package.json`, `next.config.mjs`, and `vercel.json`.

## Rebuilt Capabilities

- Production order board with priority sorting by workflow state.
- Create, update, delete, search, and filter orders.
- Role-aware admin delete behavior.
- Production-hour accrual when orders move through tracked build states.
- Multilingual interface shell for Bos/Hrv/Srb, German, Italian, Spanish, and English.
- Render Production studio with Three.js 3D product generation from dimensions, series, colors, divisions, opening type, and warehouse formats.
- Automatic bill of materials, profile bar count, glass/panel fit checks, waste estimate, screws, hinges, gasket, and order creation from a rendered configuration.
- Live shop-floor monitor view.
- Document readiness matrix for sketches, cutting lists, material specs, purchase orders, transport, export, proforma, and images.
- Inventory module with receive/issue controls and reorder alerts.
- Supplier/client finance ledger with payment updates.
- Worker station board with status rotation and active order handoff.
- JSON import/export for portable StackBlitz and demo workflows.
- Vercel deployment configuration.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

## Deploy

1. Push this repository to GitHub.
2. Import it into Vercel.
3. Vercel will detect Next.js and run `npm install` then `npm run build`.

The current build is browser-first and uses local demo data. For a live production database, connect a hosted database through server-side Next.js route handlers and keep secrets in Vercel environment variables. Do not expose the legacy SQL Server credentials in client code.

## Migration Notes

Legacy `OrderSpecsDB` fields were mapped into a typed order model with status, documents, driver details, materials, and production timing. Desktop-only controls such as WinForms grids, Adobe ActiveX PDF viewers, and RDP widgets were replaced with browser-safe modules.

The legacy dropdowns from `SemBuilding/UpanelView.cs` are preserved as a production catalog in `app/_domain/legacyCatalog.ts`. Product series, material states, glass/panel availability, colors, hardware options, suppliers, warehouse categories, document buckets, clients, and workers now feed the browser UI instead of being hidden in Windows Forms controls.
