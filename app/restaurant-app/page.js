"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

const restaurantAssets = {
  logo: "/restaurant-logo.svg",
  newOrder: "/restaurant-assets/new-order.svg",
  orders: "/restaurant-assets/orders.svg",
  logout: "/restaurant-assets/logout.svg",
  warning: "/restaurant-assets/warning.svg",
  payment: "/restaurant-assets/payment.svg",
  table: "/restaurant-assets/table.svg",
  chef: "/chef-hat.svg",
  grill: "/restaurant-assets/grill.svg",
  pizza: "/restaurant-assets/pizza.svg",
  cooked: "/restaurant-assets/cooked.svg",
  dessert: "/restaurant-assets/dessert.svg",
  hot: "/restaurant-assets/coffee.svg",
  juice: "/restaurant-assets/soda.svg",
  alcohol: "/restaurant-assets/alcohol.svg",
  kecap: "/restaurant-assets/ketchup.svg",
  majonez: "/restaurant-assets/mayo.svg",
  sos: "/restaurant-assets/sauce.svg",
  kajmak: "/restaurant-assets/kajmak.svg",
  meal: "/restaurant-assets/meal-plate.svg",
  bowl: "/restaurant-assets/bowl.svg",
  drinks: "/restaurant-assets/drinks.svg",
};

function RestaurantIcon({ name, className = "", size = 42, priority = false }) {
  return (
    <Image
      className={`restaurantAssetIcon ${className}`.trim()}
      src={restaurantAssets[name] || restaurantAssets.logo}
      alt=""
      width={size}
      height={size}
      priority={priority}
      unoptimized
    />
  );
}

function categoryIconName(category) {
  return restaurantAssets[category] ? category : "meal";
}

function visualItems(items) {
  return (items || []).filter((item) => restaurantAssets[item.category]);
}

const menu = {
  grill: {
    label: "ROŠTILJ",
    accent: "#e4572e",
    items: [
      { name: "Ćevapi 10", price: 9 },
      { name: "Ražnjići", price: 11 },
      { name: "Pljeskavica", price: 10 },
      { name: "Miješano meso", price: 18 },
    ],
  },
  pizza: {
    label: "PIZZE",
    accent: "#f2a541",
    items: [
      { name: "Margarita", price: 8 },
      { name: "Capricciosa", price: 10 },
      { name: "Miješana", price: 11 },
      { name: "Picante", price: 12 },
    ],
  },
  cooked: {
    label: "KUHANO",
    accent: "#667761",
    items: [
      { name: "Begova čorba", price: 7 },
      { name: "Gulaš", price: 12 },
      { name: "Piletina u sosu", price: 13 },
      { name: "Dnevno jelo", price: 9 },
    ],
  },
  dessert: {
    label: "DESERTI",
    accent: "#b44c7a",
    items: [
      { name: "Čokoladna torta", price: 6 },
      { name: "Baklava", price: 5 },
      { name: "Palačinke", price: 7 },
      { name: "Tiramisu", price: 7 },
    ],
  },
  hot: {
    label: "TOPLI",
    accent: "#6f4e37",
    items: [
      { name: "Kafa", price: 2.5 },
      { name: "Kafa s mlijekom", price: 3 },
      { name: "Čaj", price: 2.5 },
      { name: "Topla čokolada", price: 4 },
    ],
  },
  juice: {
    label: "SOKOVI",
    accent: "#3b82f6",
    items: [
      { name: "Cola", price: 3.5 },
      { name: "Sprite", price: 3.5 },
      { name: "Kisela", price: 2.5 },
      { name: "Limunada", price: 4 },
    ],
  },
  alcohol: {
    label: "ALKOHOL",
    accent: "#7c3aed",
    items: [
      { name: "Pivo", price: 4 },
      { name: "Vino 0.1", price: 5 },
      { name: "Rakija", price: 4 },
      { name: "Aperol", price: 9 },
    ],
  },
};

const addOns = [
  { key: "kecap", label: "Kečap", iconName: "kecap", price: 0.5 },
  { key: "majonez", label: "Majonez", iconName: "majonez", price: 0.5 },
  { key: "sos", label: "Sos", iconName: "sos", price: 1 },
  { key: "kajmak", label: "Kajmak", iconName: "kajmak", price: 1.5 },
];

