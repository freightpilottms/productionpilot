"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  Download,
  Eye,
  Factory,
  FileText,
  Filter,
  Gauge,
  HardHat,
  Home,
  LogOut,
  Menu,
  Monitor,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Truck,
  Undo2,
  Upload,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { ProductionRenderer } from "../components/ProductionRenderer";
import { legacyCatalog } from "./_domain/legacyCatalog";
import {
  languages,
  makeTranslator,
  stateTranslations,
  type Language,
  type TranslationKey
} from "./_domain/i18n";

type View =
  | "dashboard"
  | "orders"
  | "monitor"
  | "render"
  | "documents"
  | "stock"
  | "finance"
  | "workers";

type ProductionState =
  | "U PRIPREMI"
  | "U PROIZVODNJI"
  | "SREZANO"
  | "OBRADJENO"
  | "ZAVARENO"
  | "OKOVANO"
  | "POSTAKLANO"
  | "SPAKOVANO"
  | "POSLANO"
  | "ISPORUCENO";

type DocumentKey =
  | "skice"
  | "reznaLista"
  | "specMaterijala"
  | "ponudaUgovor"
  | "originalneMjere"
  | "profil"
  | "ojacanja"
  | "okovi"
  | "staklo"
  | "panel"
  | "transport"
  | "izvoz"
  | "proforma"
  | "transportSlika1"
  | "transportSlika2";

type OrderDocument = {
  key: DocumentKey;
  label: string;
  fileName?: string;
  uploadedAt?: string;
};

type Order = {
  id: string;
  orderDate: string;
  client: string;
  requester: string;
  series: string;
  profile: string;
  colorInt: string;
  colorExt: string;
  glass: string;
  reinforcement: string;
  hardware: string;
  quantity: number;
  manufacturingDate: string;
  deliveryDate: string;
  productionHours: number;
  state: ProductionState;
  note: string;
  pillar: string;
  handles: string;
  handleColor: string;
  caps: string;
  plugs: string;
  trims: string;
  panel: string;
  driverName: string;
  driverPhone: string;
  userName: string;
  lastStateChangeAt: string;
  documents: Record<DocumentKey, OrderDocument>;
};

type OrderForm = Omit<Order, "quantity" | "productionHours"> & {
  quantity: string;
  productionHours: string;
};

type User = {
  name: string;
  role: "Admin" | "Planner" | "Operator";
};

type StockItem = {
  id: string;
  code: string;
  name: string;
  category: string;
  supplier: string;
  unit: string;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  value: number;
  textureImage?: string;
  textureName?: string;
  textureUploadedAt?: string;
};

type LedgerItem = {
  id: string;
  name: string;
  kind: "supplier" | "client";
  invoice: string;
  dueDate: string;
  amount: number;
  paid: number;
};

type WorkerShift = {
  id: string;
  name: string;
  station: string;
  activeOrderId: string;
  shiftHours: number;
  efficiency: number;
  status: "Active" | "Paused" | "Ready";
};

type PersistedState = {
  orders: Order[];
  stock: StockItem[];
  ledger: LedgerItem[];
  workers: WorkerShift[];
};

const storageKey = "productionpilot.v1";

const productionStates: ProductionState[] = [
  "U PRIPREMI",
  "U PROIZVODNJI",
  "SREZANO",
  "OBRADJENO",
  "ZAVARENO",
  "OKOVANO",
  "POSTAKLANO",
  "SPAKOVANO",
  "POSLANO",
  "ISPORUCENO"
];

const productionStatePriority: Record<ProductionState, number> = {
  "U PRIPREMI": 1,
  "U PROIZVODNJI": 2,
  SREZANO: 3,
  OBRADJENO: 4,
  ZAVARENO: 5,
  OKOVANO: 6,
  POSTAKLANO: 7,
  SPAKOVANO: 8,
  POSLANO: 9,
  ISPORUCENO: 10
};

const trackedWorkStates = new Set<ProductionState>([
  "U PROIZVODNJI",
  "SREZANO",
  "OBRADJENO",
  "ZAVARENO",
  "OKOVANO",
  "POSTAKLANO",
  "SPAKOVANO"
]);

const stateMeta: Record<
  ProductionState,
  { group: "Prep" | "Build" | "Pack" | "Ship" | "Done"; tone: string }
> = {
  "U PRIPREMI": { group: "Prep", tone: "prep" },
  "U PROIZVODNJI": { group: "Build", tone: "build" },
  SREZANO: { group: "Build", tone: "build" },
  OBRADJENO: { group: "Build", tone: "build" },
  ZAVARENO: { group: "Build", tone: "build" },
  OKOVANO: { group: "Build", tone: "build" },
  POSTAKLANO: { group: "Build", tone: "build" },
  SPAKOVANO: { group: "Pack", tone: "pack" },
  POSLANO: { group: "Ship", tone: "ship" },
  ISPORUCENO: { group: "Done", tone: "done" }
};

const documentLabels: Record<DocumentKey, string> = {
  skice: "Skice",
  reznaLista: "Rezna lista",
  specMaterijala: "Spec. materijala",
  ponudaUgovor: "Ponuda/Ugovor",
  originalneMjere: "Originalne mjere",
  profil: "Narudžba profila",
  ojacanja: "Narudžba ojačanja",
  okovi: "Narudžba okova",
  staklo: "Narudžba stakla",
  panel: "Narudžba panela",
  transport: "Transport",
  izvoz: "Izvoz",
  proforma: "Proforma",
  transportSlika1: "Transport slika 1",
  transportSlika2: "Transport slika 2"
};

const localizedDocumentLabels: Record<Language, Record<DocumentKey, string>> = {
  bhs: documentLabels,
  de: {
    skice: "Skizzen",
    reznaLista: "Zuschnittliste",
    specMaterijala: "Materialspezifikation",
    ponudaUgovor: "Angebot/Vertrag",
    originalneMjere: "Originalmaße",
    profil: "Profilbestellung",
    ojacanja: "Verstärkungsbestellung",
    okovi: "Beschlagbestellung",
    staklo: "Glasbestellung",
    panel: "Paneelbestellung",
    transport: "Transport",
    izvoz: "Export",
    proforma: "Proforma",
    transportSlika1: "Transportbild 1",
    transportSlika2: "Transportbild 2"
  },
  it: {
    skice: "Schizzi",
    reznaLista: "Lista taglio",
    specMaterijala: "Spec. materiali",
    ponudaUgovor: "Offerta/Contratto",
    originalneMjere: "Misure originali",
    profil: "Ordine profili",
    ojacanja: "Ordine rinforzi",
    okovi: "Ordine ferramenta",
    staklo: "Ordine vetro",
    panel: "Ordine pannelli",
    transport: "Trasporto",
    izvoz: "Export",
    proforma: "Proforma",
    transportSlika1: "Foto trasporto 1",
    transportSlika2: "Foto trasporto 2"
  },
  es: {
    skice: "Bocetos",
    reznaLista: "Lista de corte",
    specMaterijala: "Esp. materiales",
    ponudaUgovor: "Oferta/Contrato",
    originalneMjere: "Medidas originales",
    profil: "Pedido perfiles",
    ojacanja: "Pedido refuerzos",
    okovi: "Pedido herrajes",
    staklo: "Pedido vidrio",
    panel: "Pedido paneles",
    transport: "Transporte",
    izvoz: "Exportación",
    proforma: "Proforma",
    transportSlika1: "Foto transporte 1",
    transportSlika2: "Foto transporte 2"
  },
  en: {
    skice: "Sketches",
    reznaLista: "Cut list",
    specMaterijala: "Material spec",
    ponudaUgovor: "Offer/Contract",
    originalneMjere: "Original measures",
    profil: "Profile order",
    ojacanja: "Reinforcement order",
    okovi: "Hardware order",
    staklo: "Glass order",
    panel: "Panel order",
    transport: "Transport",
    izvoz: "Export",
    proforma: "Proforma",
    transportSlika1: "Transport photo 1",
    transportSlika2: "Transport photo 2"
  }
};

const documentKeys = Object.keys(documentLabels) as DocumentKey[];

const users: User[] = [
  { name: "SEM", role: "Admin" },
  { name: "MINELA", role: "Planner" },
  { name: "IRMA", role: "Planner" },
  { name: "EDINA", role: "Operator" }
];

