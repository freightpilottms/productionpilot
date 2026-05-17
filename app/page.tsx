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
  Menu,
  Monitor,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings,
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
import { legacyCatalog } from "../lib/legacyCatalog";
import {
  languages,
  makeTranslator,
  stateTranslations,
  type Language,
  type TranslationKey
} from "../lib/i18n";

type View =
  | "dashboard"
  | "orders"
  | "monitor"
  | "render"
  | "documents"
  | "stock"
  | "finance"
  | "workers"
  | "settings";

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
  profil: "Narudzba profila",
  ojacanja: "Narudzba ojacanja",
  okovi: "Narudzba okova",
  staklo: "Narudzba stakla",
  panel: "Narudzba panela",
  transport: "Transport",
  izvoz: "Izvoz",
  proforma: "Proforma",
  transportSlika1: "Transport slika 1",
  transportSlika2: "Transport slika 2"
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
  { id: "workers", labelKey: "workers", icon: Users },
  { id: "settings", labelKey: "deploy", icon: Settings }
];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "BAM",
  maximumFractionDigits: 0
});

const languageLocales: Record<Language, string> = {
  bhs: "bs-BA",
  de: "de-DE",
  it: "it-IT",
  es: "es-ES",
  en: "en-US"
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

  function selectOrder(order: Order) {
    setSelectedOrderId(order.id);
    setForm(orderToForm(order));
    setActiveView("orders");
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
      setNotice(`${documentLabels[key]} attached to order ${selectedOrderId}.`);
    }
    event.target.value = "";
  }

  function removeDocument(key: DocumentKey) {
    const nextDocument: OrderDocument = { key, label: documentLabels[key] };
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
    setNotice(`${documentLabels[key]} removed from draft.`);
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

  function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as PersistedState;
        setOrders(parsed.orders ?? seedOrders);
        setStock(parsed.stock ?? seedStock);
        setLedger(parsed.ledger ?? seedLedger);
        setWorkers(parsed.workers ?? seedWorkers);
        setSelectedOrderId(parsed.orders?.[0]?.id ?? "");
        setNotice("Workspace data imported.");
      } catch {
        setNotice("Import failed. The selected file is not valid ProductionPilot JSON.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  function resetDemoData() {
    setOrders(seedOrders);
    setStock(seedStock);
    setLedger(seedLedger);
    setWorkers(seedWorkers);
    setSelectedOrderId(seedOrders[0]?.id ?? "");
    setNotice("Demo data restored.");
  }

  const activeNav = navItems.find((item) => item.id === activeView);
  const viewTitle = activeNav ? t(activeNav.labelKey) : t("control");

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="ProductionPilot navigation">
        <div className="brand-block">
          <img
            alt="ProductionPilot"
            className="brand-logo"
            src="/test.png"
          />
          <span>Production management OS</span>
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
          <span>{t("signedIn")}</span>
          <strong>{currentUser.name}</strong>
          <small>{currentUser.role}</small>
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
            <img
              alt="ProductionPilot"
              className="topbar-logo"
              src="/test.png"
            />
            <div>
              <p>{now.toLocaleDateString(languageLocales[language], { weekday: "long", day: "2-digit", month: "short" })}</p>
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
            <IconButton onClick={() => window.print()} title={t("printView")}>
              <Printer size={18} />
            </IconButton>
            <IconButton onClick={exportData} title={t("exportData")}>
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
        {activeView === "settings" ? renderSettings() : null}
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
            <small>Across all order packs</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>{t("duePressure")}</span>
            <strong>{stats.dueSoon}</strong>
            <small>Orders due in 3 days</small>
          </article>
        </div>

        <div className="dashboard-grid">
          <section className="panel wide-panel">
            <div className="panel-heading">
              <div>
                <p>Priority flow</p>
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
                    <span>{state}</span>
                    <strong>{units}</strong>
                    <small>{stateOrders.length} orders</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p>Attention</p>
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
                <p>Money</p>
                <h3>{t("openLedger")}</h3>
              </div>
              <Wallet size={20} />
            </div>
            <div className="finance-strip">
              <div>
                <span>Receivable</span>
                <strong>{currency.format(financeSummary.receivable)}</strong>
              </div>
              <div>
                <span>Payable</span>
                <strong>{currency.format(financeSummary.payable)}</strong>
              </div>
              <div>
                <span>Overdue</span>
                <strong>{currency.format(financeSummary.overdue)}</strong>
              </div>
            </div>
          </section>

          <section className="panel wide-panel">
            <div className="panel-heading">
              <div>
                <p>{t("shopFloor")}</p>
                <h3>Live worker load</h3>
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
                  <strong>{worker.station}</strong>
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
              <p>{filteredOrders.length} rows sorted by production priority</p>
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
                  <th>Nalog</th>
                  <th>Client</th>
                  <th>Requester</th>
                  <th>Series</th>
                  <th>Qty</th>
                  <th>State</th>
                  <th>Delivery</th>
                  <th>Docs</th>
                  <th aria-label="Actions" />
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
                      <IconButton onClick={() => quickAdvance(order)} title="Advance order">
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
              <h3>{form.id || "Draft"}</h3>
            </div>
            <StatusPill language={language} state={form.state} />
          </div>

          <div className="form-grid">
            <Field label="Nalog">
              <input
                onChange={(event) => updateForm("id", formatOrderId(event.target.value))}
                value={form.id}
              />
            </Field>
            <Field label="Order date">
              <input
                onChange={(event) => updateForm("orderDate", event.target.value)}
                type="date"
                value={form.orderDate}
              />
            </Field>
            <Field label="Client">
              <input
                onChange={(event) => updateForm("client", event.target.value)}
                value={form.client}
              />
            </Field>
            <Field label="Requester">
              <input
                onChange={(event) => updateForm("requester", event.target.value)}
                value={form.requester}
              />
            </Field>
            <Field label="Series">
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
            <Field label="Profile">
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
            <Field label="Quantity">
              <input
                min="0"
                onChange={(event) => updateForm("quantity", event.target.value)}
                type="number"
                value={form.quantity}
              />
            </Field>
            <Field label="State">
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
            <Field label="Manufacture">
              <input
                onChange={(event) => updateForm("manufacturingDate", event.target.value)}
                type="date"
                value={form.manufacturingDate}
              />
            </Field>
            <Field label="Delivery">
              <input
                onChange={(event) => updateForm("deliveryDate", event.target.value)}
                type="date"
                value={form.deliveryDate}
              />
            </Field>
            <Field label="Hours">
              <input
                min="0"
                onChange={(event) => updateForm("productionHours", event.target.value)}
                step="0.1"
                type="number"
                value={form.productionHours}
              />
            </Field>
            <Field label="User">
              <input readOnly value={currentUser.name} />
            </Field>
            <Field label="Glass">
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
            <Field label="Hardware">
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
            <Field label="Color in">
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
            <Field label="Color out">
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
            <Field label="Reinforcement">
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
            <Field label="Panel">
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
            <Field label="Driver">
              <input
                onChange={(event) => updateForm("driverName", event.target.value)}
                value={form.driverName}
              />
            </Field>
            <Field label="Driver phone">
              <input
                onChange={(event) => updateForm("driverPhone", event.target.value)}
                value={form.driverPhone}
              />
            </Field>
            <Field label="Note" wide>
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
                title={form.documents[key]?.fileName ?? documentLabels[key]}
              >
                <input
                  accept={key.includes("Slika") ? "image/*" : "application/pdf,image/*"}
                  onChange={(event) => attachDocument(key, event)}
                  type="file"
                />
                <Upload size={14} />
                <span>{documentLabels[key]}</span>
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
    return (
      <section className="monitor-view">
        <div className="monitor-header">
          <div>
            <p>Production monitor</p>
            <h3>Live factory board</h3>
          </div>
          <strong>{now.toLocaleTimeString("en-GB")}</strong>
        </div>
        <div className="monitor-stats">
          <span>U PRIPREMI: {stats.groupQty.Prep}</span>
          <span>U IZRADI: {stats.groupQty.Build}</span>
          <span>SPAKOVANO: {stats.groupQty.Pack}</span>
          <span>POSLANO: {stats.groupQty.Ship}</span>
          <span>ISPORUCENO: {stats.groupQty.Done}</span>
          <span>UKUPNO: {stats.totalQty}</span>
        </div>
        <div className="monitor-table">
          <table>
            <thead>
              <tr>
                <th>NALOG</th>
                <th>KLIJENT</th>
                <th>NARUCILAC</th>
                <th>SERIJA</th>
                <th>PROFIL</th>
                <th>STAKLO</th>
                <th>KOLICINA</th>
                <th>ISPORUKA</th>
                <th>SATI</th>
                <th>STANJE</th>
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
                  <td>{order.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    return (
      <section className="view-stack">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Document control</p>
              <h3>Readiness matrix</h3>
            </div>
            <FileText size={20} />
          </div>
          <div className="doc-grid">
            {orderedOrders.map((order) => (
              <button
                className={classNames("doc-order", selectedOrderId === order.id && "selected")}
                key={order.id}
                onClick={() => selectOrder(order)}
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
              <p>{selectedOrder?.id ?? "No order"}</p>
              <h3>Document pack</h3>
            </div>
            <Upload size={20} />
          </div>
          <div className="doc-rack">
            {documentKeys.map((key) => (
              <div
                className={classNames("doc-tile", form.documents[key]?.fileName && "ready")}
                key={key}
              >
                <FileText size={20} />
                <div>
                  <strong>{documentLabels[key]}</strong>
                  <span>{form.documents[key]?.fileName ?? "Missing"}</span>
                </div>
                <label className="mini-upload" title={`Attach ${documentLabels[key]}`}>
                  <input
                    accept="application/pdf,image/*"
                    onChange={(event) => attachDocument(key, event)}
                    type="file"
                  />
                  <Upload size={15} />
                </label>
                {form.documents[key]?.fileName ? (
                  <IconButton onClick={() => removeDocument(key)} title="Remove file">
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
            <span>Inventory value</span>
            <strong>{currency.format(stockValue)}</strong>
            <small>{stock.length} tracked groups</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>Reorder alerts</span>
            <strong>{stock.filter((item) => item.onHand <= item.reorderPoint).length}</strong>
            <small>Below reorder point</small>
          </article>
          <article className="metric-card accent-blue">
            <Boxes size={22} />
            <span>Reserved</span>
            <strong>{stock.reduce((sum, item) => sum + item.reserved, 0)}</strong>
            <small>Units committed to orders</small>
          </article>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Magacin</p>
              <h3>Material availability</h3>
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
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.code} - {item.supplier}</span>
                  </div>
                  <div className="stock-numbers">
                    <span>On hand <strong>{item.onHand}</strong></span>
                    <span>Reserved <strong>{item.reserved}</strong></span>
                    <span>Available <strong>{available}</strong></span>
                  </div>
                  <div className="row-actions">
                    <button className="soft-action" onClick={() => moveStock(item.id, "receive")} type="button">
                      <Plus size={16} />
                      Receive
                    </button>
                    <button className="soft-action" onClick={() => moveStock(item.id, "issue")} type="button">
                      <Truck size={16} />
                      Issue
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
            <span>Receivable</span>
            <strong>{currency.format(financeSummary.receivable)}</strong>
            <small>Open client balance</small>
          </article>
          <article className="metric-card accent-amber">
            <Wallet size={22} />
            <span>Payable</span>
            <strong>{currency.format(financeSummary.payable)}</strong>
            <small>Open supplier balance</small>
          </article>
          <article className="metric-card accent-red">
            <AlertTriangle size={22} />
            <span>Overdue</span>
            <strong>{currency.format(financeSummary.overdue)}</strong>
            <small>Needs attention</small>
          </article>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Ulaz / Izlaz</p>
              <h3>Supplier and client ledger</h3>
            </div>
            <BarChart3 size={20} />
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Invoice</th>
                  <th>Due</th>
                  <th>Amount</th>
                  <th>Paid</th>
                  <th>Open</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => {
                  const open = item.amount - item.paid;
                  return (
                    <tr key={item.id}>
                      <td>{item.kind}</td>
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
                          Pay
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
              <p>Worker times</p>
              <h3>Stations and active orders</h3>
            </div>
            <Timer size={20} />
          </div>
          <div className="worker-grid">
            {workers.map((worker) => (
              <article className={classNames("worker-card", worker.status.toLowerCase())} key={worker.id}>
                <div className="worker-card-head">
                  <div>
                    <strong>{worker.name}</strong>
                    <span>{worker.station}</span>
                  </div>
                  <button className="soft-action compact-action" onClick={() => rotateWorkerStatus(worker.id)} type="button">
                    <RefreshCw size={15} />
                    {worker.status}
                  </button>
                </div>
                <div className="worker-metrics">
                  <span>Order <strong>{worker.activeOrderId}</strong></span>
                  <span>Shift <strong>{worker.shiftHours.toFixed(2)}h</strong></span>
                  <span>Efficiency <strong>{worker.efficiency}%</strong></span>
                </div>
              </article>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Quality handoff</p>
              <h3>Station queue</h3>
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

  function renderSettings() {
    return (
      <section className="settings-layout">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Deployment</p>
              <h3>StackBlitz - GitHub - Vercel ready</h3>
            </div>
            <ShieldCheck size={20} />
          </div>
          <div className="readiness-list">
            {[
              "Next.js App Router project at repository root",
              "Vercel config and production build script",
              "Browser-safe data model with import and export",
              "Legacy SQL credentials removed from deployable code",
              "Responsive cockpit UI for desktop and tablet use",
              "Migration map for future database and auth integration"
            ].map((item) => (
              <div className="ready-row" key={item}>
                <Check size={17} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p>Data</p>
              <h3>Workspace controls</h3>
            </div>
            <Database size={20} />
          </div>
          <div className="settings-actions">
            <button className="primary-action" onClick={exportData} type="button">
              <Download size={17} />
              Export JSON
            </button>
            <label className="soft-action file-action">
              <Upload size={17} />
              Import JSON
              <input accept="application/json" onChange={importData} type="file" />
            </label>
            <button className="danger-action" onClick={resetDemoData} type="button">
              <RefreshCw size={17} />
              Restore demo data
            </button>
          </div>
        </div>

        <div className="panel wide-panel">
          <div className="panel-heading">
            <div>
              <p>Migration map</p>
              <h3>What changed from the legacy app</h3>
            </div>
            <ChevronRight size={20} />
          </div>
          <div className="migration-grid">
            <article>
              <strong>OrderSpecsDB</strong>
              <span>Mapped into typed order records with status priority, documents, driver fields, and production-hour accrual.</span>
            </article>
            <article>
              <strong>MonitorView</strong>
              <span>Converted into a live browser monitor that refreshes immediately from the shared order state.</span>
            </article>
            <article>
              <strong>Placeholder modules</strong>
              <span>Inventory, finance, workers, print, and docs are now usable modules instead of disabled buttons.</span>
            </article>
            <article>
              <strong>Deployment model</strong>
              <span>Runs on Vercel without Windows Forms, SQL client assemblies, WebForms, or desktop-only PDF controls.</span>
            </article>
          </div>
        </div>
      </section>
    );
  }
}