const initialOrders = [
  {
    id: 1,
    table: "07",
    status: "Plaćeno",
    stage: "done",
    createdAt: "10:24",
    items: [
      { category: "grill", name: "Ćevapi 10", qty: 2, price: 9 },
      { category: "pizza", name: "Margarita", qty: 1, price: 8 },
      { category: "juice", name: "Sprite", qty: 1, price: 3.5 },
      { category: "juice", name: "Cola", qty: 2, price: 3.5 },
    ],
    note: "",
    payment: "Kartica",
    fiscal: true,
  },
  {
    id: 2,
    table: "03",
    status: "Kuhinja",
    stage: "kitchen",
    createdAt: "10:37",
    items: [
      { category: "grill", name: "Miješano meso", qty: 1, price: 18 },
      { category: "juice", name: "Kisela", qty: 2, price: 2.5 },
      { category: "dessert", name: "Čokoladna torta", qty: 1, price: 6 },
    ],
    note: "Bez luka",
    payment: "Gotovina",
    fiscal: false,
  },
  {
    id: 3,
    table: "02",
    status: "Otvoreno",
    stage: "open",
    createdAt: "10:41",
    items: [
      { category: "pizza", name: "Miješana", qty: 1, price: 11 },
      { category: "dessert", name: "Baklava", qty: 1, price: 5 },
    ],
    note: "Kečap",
    payment: "Gotovina",
    fiscal: false,
  },
  {
    id: 4,
    table: "11",
    status: "Spremno",
    stage: "ready",
    createdAt: "10:48",
    items: [
      { category: "grill", name: "Ražnjići", qty: 1, price: 11 },
      { category: "pizza", name: "Margarita", qty: 1, price: 8 },
      { category: "dessert", name: "Čokoladna torta", qty: 1, price: 6 },
    ],
    note: "Kečap, majonez",
    payment: "Kartica",
    fiscal: true,
  },
];

const tables = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];

const stageLabels = {
  open: "Otvoreno",
  kitchen: "Kuhinja",
  ready: "Spremno",
  done: "Plaćeno",
};

const viewTabs = [
  { key: "new", label: "Nova", iconName: "newOrder" },
  { key: "orders", label: "Narudžbe", iconName: "orders" },
  { key: "kitchen", label: "Kuhinja", iconName: "chef" },
  { key: "tables", label: "Stolovi", iconName: "table" },
];

function money(value) {
  return `${Number(value || 0).toLocaleString("bs-BA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} KM`;
}

function orderTotal(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
}

function orderSummary(order) {
  const items = (order.items || []).map((item) => `${item.qty} x ${item.name}`);
  if (order.note) items.push(`NAPOMENA: ${order.note}`);
  return items.join(", ");
}

function emptySelections() {
  return Object.fromEntries(
    Object.keys(menu).map((key) => [key, { name: "", qty: 0, price: 0 }])
  );
}

function stageRank(stage) {
  if (stage === "kitchen") return 1;
  if (stage === "ready") return 2;
  if (stage === "open") return 3;
  return 4;
}

function nextOrderId(orders) {
  return Math.max(5, ...orders.map((order) => Number(order.id || 0))) + 1;
}