const navItems: Array<{ id: View; labelKey: TranslationKey; icon: LucideIcon }> = [
  { id: "dashboard", labelKey: "control", icon: Home },
  { id: "orders", labelKey: "orders", icon: ClipboardList },
  { id: "monitor", labelKey: "monitor", icon: Monitor },
  { id: "render", labelKey: "render", icon: Gauge },
  { id: "documents", labelKey: "documents", icon: FileText },
  { id: "stock", labelKey: "stock", icon: Boxes },
  { id: "finance", labelKey: "finance", icon: Wallet },
  { id: "workers", labelKey: "workers", icon: Users }
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "BAM",
  maximumFractionDigits: 0
});

const dateLabels: Record<Language, { months: string[]; weekdays: string[] }> = {
  bhs: {
    months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    weekdays: ["ned", "pon", "uto", "sri", "čet", "pet", "sub"]
  },
  de: {
    months: ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"],
    weekdays: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"]
  },
  it: {
    months: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"],
    weekdays: ["dom", "lun", "mar", "mer", "gio", "ven", "sab"]
  },
  es: {
    months: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    weekdays: ["dom", "lun", "mar", "mié", "jue", "vie", "sab"]
  },
  en: {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  }
};

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

function createDocuments(
  filled: Partial<Record<DocumentKey, string>> = {}
): Record<DocumentKey, OrderDocument> {
  return documentKeys.reduce((acc, key) => {
    acc[key] = {
      key,
      label: documentLabels[key],
      fileName: filled[key],
      uploadedAt: filled[key] ? "2026-05-17T09:00:00.000Z" : undefined
    };
    return acc;
  }, {} as Record<DocumentKey, OrderDocument>);
}

function createMaterialTextureDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Texture image could not be read."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Texture image is not readable."));
        return;
      }

      const image = new Image();
      image.onload = () => {
        const maxSize = 1100;
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Texture image could not be processed."));
          return;
        }

        canvas.width = width;
        canvas.height = height;
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      image.onerror = () => reject(new Error("Texture image could not be decoded."));
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function createEmptyForm(userName = "SEM"): OrderForm {
  return {
    id: "",
    orderDate: toDateInput(new Date()),
    client: "",
    requester: "",
    series: "",
    profile: "",
    colorInt: "",
    colorExt: "",
    glass: "",
    reinforcement: "",
    hardware: "",
    quantity: "1",
    manufacturingDate: addDays(1),
    deliveryDate: addDays(5),
    productionHours: "0",
    state: "U PRIPREMI",
    note: "",
    pillar: "",
    handles: "",
    handleColor: "",
    caps: "",
    plugs: "",
    trims: "",
    panel: "",
    driverName: "",
    driverPhone: "",
    userName,
    lastStateChangeAt: new Date().toISOString(),
    documents: createDocuments()
  };
}

