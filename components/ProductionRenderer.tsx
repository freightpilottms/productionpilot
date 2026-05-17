"use client";

import { Box, Check, Factory, Layers, Ruler, Save, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { legacyCatalog } from "../app/_domain/legacyCatalog";
import type { Language } from "../app/_domain/i18n";

type RenderFamily = "joinery" | "furniture" | "universal";

type RenderConfig = {
  family: RenderFamily;
  width: number;
  height: number;
  depth: number;
  frameWidth: number;
  quantity: number;
  verticalDivisions: number;
  horizontalDivisions: number;
  openingMode: "fixed" | "tilt" | "turn" | "tilt-turn" | "sliding";
  series: string;
  profileStatus: string;
  glassStatus: string;
  panelStatus: string;
  insideColor: string;
  outsideColor: string;
  stockProfileLength: number;
  stockGlassWidth: number;
  stockGlassHeight: number;
  stockPanelWidth: number;
  stockPanelHeight: number;
};

type NumericConfigKey =
  | "width"
  | "height"
  | "depth"
  | "frameWidth"
  | "quantity"
  | "verticalDivisions"
  | "horizontalDivisions"
  | "stockProfileLength"
  | "stockGlassWidth"
  | "stockGlassHeight"
  | "stockPanelWidth"
  | "stockPanelHeight";

type StockLike = {
  name: string;
  category: string;
  onHand: number;
  reserved: number;
  unit: string;
  value: number;
};

type ProductionRendererProps = {
  language: Language;
  stock: StockLike[];
  onCreateOrder: (payload: {
    requester: string;
    series: string;
    profile: string;
    glass: string;
    panel: string;
    colorInt: string;
    colorExt: string;
    quantity: number;
    note: string;
  }) => void;
};

const copy = {
  bhs: {
    family: "Tip proizvoda",
    joinery: "Stolarija",
    furniture: "Namjestaj",
    universal: "Univerzalni ram",
    dimensions: "Dimenzije",
    width: "Sirina",
    height: "Visina",
    depth: "Dubina",
    frame: "Profil / debljina",
    divisions: "Podjele",
    vDivisions: "Vertikalno",
    hDivisions: "Horizontalno",
    opening: "Otvaranje",
    stock: "Skladisni format",
    generate: "Napravi nalog iz rendera",
    bom: "Automatska specifikacija",
    cut: "Rezna optimizacija",
    fit: "Dimenzioni fit",
    waste: "Otpad",
    panes: "polja",
    bars: "sipke",
    pcs: "kom",
    qty: "Kol.",
    series: "Serija",
    inside: "Unutra",
    outside: "Vani",
    hinges: "sarke",
    screws: "sarafi",
    boards: "Ploce",
    productionPush: "Slanje u proizvodnju",
    fixed: "Fiksno",
    tilt: "Kip",
    turn: "Otvaranje",
    tiltTurn: "Kip-otvaranje",
    sliding: "Klizno",
    profile: "Profil",
    glass: "Staklo",
    panel: "Panel",
    gasket: "Dihtung",
    hardware: "Okov",
    ok: "Dostupno",
    risk: "Rizik",
    studio: "3D render production",
    materialBrain: "Materijalni mozak",
    warehouseFit: "Provjera skladišta"
  },
  de: {
    family: "Produkttyp",
    joinery: "Fenster/Tueren",
    furniture: "Moebel",
    universal: "Universalrahmen",
    dimensions: "Abmessungen",
    width: "Breite",
    height: "Hoehe",
    depth: "Tiefe",
    frame: "Profil / Staerke",
    divisions: "Teilungen",
    vDivisions: "Vertikal",
    hDivisions: "Horizontal",
    opening: "Oeffnung",
    stock: "Lagerformat",
    generate: "Auftrag aus Render erstellen",
    bom: "Automatische Stueckliste",
    cut: "Zuschnittoptimierung",
    fit: "Formatpruefung",
    waste: "Verschnitt",
    panes: "Felder",
    bars: "Stangen",
    pcs: "Stk",
    qty: "Menge",
    series: "Serie",
    inside: "Innen",
    outside: "Aussen",
    hinges: "Baender",
    screws: "Schrauben",
    boards: "Platten",
    productionPush: "In Produktion geben",
    fixed: "Fest",
    tilt: "Kipp",
    turn: "Dreh",
    tiltTurn: "Dreh-kipp",
    sliding: "Schiebe",
    profile: "Profil",
    glass: "Glas",
    panel: "Paneel",
    gasket: "Dichtung",
    hardware: "Beschlag",
    ok: "Verfuegbar",
    risk: "Risiko",
    studio: "3D Produktionsrender",
    materialBrain: "Materiallogik",
    warehouseFit: "Lagerpruefung"
  },
  it: {
    family: "Tipo prodotto",
    joinery: "Serramenti",
    furniture: "Mobili",
    universal: "Telaio universale",
    dimensions: "Dimensioni",
    width: "Larghezza",
    height: "Altezza",
    depth: "Profondita",
    frame: "Profilo / spessore",
    divisions: "Divisioni",
    vDivisions: "Verticale",
    hDivisions: "Orizzontale",
    opening: "Apertura",
    stock: "Formato magazzino",
    generate: "Crea ordine dal render",
    bom: "Distinta automatica",
    cut: "Ottimizzazione taglio",
    fit: "Controllo formato",
    waste: "Scarto",
    panes: "campi",
    bars: "barre",
    pcs: "pz",
    qty: "Qta",
    series: "Serie",
    inside: "Interno",
    outside: "Esterno",
    hinges: "cerniere",
    screws: "viti",
    boards: "Pannelli",
    productionPush: "Invio produzione",
    fixed: "Fisso",
    tilt: "Vasistas",
    turn: "Battente",
    tiltTurn: "Anta-ribalta",
    sliding: "Scorrevole",
    profile: "Profilo",
    glass: "Vetro",
    panel: "Pannello",
    gasket: "Guarnizione",
    hardware: "Ferramenta",
    ok: "Disponibile",
    risk: "Rischio",
    studio: "Render 3D produzione",
    materialBrain: "Logica materiali",
    warehouseFit: "Controllo magazzino"
  },
  es: {
    family: "Tipo de producto",
    joinery: "Carpinteria",
    furniture: "Mueble",
    universal: "Marco universal",
    dimensions: "Dimensiones",
    width: "Ancho",
    height: "Alto",
    depth: "Profundidad",
    frame: "Perfil / espesor",
    divisions: "Divisiones",
    vDivisions: "Vertical",
    hDivisions: "Horizontal",
    opening: "Apertura",
    stock: "Formato almacen",
    generate: "Crear orden desde render",
    bom: "Lista automatica",
    cut: "Optimizacion corte",
    fit: "Control dimensional",
    waste: "Merma",
    panes: "campos",
    bars: "barras",
    pcs: "uds",
    qty: "Cant.",
    series: "Serie",
    inside: "Interior",
    outside: "Exterior",
    hinges: "bisagras",
    screws: "tornillos",
    boards: "Tableros",
    productionPush: "Enviar a produccion",
    fixed: "Fijo",
    tilt: "Oscilante",
    turn: "Batiente",
    tiltTurn: "Oscilo-batiente",
    sliding: "Corredera",
    profile: "Perfil",
    glass: "Vidrio",
    panel: "Panel",
    gasket: "Junta",
    hardware: "Herrajes",
    ok: "Disponible",
    risk: "Riesgo",
    studio: "Render 3D produccion",
    materialBrain: "Logica de materiales",
    warehouseFit: "Control almacen"
  },
  en: {
    family: "Product type",
    joinery: "Joinery",
    furniture: "Furniture",
    universal: "Universal frame",
    dimensions: "Dimensions",
    width: "Width",
    height: "Height",
    depth: "Depth",
    frame: "Profile / thickness",
    divisions: "Divisions",
    vDivisions: "Vertical",
    hDivisions: "Horizontal",
    opening: "Opening",
    stock: "Warehouse format",
    generate: "Create order from render",
    bom: "Automatic bill of materials",
    cut: "Cut optimization",
    fit: "Dimensional fit",
    waste: "Waste",
    panes: "panes",
    bars: "bars",
    pcs: "pcs",
    qty: "Qty",
    series: "Series",
    inside: "Inside",
    outside: "Outside",
    hinges: "hinges",
    screws: "screws",
    boards: "Boards",
    productionPush: "Production push",
    fixed: "Fixed",
    tilt: "Tilt",
    turn: "Turn",
    tiltTurn: "Tilt-turn",
    sliding: "Sliding",
    profile: "Profile",
    glass: "Glass",
    panel: "Panel",
    gasket: "Gasket",
    hardware: "Hardware",
    ok: "Available",
    risk: "Risk",
    studio: "3D production render",
    materialBrain: "Material brain",
    warehouseFit: "Warehouse check"
  }
} as const;

const colorHex: Record<string, string> = {
  ANTRAZIT: "#30343a",
  "ANTRAZIT U. MAT": "#25282d",
  BIANCO: "#f5f1e7",
  "BIANCO VENATO": "#f3efe2",
  "GOLDEN OAK": "#b47a38",
  NUSSBAUM: "#6c4429",
  MARONE: "#5f3924",
  "PEPER OAK": "#95826a",
  RAL8017: "#3f2d28",
  RAL9006: "#b8bec2",
  RAL9010: "#f1eee3",
  RAL9016: "#f8f8ef",
  "RUSTIC OAK": "#8d5d32",
  SCHWARZBRAUN: "#211c18",
  GREZZO: "#bda27d",
  "S2500 INTERPON GRIS": "#8a9090",
  "IC O50 ICONA SALE": "#ddd7c7"
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function productColor(value: string, fallback = "#30343a") {
  return colorHex[value] ?? fallback;
}

export function ProductionRenderer({
  language,
  stock,
  onCreateOrder
}: ProductionRendererProps) {
  const t = copy[language];
  const [config, setConfig] = useState<RenderConfig>({
    family: "joinery",
    width: 1400,
    height: 1600,
    depth: 82,
    frameWidth: 82,
    quantity: 1,
    verticalDivisions: 2,
    horizontalDivisions: 1,
    openingMode: "tilt-turn",
    series: "PVC 82MD",
    profileStatus: "DOSTUPNO",
    glassStatus: "DSL - DOSTUPNO",
    panelStatus: "GLATKI - DOSTUPNO",
    insideColor: "BIANCO",
    outsideColor: "ANTRAZIT",
    stockProfileLength: 6500,
    stockGlassWidth: 3210,
    stockGlassHeight: 2250,
    stockPanelWidth: 2800,
    stockPanelHeight: 2070
  });

  const calculations = useMemo(() => {
    const panes = Math.max(1, config.verticalDivisions * config.horizontalDivisions);
    const frameLinearMm =
      2 * (config.width + config.height) +
      Math.max(0, config.verticalDivisions - 1) * (config.height - config.frameWidth * 2) +
      Math.max(0, config.horizontalDivisions - 1) * (config.width - config.frameWidth * 2);
    const sashLinearMm =
      config.openingMode === "fixed"
        ? 0
        : panes * 2 * (config.width / config.verticalDivisions + config.height / config.horizontalDivisions) * 0.82;
    const totalProfileMm = (frameLinearMm + sashLinearMm) * config.quantity;
    const bars = Math.ceil(totalProfileMm / config.stockProfileLength);
    const profileWasteMm = bars * config.stockProfileLength - totalProfileMm;
    const glassWidth = Math.max(100, config.width / config.verticalDivisions - config.frameWidth * 2.2);
    const glassHeight = Math.max(100, config.height / config.horizontalDivisions - config.frameWidth * 2.2);
    const glassArea = (glassWidth * glassHeight * panes * config.quantity) / 1_000_000;
    const glassFits =
      glassWidth <= config.stockGlassWidth &&
      glassHeight <= config.stockGlassHeight;
    const panelFits =
      config.width <= config.stockPanelWidth && config.height <= config.stockPanelHeight;
    const gasket = ((config.width + config.height) * 2 * panes * config.quantity) / 1000;
    const screws = Math.ceil((totalProfileMm / 1000) * 6);
    const hinges =
      config.openingMode === "fixed" || config.openingMode === "sliding"
        ? 0
        : Math.max(2, config.horizontalDivisions * 2) * config.quantity;
    const boardArea =
      config.family === "furniture"
        ? ((config.width * config.height * 2 + config.width * config.depth * 2 + config.height * config.depth * 2) *
            config.quantity) /
          1_000_000
        : 0;

    return {
      panes,
      bars,
      profileMeters: totalProfileMm / 1000,
      profileWaste: profileWasteMm / 1000,
      glassArea,
      glassWidth,
      glassHeight,
      glassFits,
      panelFits,
      gasket,
      screws,
      hinges,
      boardArea
    };
  }, [config]);

  const stockSignals = useMemo(() => {
    const profiles = stock
      .filter((item) => item.category.toLowerCase().includes("profil"))
      .reduce((sum, item) => sum + Math.max(0, item.onHand - item.reserved), 0);
    const glass = stock
      .filter((item) => item.category.toLowerCase().includes("staklo"))
      .reduce((sum, item) => sum + Math.max(0, item.onHand - item.reserved), 0);
    const panels = stock
      .filter((item) => item.category.toLowerCase().includes("panel"))
      .reduce((sum, item) => sum + Math.max(0, item.onHand - item.reserved), 0);
    return { profiles, glass, panels };
  }, [stock]);

  const modelVars = {
    "--model-ratio": `${clampNumber(config.width / Math.max(1, config.height), 0.55, 1.85)}`,
    "--frame-size": `${clampNumber((config.frameWidth / Math.max(config.width, config.height)) * 100, 4, 13)}%`,
    "--depth-size": `${clampNumber(config.depth / 2.4, 24, 120)}px`,
    "--outside-color": productColor(config.outsideColor),
    "--inside-color": productColor(config.insideColor, productColor(config.outsideColor)),
    "--board-color": productColor(config.outsideColor, "#8d5d32")
  } as CSSProperties;

  const divisionColumns = Array.from({ length: config.verticalDivisions });
  const divisionRows = Array.from({ length: config.horizontalDivisions });

  function renderProductModel() {
    if (config.family === "furniture") {
      return (
        <div className="css-product furniture-model" style={modelVars}>
          <div className="furniture-back" />
          <div className="furniture-side left" />
          <div className="furniture-side right" />
          <div className="furniture-cap top" />
          <div className="furniture-cap bottom" />
          {divisionRows.slice(1).map((_, index) => (
            <span className="furniture-shelf" key={`shelf-${index}`} style={{ top: `${((index + 1) / config.horizontalDivisions) * 100}%` }} />
          ))}
          {divisionColumns.slice(1).map((_, index) => (
            <span className="furniture-divider" key={`divider-${index}`} style={{ left: `${((index + 1) / config.verticalDivisions) * 100}%` }} />
          ))}
        </div>
      );
    }

    if (config.family === "universal") {
      return (
        <div className="css-product universal-model" style={modelVars}>
          <span className="beam top-front" />
          <span className="beam bottom-front" />
          <span className="beam left-front" />
          <span className="beam right-front" />
          <span className="beam top-back" />
          <span className="beam bottom-back" />
          <span className="beam left-back" />
          <span className="beam right-back" />
          <span className="beam depth-a" />
          <span className="beam depth-b" />
          <span className="beam depth-c" />
          <span className="beam depth-d" />
        </div>
      );
    }

    return (
      <div className="css-product joinery-model" style={modelVars}>
        <div className="joinery-frame">
          <div
            className="glass-grid"
            style={{
              gridTemplateColumns: `repeat(${config.verticalDivisions}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${config.horizontalDivisions}, minmax(0, 1fr))`
            }}
          >
            {Array.from({ length: calculations.panes }).map((_, index) => (
              <span className="glass-pane" key={index} />
            ))}
          </div>
          {divisionColumns.slice(1).map((_, index) => (
            <span className="mullion vertical" key={`v-${index}`} style={{ left: `${((index + 1) / config.verticalDivisions) * 100}%` }} />
          ))}
          {divisionRows.slice(1).map((_, index) => (
            <span className="mullion horizontal" key={`h-${index}`} style={{ top: `${((index + 1) / config.horizontalDivisions) * 100}%` }} />
          ))}
          {config.openingMode !== "fixed" ? <span className="render-handle" /> : null}
          {config.openingMode.includes("tilt") ? <span className="tilt-line" /> : null}
        </div>
      </div>
    );
  }

  function update<K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) {
    setConfig((previous) => ({ ...previous, [key]: value }));
  }

  function numberUpdate(key: NumericConfigKey, value: string, min: number, max: number) {
    const next = clampNumber(Number(value) || 0, min, max);
    setConfig((previous) => ({ ...previous, [key]: next }));
  }

  return (
    <section className="render-production">
      <div className="render-hero">
        <div className="render-copy">
          <p>{t.studio}</p>
          <h3>ProductionPilot Render Engine</h3>
          <span>{t.materialBrain} + {t.warehouseFit}</span>
        </div>
        <div className="render-badges">
          <span><Ruler size={15} /> {config.width} x {config.height} mm</span>
          <span><Layers size={15} /> {calculations.panes} {t.panes}</span>
          <span><Factory size={15} /> {calculations.profileMeters.toFixed(1)} m</span>
        </div>
      </div>

      <div className="render-workbench">
        <div className="render-stage" aria-label="3D production render">
          <div className="stage-grid" />
          <div className="stage-camera">
            {renderProductModel()}
          </div>
          <div className="stage-shadow" />
        </div>

        <div className="render-controls">
          <div className="control-section">
            <div className="control-title">
              <Box size={17} />
              <strong>{t.family}</strong>
            </div>
            <div className="segmented-control">
              {(["joinery", "furniture", "universal"] as RenderFamily[]).map((family) => (
                <button
                  className={config.family === family ? "active" : ""}
                  key={family}
                  onClick={() => update("family", family)}
                  type="button"
                >
                  {t[family]}
                </button>
              ))}
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <Ruler size={17} />
              <strong>{t.dimensions}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{t.width} mm</span>
                <input min="300" max="4200" type="number" value={config.width} onChange={(event) => numberUpdate("width", event.target.value, 300, 4200)} />
              </label>
              <label>
                <span>{t.height} mm</span>
                <input min="300" max="3600" type="number" value={config.height} onChange={(event) => numberUpdate("height", event.target.value, 300, 3600)} />
              </label>
              <label>
                <span>{t.depth} mm</span>
                <input min="18" max="600" type="number" value={config.depth} onChange={(event) => numberUpdate("depth", event.target.value, 18, 600)} />
              </label>
              <label>
                <span>{t.frame} mm</span>
                <input min="18" max="180" type="number" value={config.frameWidth} onChange={(event) => numberUpdate("frameWidth", event.target.value, 18, 180)} />
              </label>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <SlidersHorizontal size={17} />
              <strong>{t.divisions}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{t.vDivisions}</span>
                <input min="1" max="5" type="number" value={config.verticalDivisions} onChange={(event) => numberUpdate("verticalDivisions", event.target.value, 1, 5)} />
              </label>
              <label>
                <span>{t.hDivisions}</span>
                <input min="1" max="4" type="number" value={config.horizontalDivisions} onChange={(event) => numberUpdate("horizontalDivisions", event.target.value, 1, 4)} />
              </label>
              <label>
                <span>{t.opening}</span>
                <select value={config.openingMode} onChange={(event) => update("openingMode", event.target.value as RenderConfig["openingMode"])}>
                  <option value="fixed">{t.fixed}</option>
                  <option value="tilt">{t.tilt}</option>
                  <option value="turn">{t.turn}</option>
                  <option value="tilt-turn">{t.tiltTurn}</option>
                  <option value="sliding">{t.sliding}</option>
                </select>
              </label>
              <label>
                <span>{t.qty}</span>
                <input min="1" max="200" type="number" value={config.quantity} onChange={(event) => numberUpdate("quantity", event.target.value, 1, 200)} />
              </label>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <Layers size={17} />
              <strong>{t.profile}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{t.series}</span>
                <select value={config.series} onChange={(event) => update("series", event.target.value)}>
                  {legacyCatalog.productSeries.map((series) => (
                    <option key={series} value={series}>{series}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.profile}</span>
                <select value={config.profileStatus} onChange={(event) => update("profileStatus", event.target.value)}>
                  {legacyCatalog.materialStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.glass}</span>
                <select value={config.glassStatus} onChange={(event) => update("glassStatus", event.target.value)}>
                  {legacyCatalog.glassStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.panel}</span>
                <select value={config.panelStatus} onChange={(event) => update("panelStatus", event.target.value)}>
                  {legacyCatalog.panelStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.inside}</span>
                <select value={config.insideColor} onChange={(event) => update("insideColor", event.target.value)}>
                  {legacyCatalog.colors.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.outside}</span>
                <select value={config.outsideColor} onChange={(event) => update("outsideColor", event.target.value)}>
                  {legacyCatalog.colors.map((color) => (
                    <option key={color} value={color}>{color}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <Factory size={17} />
              <strong>{t.stock}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{t.profile} mm</span>
                <input min="1000" max="8000" type="number" value={config.stockProfileLength} onChange={(event) => numberUpdate("stockProfileLength", event.target.value, 1000, 8000)} />
              </label>
              <label>
                <span>{t.glass} W</span>
                <input min="300" max="6000" type="number" value={config.stockGlassWidth} onChange={(event) => numberUpdate("stockGlassWidth", event.target.value, 300, 6000)} />
              </label>
              <label>
                <span>{t.glass} H</span>
                <input min="300" max="4000" type="number" value={config.stockGlassHeight} onChange={(event) => numberUpdate("stockGlassHeight", event.target.value, 300, 4000)} />
              </label>
              <label>
                <span>{t.panel} W</span>
                <input min="300" max="6000" type="number" value={config.stockPanelWidth} onChange={(event) => numberUpdate("stockPanelWidth", event.target.value, 300, 6000)} />
              </label>
              <label>
                <span>{t.panel} H</span>
                <input min="300" max="4000" type="number" value={config.stockPanelHeight} onChange={(event) => numberUpdate("stockPanelHeight", event.target.value, 300, 4000)} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="render-output">
        <article>
          <strong>{t.bom}</strong>
          <ul>
            <li>{t.profile}: {calculations.profileMeters.toFixed(2)} m / {calculations.bars} {t.bars}</li>
            <li>{t.glass}: {calculations.glassArea.toFixed(2)} m2 ({calculations.panes} {t.pcs})</li>
            <li>{t.gasket}: {calculations.gasket.toFixed(1)} m</li>
            <li>{t.hardware}: {calculations.hinges} {t.hinges}, {calculations.screws} {t.screws}</li>
            {config.family === "furniture" ? <li>{t.boards}: {calculations.boardArea.toFixed(2)} m2</li> : null}
          </ul>
        </article>
        <article>
          <strong>{t.cut}</strong>
          <ul>
            <li>{t.waste}: {calculations.profileWaste.toFixed(2)} m {t.profile}</li>
            <li>{t.fit}: {calculations.glassWidth.toFixed(0)} x {calculations.glassHeight.toFixed(0)} mm {t.glass}</li>
            <li>{t.panel}: {calculations.panelFits ? t.ok : t.risk}</li>
          </ul>
        </article>
        <article>
          <strong>{t.warehouseFit}</strong>
          <div className="fit-grid">
            <span className={stockSignals.profiles >= calculations.profileMeters ? "ok" : "risk"}><Check size={14} /> {t.profile}: {stockSignals.profiles.toFixed(0)} m</span>
            <span className={calculations.glassFits ? "ok" : "risk"}><Check size={14} /> {t.glass}: {calculations.glassFits ? t.ok : t.risk}</span>
            <span className={stockSignals.panels > 0 ? "ok" : "risk"}><Check size={14} /> {t.panel}: {stockSignals.panels.toFixed(0)} pcs</span>
          </div>
        </article>
        <article className="render-action-card">
          <strong>{t.productionPush}</strong>
          <button
            className="primary-action"
            onClick={() =>
              onCreateOrder({
                requester: `RENDER ${config.width}x${config.height}`,
                series: config.series,
                profile: config.profileStatus,
                glass: config.glassStatus,
                panel: config.panelStatus,
                colorInt: config.insideColor,
                colorExt: config.outsideColor,
                quantity: config.quantity,
                note: `${t.studio}: ${config.family}, ${config.width}x${config.height}x${config.depth}mm, ${calculations.profileMeters.toFixed(2)}m profile, ${calculations.glassArea.toFixed(2)}m2 glass.`
              })
            }
            type="button"
          >
            <Save size={16} />
            {t.generate}
          </button>
        </article>
      </div>
    </section>
  );
}