function todayLabel() {
  return new Date().toLocaleDateString("bs-BA", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function formatTableCount(value) {
  const count = Number(value || 0);
  const mod100 = Math.abs(count) % 100;
  const mod10 = Math.abs(count) % 10;

  if (mod100 >= 11 && mod100 <= 14) return `${count} stolova`;
  if (mod10 === 1) return `${count} sto`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} stola`;
  return `${count} stolova`;
}

export default function RestaurantApp() {
  const router = useRouter();
  const [deviceGate, setDeviceGate] = useState({ ready: false, blocked: false });
  const [view, setView] = useState("new");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [orders, setOrders] = useState(initialOrders);
  const [orderId, setOrderId] = useState(6);
  const [table, setTable] = useState("00");
  const [selections, setSelections] = useState(() => emptySelections());
  const [selectedAddOns, setSelectedAddOns] = useState({});
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState("");
  const [fiscal, setFiscal] = useState(false);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    document.body.classList.add("restaurantBody");
    return () => document.body.classList.remove("restaurantBody");
  }, []);

  useEffect(() => {
    function updateDeviceGate() {
      const width = window.innerWidth || document.documentElement.clientWidth || 0;
      const desktopPointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      setDeviceGate({
        ready: true,
        blocked: width >= 1100 && desktopPointer,
      });
    }

    updateDeviceGate();
    window.addEventListener("resize", updateDeviceGate);
    return () => window.removeEventListener("resize", updateDeviceGate);
  }, []);

  const selectedItems = useMemo(() => {
    const food = Object.entries(selections)
      .map(([category, item]) => ({ ...item, category }))
      .filter((item) => item.name && Number(item.qty || 0) > 0);
    const extras = addOns
      .filter((item) => selectedAddOns[item.key])
      .map((item) => ({ category: "addon", name: item.label, qty: 1, price: item.price }));
    return [...food, ...extras];
  }, [selectedAddOns, selections]);

  const total = selectedItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const hasFood = selectedItems.some((item) => item.category !== "addon");
  const canSubmit = hasFood && table !== "00";
  const openOrders = orders
    .slice()
    .sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || b.id - a.id);
  const activeOrders = openOrders.filter((order) => order.stage !== "done");
  const kitchenOrders = openOrders.filter((order) => order.stage === "kitchen" || order.stage === "ready");
  const occupiedTables = new Map(activeOrders.map((order) => [order.table, order]));
  const dailyRevenue = orders.filter((order) => order.stage === "done").reduce((sum, order) => sum + orderTotal(order), 0);
  const kitchenCount = orders.filter((order) => order.stage === "kitchen").length;
  const readyCount = orders.filter((order) => order.stage === "ready").length;
  const displayItems = visualItems(selectedItems);

  const viewTitle = view === "new"
    ? editingId ? "Izmijeni narudžbu" : "Nova narudžba"
    : view === "orders" ? "Prethodne narudžbe"
    : view === "kitchen" ? "Kuhinja"
    : "Stolovi";

  function setSelection(category, name) {
    const item = menu[category].items.find((x) => x.name === name);
    setSelections((current) => ({
      ...current,
      [category]: item
        ? { name: item.name, price: item.price, qty: current[category]?.qty || 1 }
        : { name: "", price: 0, qty: 0 },
    }));
  }

  function setQty(category, value) {
    const qty = Math.max(0, Math.min(20, Number(value || 0)));
    setSelections((current) => ({
      ...current,
      [category]: {
        ...current[category],
        qty,
      },
    }));
  }

  function adjustQty(category, delta) {
    setQty(category, Number(selections[category]?.qty || 0) + delta);
  }

  function resetForm(nextId = nextOrderId(orders)) {
    setOrderId(nextId);
    setTable("00");
    setSelections(emptySelections());
    setSelectedAddOns({});
    setNote("");
    setPayment("");
    setFiscal(false);
    setEditingId(null);
  }

  function openView(nextView) {
    setView(nextView);
    setDrawerOpen(false);
  }

  function editOrder(order) {
    setEditingId(order.id);
    setOrderId(order.id);
    setTable(order.table);
    const next = emptySelections();
    (order.items || []).forEach((item) => {
      if (menu[item.category]) {
        next[item.category] = { name: item.name, qty: item.qty, price: item.price };
      }
    });
    setSelections(next);
    setSelectedAddOns(
      Object.fromEntries(
        (order.items || [])
          .filter((item) => item.category === "addon")
          .map((item) => {
            const match = addOns.find((addon) => addon.label === item.name);
            return [match?.key || item.name, true];
          })
      )
    );
    setNote(order.note || "");
    setPayment(order.payment || "");
    setFiscal(Boolean(order.fiscal));
    openView("new");
  }

  function submitOrder() {
    if (!canSubmit) return;

    const payload = {
      id: orderId,
      table,
      status: fiscal ? "Spremno" : "Kuhinja",
      stage: fiscal ? "ready" : "kitchen",
      createdAt: new Date().toLocaleTimeString("bs-BA", { hour: "2-digit", minute: "2-digit" }),
      items: selectedItems,
      note,
      payment: payment || "Otvoreno",
      fiscal,
    };

    setOrders((current) => {
      const exists = current.some((order) => order.id === payload.id);
      if (exists) return current.map((order) => (order.id === payload.id ? payload : order));
      return [payload, ...current];
    });
    resetForm(nextOrderId([payload, ...orders]));
    setView("orders");
  }

  function moveStage(orderIdToMove, stage) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderIdToMove
          ? { ...order, stage, status: stageLabels[stage] || order.status }
          : order
      )
    );
  }

  function closeDeviceGate() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/home");
  }

  if (!deviceGate.ready || deviceGate.blocked) {
    return (
      <main className="restaurantDeviceGate">
        <div className="restaurantDeviceGateCard">
          <button
            className="restaurantDeviceGateClose"
            type="button"
            onClick={closeDeviceGate}
            aria-label="Zatvori Restaurant App"
            title="Zatvori"
          >
            X
          </button>
          <Image src="/restaurant-logo.svg" alt="BeCleven Restaurant" width={210} height={150} priority unoptimized />
          <span>{deviceGate.ready ? "Tablet / mobile app" : "Provjera uređaja"}</span>
          <h1>Restaurant App je dostupan samo na tabletu i mobitelu.</h1>
          <p>
            Ovaj modul je napravljen kao radna aplikacija za konobare i kuhinju. Otvori link na tabletu ili mobitelu.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className={`restaurantApp restaurantView-${view}`}>
      <aside className={`restaurantDrawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="restaurantDrawerBrand">
          <Image src="/restaurant-logo.svg" alt="BeCleven Restaurant" width={76} height={54} unoptimized />
          <div>
            <strong>Restaurant App</strong>
            <small>BeCleven</small>
          </div>
        </div>

        <button type="button" className={view === "new" ? "active" : ""} onClick={() => openView("new")}>
          <RestaurantIcon name="newOrder" className="restaurantDrawerAssetIcon" size={38} /> Nova narudžba
        </button>
        <button type="button" className={view === "orders" ? "active" : ""} onClick={() => openView("orders")}>
          <RestaurantIcon name="orders" className="restaurantDrawerAssetIcon" size={38} /> Prethodne narudžbe
        </button>
        <button type="button" className={view === "kitchen" ? "active" : ""} onClick={() => openView("kitchen")}>
          <RestaurantIcon name="chef" className="restaurantDrawerAssetIcon" size={38} />
          Kuhinja
        </button>
        <button type="button" className={view === "tables" ? "active" : ""} onClick={() => openView("tables")}>
          <RestaurantIcon name="table" className="restaurantDrawerAssetIcon" size={38} /> Stolovi
        </button>
        <button type="button" onClick={() => setDrawerOpen(false)}>
          <RestaurantIcon name="logout" className="restaurantDrawerAssetIcon" size={38} /> Odjavi se
        </button>
      </aside>

      {drawerOpen && <button className="restaurantScrim" type="button" aria-label="Zatvori meni" onClick={() => setDrawerOpen(false)} />}

      <header className="restaurantTopBar">
        <button className="restaurantIconBtn" type="button" onClick={() => setDrawerOpen(true)} aria-label="Otvori meni">
          <span />
          <span />
          <span />
        </button>
        <div>
          <h1>{viewTitle}</h1>
          <p>{todayLabel()}</p>
        </div>
        <button
          className="restaurantProfileBtn"
          type="button"
          onClick={() => setView("tables")}
          aria-label={`Zauzeto ${occupiedTables.size} od ${tables.length} stolova`}
        >
          {occupiedTables.size}/{tables.length}
        </button>
      </header>

      <section className="restaurantHero">
        <div className="restaurantOrderBadge restaurantHeroCounter">
          <RestaurantIcon name={editingId ? "orders" : "newOrder"} className="restaurantHeroBadgeIcon" size={42} />
          <strong>#{String(orderId).padStart(2, "0")}</strong>
          <small>{editingId ? "IZMJENA" : "NARUDŽBA"}</small>
        </div>

        <Image className="restaurantHeroLogo" src="/restaurant-logo.svg" alt="BeCleven Restaurant" width={212} height={152} priority unoptimized />

        <div className="restaurantTablePicker restaurantHeroCounter">
          <RestaurantIcon name="table" className="restaurantHeroTableIcon" size={42} />
          <div className="restaurantTableSelect">
            <select value={table} onChange={(event) => setTable(event.target.value)} aria-label="Sto">
              <option value="00">00</option>
              {tables.map((tableNo) => (
                <option key={tableNo} value={tableNo}>{tableNo}</option>
              ))}
            </select>
          </div>
          <small>STO</small>
        </div>
      </section>

      <section className="restaurantCommandBar" aria-label="Pregled restorana">
        <button type="button" onClick={() => setView("orders")}>
          <span>Aktivno</span>
          <strong>{formatTableCount(activeOrders.length)}</strong>
        </button>
        <button type="button" onClick={() => setView("kitchen")}>
          <span>Kuhinja</span>
          <strong>{kitchenCount}</strong>
        </button>
        <button type="button" onClick={() => setView("kitchen")}>
          <span>Spremno</span>
          <strong>{readyCount}</strong>
        </button>
        <button type="button" onClick={() => setView("orders")}>
          <span>Promet</span>
          <strong>{money(dailyRevenue)}</strong>
        </button>
      </section>

      {view === "new" && (
        <section className="restaurantPanel restaurantOrderPanel">
          <div className="restaurantMenuSide">
            <div className="restaurantFoodStage" aria-hidden="true">
              <span><RestaurantIcon name={displayItems[1] ? categoryIconName(displayItems[1].category) : "bowl"} size={62} /></span>
              <div><RestaurantIcon name={displayItems[0] ? categoryIconName(displayItems[0].category) : "meal"} size={104} priority /></div>
              <small><RestaurantIcon name={displayItems[2] ? categoryIconName(displayItems[2].category) : "dessert"} size={62} /></small>
            </div>

            <div className="restaurantMenuGrid">
              {Object.entries(menu).map(([key, category]) => {
                const selected = selections[key] || {};
                return (
                  <div className="restaurantMenuRow" key={key} style={{ "--row-accent": category.accent }}>
                    <div className="restaurantCategory">{category.label}</div>
                    <div className="restaurantSelectShell">
                      <select
                        value={selected.name || ""}
                        onChange={(event) => setSelection(key, event.target.value)}
                        aria-label={category.label}
                        required
                      >
                        <option value="">Izaberi</option>
                        {category.items.map((item) => (
                          <option key={item.name} value={item.name}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="restaurantQtyControl">
                      <button type="button" onClick={() => adjustQty(key, -1)} disabled={!selected.name}>-</button>
                      <input
                        value={selected.qty || ""}
                        onChange={(event) => setQty(key, event.target.value)}
                        inputMode="numeric"
                        placeholder="Količina"
                        disabled={!selected.name}
                        aria-label={`Količina ${category.label}`}
                      />
                      <button type="button" onClick={() => adjustQty(key, 1)} disabled={!selected.name}>+</button>
                    </div>
                    <div className={`restaurantFoodIcon ${selected.name ? "active" : ""}`}>
                      <RestaurantIcon name={categoryIconName(key)} size={48} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="restaurantReceiptCard">
            <div className="restaurantReceiptHead">
              <div>
                <span>Račun #{String(orderId).padStart(2, "0")}</span>
                <strong>{table === "00" ? "STO 00" : `STO ${table}`}</strong>
              </div>
              <b>{money(total)}</b>
            </div>

            <div className="restaurantReceiptLines">
              {selectedItems.length === 0 ? (
                <p>Odaberi stavke za novu narudžbu.</p>
              ) : (
                selectedItems.map((item, index) => (
                  <div key={`${item.category}_${item.name}_${index}`}>
                    <span>{item.qty} x {item.name}</span>
                    <strong>{money(Number(item.qty || 0) * Number(item.price || 0))}</strong>
                  </div>
                ))
              )}
            </div>

            <div className="restaurantExtras">
              {addOns.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={selectedAddOns[item.key] ? "active" : ""}
                  onClick={() => setSelectedAddOns((current) => ({ ...current, [item.key]: !current[item.key] }))}
                >
                  <RestaurantIcon name={item.iconName} className="restaurantAddonIcon" size={38} />
                  <b>{item.label}</b>
                  <i />
                </button>
              ))}
            </div>

            <div className="restaurantNoteRow">
              <RestaurantIcon name="warning" className="restaurantFormIcon" size={42} />
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Dodaj napomenu" />
            </div>

            <div className="restaurantPaymentRow">
              <RestaurantIcon name="payment" className="restaurantFormIcon" size={42} />
              <div className="restaurantSelectShell restaurantPaymentSelect">
                <select value={payment} onChange={(event) => setPayment(event.target.value)} aria-label="Način plaćanja" required>
                  <option value="">Način plaćanja</option>
                  <option value="Gotovina">Gotovina</option>
                  <option value="Kartica">Kartica</option>
                  <option value="Virman">Virman</option>
                </select>
              </div>
              <label className="restaurantCheck">
                <input
                  type="checkbox"
                  checked={fiscal}
                  onChange={(event) => setFiscal(event.target.checked)}
                  aria-label="Printaj fiskalni račun"
                />
                <span />
                Fiskalni
              </label>
            </div>

            <div className="restaurantTotalLine">
              <span>RAČUN:</span>
              <strong>{money(total)}</strong>
            </div>

            <button className="restaurantSubmitBtn" type="button" disabled={!canSubmit} onClick={submitOrder}>
              {editingId ? "POŠALJI IZMJENE" : "POŠALJI U KUHINJU"}
            </button>
          </aside>
        </section>
      )}

      {view === "orders" && (
        <section className="restaurantPanel">
          <div className="restaurantSectionHead">
            <div>
              <span>Aktivno danas</span>
              <strong>{formatTableCount(activeOrders.length)}</strong>
            </div>
            <button type="button" onClick={() => { resetForm(); setView("new"); }}>Nova</button>
          </div>

          <div className="restaurantOrderList">
            {openOrders.map((order) => (
              <article key={order.id} className={`restaurantOrderItem ${order.stage}`}>
                <button type="button" className="restaurantOrderMain" onClick={() => editOrder(order)}>
                  <span className="restaurantTray"><RestaurantIcon name="orders" size={44} /></span>
                  <div>
                    <h2>Narudžba #{String(order.id).padStart(2, "0")}</h2>
                    <p>{orderSummary(order)}</p>
                    <small>{order.createdAt} · {order.status}</small>
                  </div>
                  <div className="restaurantOrderMoney">
                    <b>STO: {order.table}</b>
                    <strong>{money(orderTotal(order))}</strong>
                  </div>
                </button>
                <div className="restaurantOrderActions">
                  <span>{stageLabels[order.stage] || order.status}</span>
                  {order.stage !== "done" && (
                    <button type="button" onClick={() => moveStage(order.id, order.stage === "ready" ? "done" : "ready")}>
                      {order.stage === "ready" ? "Plaćeno" : "Spremno"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "kitchen" && (
        <section className="restaurantPanel">
          <div className="restaurantKitchenBoard">
            {[
              { key: "kitchen", title: "U pripremi", orders: kitchenOrders.filter((order) => order.stage === "kitchen") },
              { key: "ready", title: "Spremno", orders: kitchenOrders.filter((order) => order.stage === "ready") },
            ].map((column) => (
              <div className="restaurantKitchenColumn" key={column.key}>
                <div className="restaurantKitchenColumnHead">
                  <strong>{column.title}</strong>
                  <span>{column.orders.length}</span>
                </div>

                {column.orders.length === 0 ? (
                  <div className="restaurantEmpty">Nema stavki.</div>
                ) : (
                  column.orders.map((order) => (
                    <article key={order.id} className={`restaurantKitchenTicket ${order.stage}`}>
                      <div className="restaurantTicketTop">
                        <strong>#{String(order.id).padStart(2, "0")}</strong>
                        <span>STO {order.table}</span>
                      </div>
                      <ul>
                        {(order.items || []).map((item, index) => (
                          <li key={`${item.name}_${index}`}>
                            <b>{item.qty}x</b>
                            <span>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                      {order.note && <p>{order.note}</p>}
                      <div className="restaurantTicketActions">
                        <button type="button" onClick={() => moveStage(order.id, "ready")}>Spremno</button>
                        <button type="button" onClick={() => moveStage(order.id, "done")}>Plaćeno</button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "tables" && (
        <section className="restaurantPanel">
          <div className="restaurantSectionHead">
            <div>
              <span>Mapa stolova</span>
              <strong>{formatTableCount(activeOrders.length)} zauzeto</strong>
              <small>od {formatTableCount(tables.length)}</small>
            </div>
            <button type="button" onClick={() => { resetForm(); setView("new"); }}>Nova</button>
          </div>

          <div className="restaurantTables">
            {tables.map((tableNo) => {
              const order = occupiedTables.get(tableNo);
              return (
                <button
                  type="button"
                  key={tableNo}
                  className={order ? `busy ${order.stage}` : ""}
                  onClick={() => {
                    if (order) editOrder(order);
                    else {
                      resetForm(nextOrderId(orders));
                      setTable(tableNo);
                      setView("new");
                    }
                  }}
                >
                  <span>STO</span>
                  <strong>{tableNo}</strong>
                  <small>{order ? money(orderTotal(order)) : "Slobodan"}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="restaurantTinyFooter">© 2026 AK Solutions - BeCleven</div>

      <nav className="restaurantViewTabs" aria-label="Brza navigacija">
        {viewTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={view === item.key ? "active" : ""}
            onClick={() => setView(item.key)}
          >
            <RestaurantIcon name={item.iconName} className="restaurantTabImage" size={24} />
            {item.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