function formatOrderId(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function orderToForm(order: Order): OrderForm {
  return {
    ...order,
    quantity: String(order.quantity),
    productionHours: String(order.productionHours)
  };
}

function formToOrder(
  form: OrderForm,
  userName: string,
  existing?: Order
): Order {
  const nextState = form.state;
  const now = new Date().toISOString();
  const quantity = Math.max(0, Number(form.quantity) || 0);
  let productionHours = Math.max(0, Number(form.productionHours) || 0);
  let lastStateChangeAt = existing?.lastStateChangeAt ?? now;

  if (existing && existing.state !== nextState) {
    if (
      trackedWorkStates.has(existing.state) &&
      trackedWorkStates.has(nextState)
    ) {
      const elapsed =
        (Date.now() - new Date(existing.lastStateChangeAt).getTime()) /
        1000 /
        60 /
        60;
      productionHours = Math.round((existing.productionHours + elapsed) * 10) / 10;
    }
    lastStateChangeAt = now;
  }

  return {
    ...form,
    id: formatOrderId(form.id),
    quantity,
    productionHours,
    userName,
    lastStateChangeAt,
    documents: form.documents
  };
}

function daysUntil(dateInput: string) {
  const target = new Date(`${dateInput}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function nextOrderId(orders: Order[]) {
  const numbers = orders
    .map((order) => Number(order.id.replace(/\D/g, "")))
    .filter((value) => Number.isFinite(value));
  const next = (numbers.length ? Math.max(...numbers) : 24000) + 1;
  return formatOrderId(String(next));
}

function documentCoverage(order: Order) {
  const ready = documentKeys.filter((key) => order.documents[key]?.fileName).length;
  return Math.round((ready / documentKeys.length) * 100);
}

function orderSearchText(order: Order) {
  return [
    order.id,
    order.client,
    order.requester,
    order.series,
    order.profile,
    order.state,
    order.note
  ]
    .join(" ")
    .toLowerCase();
}

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function IconButton({
  title,
  children,
  className,
  ...props
}: {
  title: string;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      aria-label={title}
      className={classNames("icon-button", className)}
      title={title}
      type={props.type ?? "button"}
    >
      {children}
    </button>
  );
}

function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-label="ProductionPilot"
      className={className}
      focusable="false"
      role="img"
      viewBox="0 0 2169 327"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#101820" height="327" width="2169" />
      <g transform="translate(74 66)">
        <path d="M0 92h265" stroke="#f97316" strokeLinecap="round" strokeWidth="28" />
        <path
          d="M172 16l104 76-104 76"
          fill="none"
          stroke="#f97316"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="28"
        />
        <path d="M312 35l78 46V28l72 48V24l83 57v111H312z" fill="#ffffff" />
        <rect fill="#101820" height="32" width="28" x="346" y="124" />
        <rect fill="#101820" height="32" width="28" x="404" y="124" />
        <rect fill="#101820" height="32" width="28" x="462" y="124" />
      </g>
      <text
        fill="#ffffff"
        fontFamily="Inter, Segoe UI, Arial, sans-serif"
        fontSize="126"
        fontWeight="800"
        x="690"
        y="204"
      >
        Production
      </text>
      <text
        fill="#f97316"
        fontFamily="Inter, Segoe UI, Arial, sans-serif"
        fontSize="126"
        fontWeight="800"
        x="1332"
        y="204"
      >
        Pilot
      </text>
    </svg>
  );
}

function StatusPill({
  state,
  language = "bhs"
}: {
  state: ProductionState;
  language?: Language;
}) {
  return (
    <span className={classNames("status-pill", stateMeta[state].tone)}>
      {stateTranslations[language][state] ?? state}
    </span>
  );
}

function Field({
  label,
  children,
  wide = false
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={classNames("field", wide && "wide")}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const seedOrders: Order[] = [
  {
    id: "24-118",
    orderDate: "2026-05-10",
    client: "BauLine Sarajevo",
    requester: "Hotel Atrium",
    series: "PVC 82",
    profile: "Veka Softline",
    colorInt: "Bijela",
    colorExt: "Antracit",
    glass: "4S Low-E",
    reinforcement: "Celik 2mm",
    hardware: "Siegenia",
    quantity: 42,
    manufacturingDate: "2026-05-16",
    deliveryDate: "2026-05-22",
    productionHours: 18.5,
    state: "U PROIZVODNJI",
    note: "Priority facade batch. Confirm handles before packing.",
    pillar: "PVC",
    handles: "Secustik",
    handleColor: "Srebrna",
    caps: "Standard",
    plugs: "PVC",
    trims: "Ravna",
    panel: "Glatt",
    driverName: "Adnan",
    driverPhone: "+387 61 222 441",
    userName: "SEM",
    lastStateChangeAt: "2026-05-17T07:20:00.000Z",
    documents: createDocuments({
      skice: "24-118-skice.pdf",
      reznaLista: "24-118-rezna-lista.pdf",
      specMaterijala: "24-118-spec.pdf",
      profil: "24-118-profili.pdf",
      staklo: "24-118-staklo.pdf"
    })
  },
  {
    id: "24-119",
    orderDate: "2026-05-11",
    client: "Dom Invest",
    requester: "Villa Una",
    series: "ALU 75",
    profile: "Alumil M11000",
    colorInt: "Crna",
    colorExt: "Crna",
    glass: "Triple 44.2",
    reinforcement: "Thermal bridge",
    hardware: "Roto",
    quantity: 18,
    manufacturingDate: "2026-05-17",
    deliveryDate: "2026-05-19",
    productionHours: 31,
    state: "SPAKOVANO",
    note: "Transport invoice pending.",
    pillar: "ALU",
    handles: "Minimal",
    handleColor: "Crna",
    caps: "ALU",
    plugs: "Black",
    trims: "Hidden",
    panel: "Dekorativni",
    driverName: "Mirza",
    driverPhone: "+387 62 101 090",
    userName: "MINELA",
    lastStateChangeAt: "2026-05-16T15:00:00.000Z",
    documents: createDocuments({
      skice: "24-119-skice.pdf",
      reznaLista: "24-119-rezna.pdf",
      specMaterijala: "24-119-spec.pdf",
      ponudaUgovor: "24-119-ugovor.pdf",
      profil: "24-119-profili.pdf",
      ojacanja: "24-119-ojacanja.pdf",
      okovi: "24-119-okovi.pdf",
      staklo: "24-119-staklo.pdf",
      panel: "24-119-paneli.pdf"
    })
  },
  {
    id: "24-120",
    orderDate: "2026-05-13",
    client: "Krajina Build",
    requester: "School Block C",
    series: "PVC 76",
    profile: "Gealan S9000",
    colorInt: "Bijela",
    colorExt: "Zlatni hrast",
    glass: "Low-E 24mm",
    reinforcement: "Celik",
    hardware: "Vorne",
    quantity: 66,
    manufacturingDate: "2026-05-18",
    deliveryDate: "2026-05-28",
    productionHours: 0,
    state: "U PRIPREMI",
    note: "Wait for original measurements.",
    pillar: "PVC",
    handles: "Classic",
    handleColor: "Bijela",
    caps: "Standard",
    plugs: "PVC",
    trims: "Standard",
    panel: "None",
    driverName: "",
    driverPhone: "",
    userName: "IRMA",
    lastStateChangeAt: "2026-05-13T10:00:00.000Z",
    documents: createDocuments({
      ponudaUgovor: "24-120-ugovor.pdf"
    })
  },
  {
    id: "24-121",
    orderDate: "2026-05-15",
    client: "Euro Dom",
    requester: "Warehouse doors",
    series: "ALU 90",
    profile: "Schuco AWS",
    colorInt: "RAL 7016",
    colorExt: "RAL 7016",
    glass: "Tempered",
    reinforcement: "ALU",
    hardware: "GU",
    quantity: 12,
    manufacturingDate: "2026-05-17",
    deliveryDate: "2026-05-18",
    productionHours: 25.2,
    state: "POSLANO",
    note: "Driver confirmed. Need export invoice after delivery.",
    pillar: "ALU",
    handles: "Pull bar",
    handleColor: "Inox",
    caps: "ALU",
    plugs: "Black",
    trims: "Industrial",
    panel: "Metal",
    driverName: "Nermin",
    driverPhone: "+387 60 555 122",
    userName: "EDINA",
    lastStateChangeAt: "2026-05-17T08:45:00.000Z",
    documents: createDocuments({
      skice: "24-121-skice.pdf",
      reznaLista: "24-121-rezna.pdf",
      specMaterijala: "24-121-spec.pdf",
      profil: "24-121-profili.pdf",
      ojacanja: "24-121-ojacanja.pdf",
      okovi: "24-121-okovi.pdf",
      staklo: "24-121-staklo.pdf",
      transport: "24-121-transport.pdf",
      transportSlika1: "24-121-kamion.jpg"
    })
  }
];

seedOrders.sort((a, b) => productionStatePriority[a.state] - productionStatePriority[b.state]);

const seedStock: StockItem[] = [
  {
    id: "st-1",
    code: "PR-VEKA-82",
    name: "Veka Softline profile",
    category: "Profili",
    supplier: "VEKA",
    unit: "m",
    onHand: 920,
    reserved: 430,
    reorderPoint: 300,
    value: 18
  },
  {
    id: "st-2",
    code: "OK-SIEG-01",
    name: "Siegenia hardware set",
    category: "Okovi",
    supplier: "Schachermayer",
    unit: "set",
    onHand: 86,
    reserved: 62,
    reorderPoint: 40,
    value: 72
  },
  {
    id: "st-3",
    code: "GL-4S-24",
    name: "4S Low-E glass",
    category: "Staklo",
    supplier: "Termoglas",
    unit: "m2",
    onHand: 118,
    reserved: 92,
    reorderPoint: 80,
    value: 65
  },
  {
    id: "st-4",
    code: "PN-GLATT",
    name: "Glatt panels",
    category: "Paneli",
    supplier: "Euro Roal",
    unit: "pcs",
    onHand: 22,
    reserved: 18,
    reorderPoint: 25,
    value: 115
  }
];

const seedLedger: LedgerItem[] = [
  {
    id: "lg-1",
    name: "VEKA",
    kind: "supplier",
    invoice: "V-2026-118",
    dueDate: "2026-05-25",
    amount: 18600,
    paid: 8000
  },
  {
    id: "lg-2",
    name: "Termoglas",
    kind: "supplier",
    invoice: "TG-552",
    dueDate: "2026-05-20",
    amount: 9400,
    paid: 9400
  },
  {
    id: "lg-3",
    name: "BauLine Sarajevo",
    kind: "client",
    invoice: "P-24-118",
    dueDate: "2026-05-30",
    amount: 42100,
    paid: 21000
  },
  {
    id: "lg-4",
    name: "Euro Dom",
    kind: "client",
    invoice: "P-24-121",
    dueDate: "2026-05-18",
    amount: 12800,
    paid: 3200
  }
];

const seedWorkers: WorkerShift[] = [
  {
    id: "wk-1",
    name: "Amar",
    station: "Cutting",
    activeOrderId: "24-118",
    shiftHours: 6.5,
    efficiency: 94,
    status: "Active"
  },
  {
    id: "wk-2",
    name: "Eldin",
    station: "Welding",
    activeOrderId: "24-118",
    shiftHours: 5.8,
    efficiency: 88,
    status: "Active"
  },
  {
    id: "wk-3",
    name: "Selma",
    station: "Packing",
    activeOrderId: "24-119",
    shiftHours: 7.1,
    efficiency: 98,
    status: "Ready"
  },
  {
    id: "wk-4",
    name: "Haris",
    station: "Quality",
    activeOrderId: "24-121",
    shiftHours: 4.4,
    efficiency: 91,
    status: "Paused"
  }
];

export default function ProductionPilot() {
  const [language, setLanguage] = useState<Language>("bhs");
  const t = useMemo(() => makeTranslator(language), [language]);
  const currentUser = users[0];
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [orders, setOrders] = useState<Order[]>(seedOrders);
  const [stock, setStock] = useState<StockItem[]>(seedStock);
  const [ledger, setLedger] = useState<LedgerItem[]>(seedLedger);
  const [workers, setWorkers] = useState<WorkerShift[]>(seedWorkers);
  const [selectedOrderId, setSelectedOrderId] = useState(seedOrders[0]?.id ?? "");
  const [form, setForm] = useState<OrderForm>(() => createEmptyForm());
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | ProductionState>("ALL");
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string>(
    `${users[0].name} - ${t("signedIn")} (${users[0].role}).`
  );
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PersistedState;
        setOrders(parsed.orders?.length ? parsed.orders : seedOrders);
        setStock(parsed.stock?.length ? parsed.stock : seedStock);
        setLedger(parsed.ledger?.length ? parsed.ledger : seedLedger);
        setWorkers(parsed.workers?.length ? parsed.workers : seedWorkers);
        setSelectedOrderId(parsed.orders?.[0]?.id ?? seedOrders[0]?.id ?? "");
      } catch {
        setNotice("Local data was reset because the saved payload was invalid.");
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: PersistedState = { orders, stock, ledger, workers };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [hydrated, ledger, orders, stock, workers]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const order = orders.find((item) => item.id === selectedOrderId);
    if (order) {
      setForm(orderToForm(order));
    }
  }, [orders, selectedOrderId]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId),
    [orders, selectedOrderId]
  );

  const orderedOrders = useMemo(
    () =>
      [...orders].sort((a, b) => {
        const priority =
          productionStatePriority[a.state] - productionStatePriority[b.state];
        if (priority !== 0) return priority;
        return daysUntil(a.deliveryDate) - daysUntil(b.deliveryDate);
      }),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orderedOrders.filter((order) => {
      const matchesQuery = !normalized || orderSearchText(order).includes(normalized);
      const matchesState = stateFilter === "ALL" || order.state === stateFilter;
      return matchesQuery && matchesState;
    });
  }, [orderedOrders, query, stateFilter]);

  const stats = useMemo(() => {
    const totalQty = orders.reduce((sum, order) => sum + order.quantity, 0);
    const groupQty = orders.reduce(
      (acc, order) => {
        acc[stateMeta[order.state].group] += order.quantity;
        return acc;
      },
      { Prep: 0, Build: 0, Pack: 0, Ship: 0, Done: 0 }
    );
    const dueSoon = orders.filter(
      (order) => daysUntil(order.deliveryDate) <= 3 && order.state !== "ISPORUCENO"
    ).length;
    const avgDocs = orders.length
      ? Math.round(
          orders.reduce((sum, order) => sum + documentCoverage(order), 0) /
            orders.length
        )
      : 0;
    const activeHours = orders.reduce((sum, order) => sum + order.productionHours, 0);
    return { totalQty, groupQty, dueSoon, avgDocs, activeHours };
  }, [orders]);

  const financeSummary = useMemo(() => {
    return ledger.reduce(
      (acc, item) => {
        const open = item.amount - item.paid;
        if (item.kind === "supplier") acc.payable += open;
        if (item.kind === "client") acc.receivable += open;
        if (daysUntil(item.dueDate) < 0 && open > 0) acc.overdue += open;
        return acc;
      },
      { payable: 0, receivable: 0, overdue: 0 }
    );
  }, [ledger]);

  function selectOrder(order: Order, nextView: View = "orders") {
    setSelectedOrderId(order.id);
    setForm(orderToForm(order));
    setActiveView(nextView);
  }

  function updateForm<K extends keyof OrderForm>(key: K, value: OrderForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function saveOrder(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const normalizedId = formatOrderId(form.id);
    if (!normalizedId || !form.client.trim() || !form.requester.trim()) {
      setNotice("Order id, client, and requester are required.");
      return;
    }

    const existing = orders.find((order) => order.id === selectedOrderId);
    const duplicate = orders.some(
      (order) => order.id === normalizedId && order.id !== selectedOrderId
    );
    if (duplicate) {
      setNotice("That order id already exists.");
      return;
    }

    const nextOrder = formToOrder({ ...form, id: normalizedId }, currentUser.name, existing);
    setOrders((previous) => {
      const next = existing
        ? previous.map((order) => (order.id === existing.id ? nextOrder : order))
        : [nextOrder, ...previous];
      return next.sort(
        (a, b) => productionStatePriority[a.state] - productionStatePriority[b.state]
      );
    });
    setSelectedOrderId(nextOrder.id);
    setNotice(existing ? `Order ${nextOrder.id} updated.` : `Order ${nextOrder.id} created.`);
  }

  function createNewOrder() {
    setSelectedOrderId("");
    setForm(createEmptyForm(currentUser.name));
    setActiveView("orders");
    setNotice(`${t("newOrder")} draft.`);
  }

  function createOrderFromRender(payload: {
    requester: string;
    series: string;
    profile: string;
    glass: string;
    panel: string;
    colorInt: string;
    colorExt: string;
    quantity: number;
    note: string;
  }) {
    const id = nextOrderId(orders);
    const next = formToOrder(
      {
        ...createEmptyForm(currentUser.name),
        id,
        client: "RENDER STUDIO",
        requester: payload.requester,
        series: payload.series,
        profile: payload.profile,
        glass: payload.glass,
        panel: payload.panel,
        colorInt: payload.colorInt,
        colorExt: payload.colorExt,
        quantity: String(payload.quantity),
        note: payload.note
      },
      currentUser.name
    );
    setOrders((previous) => [next, ...previous]);
    setSelectedOrderId(next.id);
    setForm(orderToForm(next));
    setActiveView("orders");
    setNotice(`${t("renderProduction")} -> ${t("orders")}: ${next.id}.`);
  }

  function deleteSelectedOrder() {
    if (currentUser.role !== "Admin" || !selectedOrderId) {
      setNotice("Only an admin can delete orders.");
      return;
    }
    setOrders((previous) => previous.filter((order) => order.id !== selectedOrderId));
    setSelectedOrderId(orders.find((order) => order.id !== selectedOrderId)?.id ?? "");
    setForm(createEmptyForm(currentUser.name));
    setNotice(`Order ${selectedOrderId} deleted.`);
  }

  function quickAdvance(order: Order) {
    const currentIndex = productionStates.indexOf(order.state);
    const nextState =
      productionStates[Math.min(currentIndex + 1, productionStates.length - 1)];
    updateOrderState(order.id, nextState);
  }

  function updateOrderState(orderId: string, state: ProductionState) {
    setOrders((previous) =>
      previous.map((order) => {
        if (order.id !== orderId) return order;
        const next = formToOrder(
          { ...orderToForm(order), state },
          currentUser.name,
          order
        );
        return next;
      })
    );
    setNotice(`Order ${orderId} moved to ${state}.`);
  }

  function attachDocument(key: DocumentKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const nextDocument: OrderDocument = {
      key,
      label: documentLabels[key],
      fileName: file.name,
      uploadedAt: new Date().toISOString()
    };
    setForm((previous) => ({
      ...previous,
      documents: { ...previous.documents, [key]: nextDocument }
    }));
    if (selectedOrderId) {
      setOrders((previous) =>
        previous.map((order) =>
          order.id === selectedOrderId
            ? {
                ...order,
                documents: { ...order.documents, [key]: nextDocument }
              }
            : order
        )
      );
      setNotice(`${documentLabel(key)} attached to order ${selectedOrderId}.`);
    }
    event.target.value = "";
  }

  function removeDocument(key: DocumentKey) {
    const nextDocument: OrderDocument = { key, label: documentLabel(key) };
    setForm((previous) => ({
      ...previous,
      documents: { ...previous.documents, [key]: nextDocument }
    }));
    if (selectedOrderId) {
      setOrders((previous) =>
        previous.map((order) =>
          order.id === selectedOrderId
            ? {
                ...order,
                documents: { ...order.documents, [key]: nextDocument }
              }
            : order
        )
      );
    }
    setNotice(`${documentLabel(key)} removed from order ${selectedOrderId}.`);
  }

  function moveStock(itemId: string, direction: "receive" | "issue") {
    setStock((previous) =>
      previous.map((item) => {
        if (item.id !== itemId) return item;
        const delta = direction === "receive" ? 10 : -10;
        return {
          ...item,
          onHand: Math.max(0, item.onHand + delta),
          reserved: direction === "issue" ? Math.max(0, item.reserved - 5) : item.reserved
        };
      })
    );
    setNotice(direction === "receive" ? "Stock received." : "Stock issued.");
  }

  async function attachStockTexture(
    itemId: string,
    event: ChangeEvent<HTMLInputElement>
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const textureImage = await createMaterialTextureDataUrl(file);
      setStock((previous) =>
        previous.map((item) =>
          item.id === itemId
            ? {
                ...item,
                textureImage,
                textureName: file.name,
                textureUploadedAt: new Date().toISOString()
              }
            : item
        )
      );
      setNotice(`${t("materialTexture")} ${file.name} -> ${itemId}.`);
    } catch {
      setNotice("Texture image could not be saved.");
    } finally {
      input.value = "";
    }
  }

  function removeStockTexture(itemId: string) {
    setStock((previous) =>
      previous.map((item) =>
        item.id === itemId
          ? {
              ...item,
              textureImage: undefined,
              textureName: undefined,
              textureUploadedAt: undefined
            }
          : item
      )
    );
    setNotice(`${t("materialTexture")} removed from ${itemId}.`);
  }

  function recordPayment(itemId: string) {
    setLedger((previous) =>
      previous.map((item) => {
        if (item.id !== itemId) return item;
        const open = item.amount - item.paid;
        return { ...item, paid: Math.min(item.amount, item.paid + Math.min(1000, open)) };
      })
    );
    setNotice("Payment entry recorded.");
  }

  function rotateWorkerStatus(workerId: string) {
    setWorkers((previous) =>
      previous.map((worker) => {
        if (worker.id !== workerId) return worker;
        const nextStatus =
          worker.status === "Active"
            ? "Paused"
            : worker.status === "Paused"
              ? "Ready"
              : "Active";
        return {
          ...worker,
          status: nextStatus,
          shiftHours:
            nextStatus === "Active"
              ? Math.round((worker.shiftHours + 0.25) * 100) / 100
              : worker.shiftHours
        };
      })
    );
    setNotice("Worker station updated.");
  }

  function handleSignOut() {
    setNotice(`${currentUser.name} - ${t("signOut")}.`);
  }

  function exportData() {
    const payload: PersistedState = { orders, stock, ledger, workers };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `productionpilot-${toDateInput(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Workspace data exported.");
  }

  const activeNav = navItems.find((item) => item.id === activeView);
  const viewTitle = activeNav ? t(activeNav.labelKey) : t("control");
  const localizedDate = dateLabels[language];
  const formattedDate = `${String(now.getDate()).padStart(2, "0")} ${
    localizedDate.months[now.getMonth()]
  }, ${localizedDate.weekdays[now.getDay()]}`;
  const compactDate = formattedDate;
  const documentLabel = (key: DocumentKey) =>
    localizedDocumentLabels[language][key] ?? documentLabels[key];
  const ledgerKindLabel = (kind: LedgerItem["kind"]) =>
    kind === "supplier" ? t("supplier") : t("customer");
  const workerStatusLabel = (status: WorkerShift["status"]) =>
    status === "Active"
      ? t("activeStatus")
      : status === "Ready"
        ? t("readyStatus")
        : t("pausedStatus");
  const workerStationLabel = (station: string) => {
    const normalized = station.toLowerCase();
    if (normalized === "cutting") return t("cutting");
    if (normalized === "welding") return t("welding");
    if (normalized === "packing") return t("packing");
    if (normalized === "quality") return t("quality");
    return station;
  };

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="ProductionPilot navigation">
        <div className="brand-block">
          <BrandLogo className="brand-logo" />
          <span>Production Management Systems</span>
        </div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={classNames(activeView === item.id && "active")}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <Icon size={18} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-status">
          <div className="sidebar-user-row">
            <div>
              <span>{t("signedIn")}</span>
              <strong>{currentUser.name}</strong>
              <small>{currentUser.role}</small>
            </div>
            <ShieldCheck size={18} />
          </div>
          <button className="sidebar-logout" onClick={handleSignOut} type="button">
            <LogOut size={15} />
            <span>{t("signOut")}</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <IconButton
              className="mobile-menu-button"
              onClick={() => setNavMenuOpen((open) => !open)}
              title="Menu"
            >
              <Menu size={18} />
            </IconButton>
            <BrandLogo className="topbar-logo" />
            <div className="topbar-title-copy">
              <p className="topbar-date">{formattedDate}</p>
              <h2>{viewTitle}</h2>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={18} />
              <input
                aria-label={t("search")}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                value={query}
              />
            </div>
            <label className="language-switcher" title={t("language")}>
              <select
                aria-label={t("language")}
                onChange={(event) => setLanguage(event.target.value as Language)}
                value={language}
              >
                {languages.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <IconButton onClick={createNewOrder} title={t("newOrder")}>
              <Plus size={18} />
            </IconButton>
            <IconButton
              className="print-action"
              onClick={() => window.print()}
              title={t("printView")}
            >
              <Printer size={18} />
            </IconButton>
            <span className="mobile-date-chip">{compactDate}</span>
            <IconButton
              className="download-action"
              onClick={exportData}
              title={t("exportData")}
            >
              <Download size={18} />
            </IconButton>
          </div>
        </header>

        <nav
          aria-label="Compact navigation"
          className={classNames("mobile-nav-menu", navMenuOpen && "open")}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={classNames(activeView === item.id && "active")}
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setNavMenuOpen(false);
                }}
                type="button"
              >
                <Icon size={18} />
                <span>{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>

        <div className="body-view-heading">
          <p>{formattedDate}</p>
          <h1>{viewTitle}</h1>
        </div>

        <div className="notice-bar">
          <Bell size={16} />
          <span>{notice}</span>
        </div>

        {activeView === "dashboard" ? renderDashboard() : null}
        {activeView === "orders" ? renderOrders() : null}
        {activeView === "monitor" ? renderMonitor() : null}
        {activeView === "render" ? renderProductionRender() : null}
        {activeView === "documents" ? renderDocuments() : null}
        {activeView === "stock" ? renderStock() : null}
        {activeView === "finance" ? renderFinance() : null}
        {activeView === "workers" ? renderWorkers() : null}

        <footer className="app-footer">
          Copyright 2026 AK Solutions &amp; ZEDA&apos;S Group LTD. All rights reserved.
        </footer>
      </section>
    </main>
  );

  function renderDashboard() {
    const urgentOrders = orders
      .filter((order) => order.state !== "ISPORUCENO")
      .sort((a, b) => daysUntil(a.deliveryDate) - daysUntil(b.deliveryDate))
      .slice(0, 5);

    return (
      <section className="view-stack">
        <div className="metric-grid">
          <article className="metric-card accent-green">
            <Factory size={22} />
            <span>{t("totalUnits")}</span>
            <strong>{stats.totalQty}</strong>
            <small>{orders.length} {t("activeOrders")}</small>
          </article>
          <article className="metric-card accent-amber">
            <Gauge size={22} />
            <span>{t("inProduction")}</span>
            <strong>{stats.groupQty.Build}</strong>
            <small>{stats.activeHours.toFixed(1)} {t("loggedHours")}</small>
          </article>
          <article className="metric-card accent-blue">
            <FileText size={22} />
            <span>{t("docCoverage")}</span>
            <strong>{stats.avgDocs}%</strong>
            <small>{t("acrossAllOrderPacks")}</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>{t("duePressure")}</span>
            <strong>{stats.dueSoon}</strong>
            <small>{t("ordersDueIn3Days")}</small>
          </article>
        </div>

        <div className="dashboard-grid">
          <section className="panel wide-panel">
            <div className="panel-heading">
              <div>
                <p>{t("priorityFlow")}</p>
                <h3>{t("productionPipeline")}</h3>
              </div>
              <Activity size={20} />
            </div>
            <div className="pipeline">
              {productionStates.map((state) => {
                const stateOrders = orders.filter((order) => order.state === state);
                const units = stateOrders.reduce((sum, order) => sum + order.quantity, 0);
                return (
                  <button
                    className={classNames("pipeline-step", stateMeta[state].tone)}
                    key={state}
                    onClick={() => {
                      setStateFilter(state);
                      setActiveView("orders");
                    }}
                    type="button"
                  >
                    <span>{stateTranslations[language][state] ?? state}</span>
                    <strong>{units}</strong>
                    <small>{stateOrders.length} {t("ordersCount")}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p>{t("attention")}</p>
                <h3>{t("nextMoves")}</h3>
              </div>
              <CalendarClock size={20} />
            </div>
            <div className="task-list">
              {urgentOrders.map((order) => (
                <button
                  className="task-row"
                  key={order.id}
                  onClick={() => selectOrder(order)}
                  type="button"
                >
                  <span>
                    <strong>{order.id}</strong>
                    <small>{order.client}</small>
                  </span>
                  <StatusPill language={language} state={order.state} />
                  <em>{daysUntil(order.deliveryDate)}d</em>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p>{t("finance")}</p>
                <h3>{t("openLedger")}</h3>
              </div>
              <Wallet size={20} />
            </div>
            <div className="finance-strip">
              <div>
                <span>{t("receivable")}</span>
                <strong>{currency.format(financeSummary.receivable)}</strong>
              </div>
              <div>
                <span>{t("payable")}</span>
                <strong>{currency.format(financeSummary.payable)}</strong>
              </div>
              <div>
                <span>{t("overdue")}</span>
                <strong>{currency.format(financeSummary.overdue)}</strong>
              </div>
            </div>
          </section>

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div>
                <p>{t("shopFloor")}</p>
                <h3>{t("workerTimes")}</h3>
              </div>
              <HardHat size={20} />
            </div>
            <div className="worker-strip">
              {workers.map((worker) => (
                <button
                  className={classNames("worker-tile", worker.status.toLowerCase())}
                  key={worker.id}
                  onClick={() => rotateWorkerStatus(worker.id)}
                  type="button"
                >
                  <span>{worker.name}</span>
                  <strong>{workerStationLabel(worker.station)}</strong>
                  <small>{worker.activeOrderId} - {worker.efficiency}%</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderOrders() {
    return (
      <section className="orders-layout">
        <div className="orders-main">
          <div className="table-toolbar">
            <div>
              <h3>{t("orderBoard")}</h3>
              <p>{filteredOrders.length} {t("rowsSortedByPriority")}</p>
            </div>
            <label className="select-filter">
              <Filter size={16} />
              <select
                onChange={(event) =>
                  setStateFilter(event.target.value as "ALL" | ProductionState)
                }
                value={stateFilter}
              >
                <option value="ALL">{t("allStates")}</option>
                {productionStates.map((state) => (
                  <option key={state} value={state}>
                    {stateTranslations[language][state] ?? state}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("orderNumber")}</th>
                  <th>{t("client")}</th>
                  <th>{t("requester")}</th>
                  <th>{t("series")}</th>
                  <th>{t("quantity")}</th>
                  <th>{t("state")}</th>
                  <th>{t("delivery")}</th>
                  <th>{t("docs")}</th>
                  <th aria-label={t("actions")} />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    className={classNames(
                      selectedOrderId === order.id && "selected",
                      `row-${stateMeta[order.state].tone}`
                    )}
                    key={order.id}
                  >
                    <td>
                      <button
                        className="link-button"
                        onClick={() => selectOrder(order)}
                        type="button"
                      >
                        {order.id}
                      </button>
                    </td>
                    <td>{order.client}</td>
                    <td>{order.requester}</td>
                    <td>{order.series}</td>
                    <td>{order.quantity}</td>
                    <td>
                      <StatusPill language={language} state={order.state} />
                    </td>
                    <td>
                      <span className={classNames(daysUntil(order.deliveryDate) <= 2 && "hot-date")}>
                        {order.deliveryDate}
                      </span>
                    </td>
                    <td>{documentCoverage(order)}%</td>
                    <td>
                      <IconButton onClick={() => quickAdvance(order)} title={t("advanceOrder")}>
                        <ChevronRight size={16} />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form className="order-editor" onSubmit={saveOrder}>
          <div className="editor-heading">
            <div>
              <p>{selectedOrder ? t("selectedOrder") : t("newOrder")}</p>
              <h3>{form.id || t("draft")}</h3>
            </div>
            <StatusPill language={language} state={form.state} />
          </div>

          <div className="form-grid">
            <Field label={t("orderNumber")}>
              <input
                onChange={(event) => updateForm("id", formatOrderId(event.target.value))}
                value={form.id}
              />
            </Field>
            <Field label={t("orderDate")}>
              <input
                onChange={(event) => updateForm("orderDate", event.target.value)}
                type="date"
                value={form.orderDate}
              />
            </Field>
            <Field label={t("client")}>
              <input
                onChange={(event) => updateForm("client", event.target.value)}
                value={form.client}
              />
            </Field>
            <Field label={t("requester")}>
              <input
                onChange={(event) => updateForm("requester", event.target.value)}
                value={form.requester}
              />
            </Field>
            <Field label={t("series")}>
              <select
                onChange={(event) => updateForm("series", event.target.value)}
                value={form.series}
              >
                <option value="">-</option>
                {legacyCatalog.productSeries.map((series) => (
                  <option key={series} value={series}>
                    {series}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("profile")}>
              <select
                onChange={(event) => updateForm("profile", event.target.value)}
                value={form.profile}
              >
                <option value="">-</option>
                {legacyCatalog.materialStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("quantity")}>
              <input
                min="0"
                onChange={(event) => updateForm("quantity", event.target.value)}
                type="number"
                value={form.quantity}
              />
            </Field>
            <Field label={t("state")}>
              <select
                onChange={(event) => updateForm("state", event.target.value as ProductionState)}
                value={form.state}
              >
                {productionStates.map((state) => (
                  <option key={state} value={state}>
                    {stateTranslations[language][state] ?? state}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("manufacture")}>
              <input
                onChange={(event) => updateForm("manufacturingDate", event.target.value)}
                type="date"
                value={form.manufacturingDate}
              />
            </Field>
            <Field label={t("delivery")}>
              <input
                onChange={(event) => updateForm("deliveryDate", event.target.value)}
                type="date"
                value={form.deliveryDate}
              />
            </Field>
            <Field label={t("hours")}>
              <input
                min="0"
                onChange={(event) => updateForm("productionHours", event.target.value)}
                step="0.1"
                type="number"
                value={form.productionHours}
              />
            </Field>
            <Field label={t("user")}>
              <input readOnly value={currentUser.name} />
            </Field>
            <Field label={t("glass")}>
              <select
                onChange={(event) => updateForm("glass", event.target.value)}
                value={form.glass}
              >
                <option value="">-</option>
                {legacyCatalog.glassStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("hardware")}>
              <select
                onChange={(event) => updateForm("hardware", event.target.value)}
                value={form.hardware}
              >
                <option value="">-</option>
                {legacyCatalog.materialStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("colorIn")}>
              <select
                onChange={(event) => updateForm("colorInt", event.target.value)}
                value={form.colorInt}
              >
                <option value="">-</option>
                {legacyCatalog.colors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("colorOut")}>
              <select
                onChange={(event) => updateForm("colorExt", event.target.value)}
                value={form.colorExt}
              >
                <option value="">-</option>
                {legacyCatalog.colors.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("reinforcement")}>
              <select
                onChange={(event) => updateForm("reinforcement", event.target.value)}
                value={form.reinforcement}
              >
                <option value="">-</option>
                {legacyCatalog.materialStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("panel")}>
              <select
                onChange={(event) => updateForm("panel", event.target.value)}
                value={form.panel}
              >
                <option value="">-</option>
                {legacyCatalog.panelStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("driver")}>
              <input
                onChange={(event) => updateForm("driverName", event.target.value)}
                value={form.driverName}
              />
            </Field>
            <Field label={t("driverPhone")}>
              <input
                onChange={(event) => updateForm("driverPhone", event.target.value)}
                value={form.driverPhone}
              />
            </Field>
            <Field label={t("note")} wide>
              <textarea
                onChange={(event) => updateForm("note", event.target.value)}
                rows={3}
                value={form.note}
              />
            </Field>
          </div>

          <div className="doc-rack compact">
            {documentKeys.slice(0, 10).map((key) => (
              <label
                className={classNames("doc-chip", form.documents[key]?.fileName && "ready")}
                key={key}
                title={form.documents[key]?.fileName ?? documentLabel(key)}
              >
                <input
                  accept={key.includes("Slika") ? "image/*" : "application/pdf,image/*"}
                  onChange={(event) => attachDocument(key, event)}
                  type="file"
                />
                <Upload size={14} />
                <span>{documentLabel(key)}</span>
                {form.documents[key]?.fileName ? <Check size={14} /> : null}
              </label>
            ))}
          </div>

          <div className="editor-actions">
            <button className="primary-action" type="submit">
              <Save size={17} />
              {t("save")}
            </button>
            <button className="soft-action" onClick={createNewOrder} type="button">
              <Undo2 size={17} />
              {t("reset")}
            </button>
            <button
              className="danger-action"
              disabled={currentUser.role !== "Admin" || !selectedOrderId}
              onClick={deleteSelectedOrder}
              type="button"
            >
              <Trash2 size={17} />
              {t("delete")}
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderMonitor() {
    const monitorLanes: Array<{
      label: string;
      subtitle: string;
      states: ProductionState[];
      icon: LucideIcon;
      tone: "prep" | "build" | "pack" | "ship" | "done";
    }> = [
      {
        label: t("lanePrep"),
        subtitle: t("lanePrepSubtitle"),
        states: ["U PRIPREMI"],
        icon: ClipboardList,
        tone: "prep"
      },
      {
        label: t("laneBuild"),
        subtitle: t("laneBuildSubtitle"),
        states: ["U PROIZVODNJI", "SREZANO", "OBRADJENO", "ZAVARENO", "OKOVANO"],
        icon: Factory,
        tone: "build"
      },
      {
        label: t("laneFinish"),
        subtitle: t("laneFinishSubtitle"),
        states: ["POSTAKLANO", "SPAKOVANO"],
        icon: Package,
        tone: "pack"
      },
      {
        label: t("laneLogistics"),
        subtitle: t("laneLogisticsSubtitle"),
        states: ["POSLANO"],
        icon: Truck,
        tone: "ship"
      },
      {
        label: t("laneClosed"),
        subtitle: t("laneClosedSubtitle"),
        states: ["ISPORUCENO"],
        icon: ShieldCheck,
        tone: "done"
      }
    ];
    const monitorGroupLabels: Record<string, string> = {
      Prep: t("lanePrep"),
      Build: t("laneBuild"),
      Pack: t("laneFinish"),
      Ship: t("laneLogistics"),
      Done: t("laneClosed")
    };
    const activeUnits = Math.max(0, stats.totalQty - stats.groupQty.Done);
    const activeWorkers = workers.filter((worker) => worker.status === "Active").length;
    const averageEfficiency = workers.length
      ? Math.round(
          workers.reduce((sum, worker) => sum + worker.efficiency, 0) /
            workers.length
        )
      : 0;
    const bottleneck = Object.entries(stats.groupQty)
      .filter(([group]) => group !== "Done")
      .sort((a, b) => b[1] - a[1])[0];
    const nextDeparture = orderedOrders.find((order) => order.state !== "ISPORUCENO");
    const monitorTime = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });

    return (
      <section className="monitor-view">
        <div className="monitor-header monitor-hero">
          <div>
            <p>{t("monitorHeroKicker")}</p>
            <h3>{t("monitorHeroTitle")}</h3>
            <span>{t("monitorHeroSubtitle")}</span>
          </div>
          <div className="monitor-clock">
            <Clock3 size={20} />
            <strong>{monitorTime}</strong>
            <span>{compactDate}</span>
          </div>
        </div>

        <div className="monitor-board-grid">
          <article className="monitor-kpi accent-green">
            <Factory size={22} />
            <span>{t("activeInFlow")}</span>
            <strong>{activeUnits}</strong>
            <small>{orders.filter((order) => order.state !== "ISPORUCENO").length} {t("openOrders")}</small>
          </article>
          <article className="monitor-kpi accent-amber">
            <AlertTriangle size={22} />
            <span>{t("deliveryPressureLabel")}</span>
            <strong>{stats.dueSoon}</strong>
            <small>{nextDeparture ? `${nextDeparture.id} ${t("dueIn")} ${daysUntil(nextDeparture.deliveryDate)}d` : t("noPressure")}</small>
          </article>
          <article className="monitor-kpi accent-blue">
            <FileText size={22} />
            <span>{t("documentation")}</span>
            <strong>{stats.avgDocs}%</strong>
            <small>{t("averagePackReadiness")}</small>
          </article>
          <article className="monitor-kpi accent-violet">
            <HardHat size={22} />
            <span>{t("shopFloor")}</span>
            <strong>{averageEfficiency}%</strong>
            <small>{activeWorkers}/{workers.length} {t("activeWorkersLabel")}</small>
          </article>
          <article className="monitor-kpi accent-red">
            <Timer size={22} />
            <span>{t("bottleneckLabel")}</span>
            <strong>{bottleneck?.[1] ?? 0}</strong>
            <small>
              {bottleneck ? `${monitorGroupLabels[bottleneck[0]] ?? bottleneck[0]} ${t("piecesInFocus")}` : t("clearFlow")}
            </small>
          </article>
        </div>

        <div className="monitor-lanes">
          {monitorLanes.map((lane) => {
            const Icon = lane.icon;
            const laneOrders = orderedOrders.filter((order) =>
              lane.states.includes(order.state)
            );
            const laneQty = laneOrders.reduce((sum, order) => sum + order.quantity, 0);
            return (
              <section className={classNames("monitor-lane", lane.tone)} key={lane.label}>
                <div className="monitor-lane-head">
                  <span>
                    <Icon size={18} />
                    {lane.label}
                  </span>
                  <strong>{laneQty}</strong>
                </div>
                <p>{lane.subtitle}</p>
                <div className="monitor-lane-stack">
                  {laneOrders.length ? (
                    laneOrders.slice(0, 4).map((order) => {
                      const progress = productionStatePriority[order.state] * 10;
                      return (
                        <button
                          className="monitor-order-card"
                          key={order.id}
                          onClick={() => selectOrder(order)}
                          type="button"
                        >
                          <span className="monitor-order-top">
                            <strong>{order.id}</strong>
                            <em>{daysUntil(order.deliveryDate)}d</em>
                          </span>
                          <span className="monitor-order-client">{order.client}</span>
                          <span className="monitor-order-meta">
                            <small>{order.quantity} kom</small>
                            <small>{order.profile}</small>
                            <small>{order.productionHours.toFixed(1)}h</small>
                          </span>
                          <span className="monitor-progress" aria-hidden="true">
                            <span style={{ width: `${progress}%` }} />
                          </span>
                          <StatusPill language={language} state={order.state} />
                        </button>
                      );
                    })
                  ) : (
                    <span className="monitor-empty">{t("noWaiting")}</span>
                  )}
                  {laneOrders.length > 4 ? (
                    <button
                      className="monitor-more"
                      onClick={() => {
                        setStateFilter(lane.states[0]);
                        setActiveView("orders");
                      }}
                      type="button"
                    >
                      +{laneOrders.length - 4} {t("moreInQueue")}
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        <section className="monitor-radar">
          <div className="monitor-section-head">
            <div>
              <p>{t("workerTimes")}</p>
              <h3>{t("stationsActiveOrders")}</h3>
            </div>
            <Gauge size={20} />
          </div>
          <div className="monitor-worker-grid">
            {workers.map((worker) => {
              const workerOrder = orders.find(
                (order) => order.id === worker.activeOrderId
              );
              return (
                <button
                  className={classNames(
                    "monitor-worker-card",
                    worker.status.toLowerCase()
                  )}
                  key={worker.id}
                  onClick={() => {
                    if (workerOrder) selectOrder(workerOrder);
                  }}
                  type="button"
                >
                  <span>
                    <strong>{worker.name}</strong>
                    <small>{workerStationLabel(worker.station)}</small>
                  </span>
                  <em>{workerStatusLabel(worker.status)}</em>
                  <div className="worker-load-bar" aria-hidden="true">
                    <span style={{ width: `${worker.efficiency}%` }} />
                  </div>
                  <small>{worker.activeOrderId} - {worker.shiftHours.toFixed(1)}h - {worker.efficiency}%</small>
                </button>
              );
            })}
          </div>
        </section>

        <section className="monitor-table-card">
          <div className="monitor-section-head">
            <div>
              <p>{t("orderBoard")}</p>
              <h3>{t("productionPipeline")}</h3>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="monitor-table">
            <table>
              <thead>
                <tr>
                  <th>{t("orderNumber")}</th>
                  <th>{t("client")}</th>
                  <th>{t("requester")}</th>
                  <th>{t("series")}</th>
                  <th>{t("profile")}</th>
                  <th>{t("glass")}</th>
                  <th>{t("quantity")}</th>
                  <th>{t("delivery")}</th>
                  <th>{t("hours")}</th>
                  <th>{t("state")}</th>
                </tr>
              </thead>
              <tbody>
                {orderedOrders.map((order) => (
                  <tr className={`monitor-${stateMeta[order.state].tone}`} key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.client}</td>
                    <td>{order.requester}</td>
                    <td>{order.series}</td>
                    <td>{order.profile}</td>
                    <td>{order.glass}</td>
                    <td>{order.quantity}</td>
                    <td>{order.deliveryDate}</td>
                    <td>{order.productionHours.toFixed(1)}</td>
                    <td>{stateTranslations[language][order.state] ?? order.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  function renderProductionRender() {
    return (
      <ProductionRenderer
        language={language}
        onCreateOrder={createOrderFromRender}
        stock={stock}
      />
    );
  }

  function renderDocuments() {
    const documentOrder = selectedOrder;
    const documentPack = documentOrder?.documents ?? createDocuments();

    return (
      <section className="view-stack">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>{t("documentControl")}</p>
              <h3>{t("readinessMatrix")}</h3>
            </div>
            <FileText size={20} />
          </div>
          <div className="doc-grid">
            {orderedOrders.map((order) => (
              <button
                className={classNames("doc-order", selectedOrderId === order.id && "selected")}
                key={order.id}
                onClick={() => selectOrder(order, "documents")}
                type="button"
              >
                <span>
                  <strong>{order.id}</strong>
                  <small>{order.client}</small>
                </span>
                <meter max="100" min="0" value={documentCoverage(order)} />
                <em>{documentCoverage(order)}%</em>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>
                {documentOrder
                  ? `${documentOrder.id} - ${documentOrder.client}`
                  : t("noOrder")}
              </p>
              <h3>{t("documentPack")}</h3>
            </div>
            <Upload size={20} />
          </div>
          <div className="doc-rack">
            {documentKeys.map((key) => (
              <div
                className={classNames("doc-tile", documentPack[key]?.fileName && "ready")}
                key={key}
              >
                <FileText size={20} />
                <div>
                  <strong>{documentLabel(key)}</strong>
                  <span>{documentPack[key]?.fileName ?? t("missingFile")}</span>
                </div>
                <label className="mini-upload" title={`${t("docs")}: ${documentLabel(key)}`}>
                  <input
                    accept="application/pdf,image/*"
                    disabled={!documentOrder}
                    onChange={(event) => attachDocument(key, event)}
                    type="file"
                  />
                  <Upload size={15} />
                </label>
                {documentPack[key]?.fileName ? (
                  <IconButton onClick={() => removeDocument(key)} title={t("removeFile")}>
                    <XIcon />
                  </IconButton>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function XIcon() {
    return <span className="x-icon">x</span>;
  }

  function renderStock() {
    const stockValue = stock.reduce(
      (sum, item) => sum + item.onHand * item.value,
      0
    );
    return (
      <section className="view-stack">
        <div className="metric-grid three">
          <article className="metric-card accent-green">
            <Package size={22} />
            <span>{t("inventoryValue")}</span>
            <strong>{currency.format(stockValue)}</strong>
            <small>{stock.length} {t("trackedGroups")}</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>{t("reorderAlerts")}</span>
            <strong>{stock.filter((item) => item.onHand <= item.reorderPoint).length}</strong>
            <small>{t("belowReorderPoint")}</small>
          </article>
          <article className="metric-card accent-blue">
            <Boxes size={22} />
            <span>{t("reservedMaterials")}</span>
            <strong>{stock.reduce((sum, item) => sum + item.reserved, 0)}</strong>
            <small>{t("unitsCommitted")}</small>
          </article>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>{t("stock")}</p>
              <h3>{t("materialAvailability")}</h3>
            </div>
            <Database size={20} />
          </div>
          <div className="inventory-list">
            {stock.map((item) => {
              const available = item.onHand - item.reserved;
              return (
                <article
                  className={classNames("inventory-row", item.onHand <= item.reorderPoint && "low")}
                  key={item.id}
                >
                  <div className="inventory-info">
                    <strong>{item.name}</strong>
                    <span>{item.code} - {item.supplier}</span>
                  </div>
                  <div className={classNames("stock-texture-card", item.textureImage && "ready")}>
                    <div
                      className={classNames("stock-texture-preview", !item.textureImage && "empty")}
                      style={
                        item.textureImage
                          ? { backgroundImage: `url(${item.textureImage})` }
                          : undefined
                      }
                    >
                      {!item.textureImage ? <Upload size={16} /> : null}
                    </div>
                    <div>
                      <strong>{t("materialTexture")}</strong>
                      <span>{item.textureName ?? t("noTexture")}</span>
                    </div>
                    <label className="mini-upload" title={t("uploadTexture")}>
                      <input
                        accept="image/*"
                        onChange={(event) => attachStockTexture(item.id, event)}
                        type="file"
                      />
                      <Upload size={15} />
                    </label>
                    {item.textureImage ? (
                      <IconButton onClick={() => removeStockTexture(item.id)} title={t("removeTexture")}>
                        <XIcon />
                      </IconButton>
                    ) : null}
                  </div>
                  <div className="stock-numbers">
                    <span>{t("onHand")} <strong>{item.onHand}</strong></span>
                    <span>{t("reservedMaterials")} <strong>{item.reserved}</strong></span>
                    <span>{t("available")} <strong>{available}</strong></span>
                  </div>
                  <div className="row-actions">
                    <button className="soft-action" onClick={() => moveStock(item.id, "receive")} type="button">
                      <Plus size={16} />
                      {t("receive")}
                    </button>
                    <button className="soft-action" onClick={() => moveStock(item.id, "issue")} type="button">
                      <Truck size={16} />
                      {t("issue")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function renderFinance() {
    return (
      <section className="view-stack">
        <div className="metric-grid three">
          <article className="metric-card accent-blue">
            <Wallet size={22} />
            <span>{t("receivable")}</span>
            <strong>{currency.format(financeSummary.receivable)}</strong>
            <small>{t("openClientBalance")}</small>
          </article>
          <article className="metric-card accent-amber">
            <Wallet size={22} />
            <span>{t("payable")}</span>
            <strong>{currency.format(financeSummary.payable)}</strong>
            <small>{t("openSupplierBalance")}</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>{t("overdue")}</span>
            <strong>{currency.format(financeSummary.overdue)}</strong>
            <small>{t("needsAttention")}</small>
          </article>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>{t("cashFlow")}</p>
              <h3>{t("supplierClientLedger")}</h3>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("type")}</th>
                  <th>{t("name")}</th>
                  <th>{t("invoice")}</th>
                  <th>{t("due")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("paid")}</th>
                  <th>{t("openBalance")}</th>
                  <th aria-label={t("actions")} />
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => {
                  const open = item.amount - item.paid;
                  return (
                    <tr key={item.id}>
                      <td>{ledgerKindLabel(item.kind)}</td>
                      <td>{item.name}</td>
                      <td>{item.invoice}</td>
                      <td className={classNames(daysUntil(item.dueDate) < 0 && open > 0 && "hot-date")}>
                        {item.dueDate}
                      </td>
                      <td>{currency.format(item.amount)}</td>
                      <td>{currency.format(item.paid)}</td>
                      <td>{currency.format(open)}</td>
                      <td>
                        <button
                          className="soft-action compact-action"
                          disabled={open <= 0}
                          onClick={() => recordPayment(item.id)}
                          type="button"
                        >
                          <Check size={16} />
                          {t("pay")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    );
  }

  function renderWorkers() {
    return (
      <section className="view-stack">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>{t("workerTimes")}</p>
              <h3>{t("stationsActiveOrders")}</h3>
            </div>
            <Timer size={20} />
          </div>
          <div className="worker-grid">
            {workers.map((worker) => (
              <article className={classNames("worker-card", worker.status.toLowerCase())} key={worker.id}>
                <div className="worker-card-head">
                  <div>
                    <strong>{worker.name}</strong>
                    <span>{workerStationLabel(worker.station)}</span>
                  </div>
                  <button className="soft-action compact-action" onClick={() => rotateWorkerStatus(worker.id)} type="button">
                    <RefreshCw size={15} />
                    {workerStatusLabel(worker.status)}
                  </button>
                </div>
                <div className="worker-metrics">
                  <span>{t("order")} <strong>{worker.activeOrderId}</strong></span>
                  <span>{t("shift")} <strong>{worker.shiftHours.toFixed(2)}h</strong></span>
                  <span>{t("efficiency")} <strong>{worker.efficiency}%</strong></span>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>{t("qualityHandoff")}</p>
              <h3>{t("stationQueue")}</h3>
            </div>
            <Eye size={20} />
          </div>
          <div className="handoff-list">
            {orders
              .filter((order) => trackedWorkStates.has(order.state))
              .map((order) => (
                <button className="handoff-row" key={order.id} onClick={() => selectOrder(order)} type="button">
                  <span>{order.id}</span>
                  <strong>{order.profile}</strong>
                  <StatusPill language={language} state={order.state} />
                  <em>{order.productionHours.toFixed(1)}h</em>
                </button>
              ))}
          </div>
        </div>
      </section>
    );
  }

}
