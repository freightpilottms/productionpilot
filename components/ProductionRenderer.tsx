"use client";

import { Box, Check, Factory, Layers, Ruler, Save, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { legacyCatalog } from "../lib/legacyCatalog";
import type { Language } from "../lib/i18n";

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

const colorHex: Record<string, number> = {
  ANTRAZIT: 0x30343a,
  "ANTRAZIT U. MAT": 0x25282d,
  BIANCO: 0xf5f1e7,
  "BIANCO VENATO": 0xf3efe2,
  "GOLDEN OAK": 0xb47a38,
  NUSSBAUM: 0x6c4429,
  MARONE: 0x5f3924,
  "PEPER OAK": 0x95826a,
  RAL8017: 0x3f2d28,
  RAL9006: 0xb8bec2,
  RAL9010: 0xf1eee3,
  RAL9016: 0xf8f8ef,
  "RUSTIC OAK": 0x8d5d32,
  SCHWARZBRAUN: 0x211c18,
  GREZZO: 0xbda27d,
  "S2500 INTERPON GRIS": 0x8a9090,
  "IC O50 ICONA SALE": 0xddd7c7
};

function mmToScene(value: number) {
  return value / 1000;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: 0x17201b, transparent: true, opacity: 0.26 })
  );
  edges.position.copy(mesh.position);
  group.add(edges);
  return mesh;
}

function buildJoinery(group: THREE.Group, config: RenderConfig) {
  const width = mmToScene(config.width);
  const height = mmToScene(config.height);
  const depth = mmToScene(config.depth);
  const frame = mmToScene(config.frameWidth);
  const frameColor = colorHex[config.outsideColor] ?? 0x30343a;
  const profileMaterial = new THREE.MeshStandardMaterial({
    color: frameColor,
    roughness: 0.36,
    metalness: config.series.includes("ALU") ? 0.42 : 0.1
  });
  const innerMaterial = new THREE.MeshStandardMaterial({
    color: colorHex[config.insideColor] ?? frameColor,
    roughness: 0.42,
    metalness: 0.08
  });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbfe8f6,
    metalness: 0,
    roughness: 0.04,
    transmission: 0.35,
    transparent: true,
    opacity: 0.42
  });

  addBox(group, [frame, height, depth], [-width / 2 + frame / 2, 0, 0], profileMaterial);
  addBox(group, [frame, height, depth], [width / 2 - frame / 2, 0, 0], profileMaterial);
  addBox(group, [width, frame, depth], [0, height / 2 - frame / 2, 0], profileMaterial);
  addBox(group, [width, frame, depth], [0, -height / 2 + frame / 2, 0], profileMaterial);
  addBox(
    group,
    [width - frame * 2.2, height - frame * 2.2, 0.018],
    [0, 0, -depth / 2 - 0.008],
    glassMaterial
  );

  for (let i = 1; i < config.verticalDivisions; i += 1) {
    const x = -width / 2 + (width / config.verticalDivisions) * i;
    addBox(group, [frame * 0.74, height - frame * 1.6, depth * 0.86], [x, 0, 0.006], innerMaterial);
  }

  for (let i = 1; i < config.horizontalDivisions; i += 1) {
    const y = -height / 2 + (height / config.horizontalDivisions) * i;
    addBox(group, [width - frame * 1.6, frame * 0.74, depth * 0.86], [0, y, 0.008], innerMaterial);
  }

  if (config.openingMode !== "fixed") {
    const handleX = width / 2 - frame * 1.45;
    addBox(group, [frame * 0.24, height * 0.22, depth * 0.32], [handleX, 0, depth * 0.78], new THREE.MeshStandardMaterial({ color: 0xc9c3b7, metalness: 0.6, roughness: 0.24 }));
    if (config.openingMode.includes("tilt")) {
      const sash = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-width / 2 + frame, height / 2 - frame, depth),
          new THREE.Vector3(width / 2 - frame, -height / 2 + frame, depth)
        ]),
        new THREE.LineBasicMaterial({ color: 0x2f8f62, linewidth: 2 })
      );
      group.add(sash);
    }
  }
}

function buildFurniture(group: THREE.Group, config: RenderConfig) {
  const width = mmToScene(config.width);
  const height = mmToScene(config.height);
  const depth = mmToScene(config.depth);
  const board = mmToScene(config.frameWidth);
  const material = new THREE.MeshStandardMaterial({
    color: colorHex[config.outsideColor] ?? 0x8d5d32,
    roughness: 0.5,
    metalness: 0.02
  });
  const back = new THREE.MeshStandardMaterial({ color: 0xd6c5aa, roughness: 0.55 });

  addBox(group, [board, height, depth], [-width / 2 + board / 2, 0, 0], material);
  addBox(group, [board, height, depth], [width / 2 - board / 2, 0, 0], material);
  addBox(group, [width, board, depth], [0, height / 2 - board / 2, 0], material);
  addBox(group, [width, board, depth], [0, -height / 2 + board / 2, 0], material);
  addBox(group, [width - board * 2, height - board * 2, board * 0.55], [0, 0, -depth / 2], back);

  for (let i = 1; i < config.horizontalDivisions; i += 1) {
    const y = -height / 2 + (height / config.horizontalDivisions) * i;
    addBox(group, [width - board * 2, board * 0.85, depth - board], [0, y, 0], material);
  }
  for (let i = 1; i < config.verticalDivisions; i += 1) {
    const x = -width / 2 + (width / config.verticalDivisions) * i;
    addBox(group, [board * 0.85, height - board * 2, depth - board], [x, 0, 0], material);
  }
}

function buildUniversal(group: THREE.Group, config: RenderConfig) {
  const width = mmToScene(config.width);
  const height = mmToScene(config.height);
  const depth = mmToScene(config.depth);
  const beam = mmToScene(config.frameWidth);
  const material = new THREE.MeshStandardMaterial({
    color: colorHex[config.outsideColor] ?? 0x2e77a8,
    roughness: 0.34,
    metalness: 0.34
  });

  const xs = [-width / 2 + beam / 2, width / 2 - beam / 2];
  const ys = [-height / 2 + beam / 2, height / 2 - beam / 2];
  const zs = [-depth / 2 + beam / 2, depth / 2 - beam / 2];
  xs.forEach((x) => ys.forEach((y) => addBox(group, [beam, beam, depth], [x, y, 0], material)));
  xs.forEach((x) => zs.forEach((z) => addBox(group, [beam, height, beam], [x, 0, z], material)));
  ys.forEach((y) => zs.forEach((z) => addBox(group, [width, beam, beam], [0, y, z], material)));
}

export function ProductionRenderer({
  language,
  stock,
  onCreateOrder
}: ProductionRendererProps) {
  const t = copy[language];
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    const shellElement = shell;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xf4f0e8, 4, 8);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0.35, 0.28, 4.2);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambient = new THREE.HemisphereLight(0xffffff, 0x52635a, 2.2);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 3.6);
    key.position.set(3, 3, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaed7ff, 1.3);
    fill.position.set(-2, 1, 3);
    scene.add(fill);

    const group = new THREE.Group();
    scene.add(group);

    if (config.family === "joinery") buildJoinery(group, config);
    if (config.family === "furniture") buildFurniture(group, config);
    if (config.family === "universal") buildUniversal(group, config);

    const maxDimension = Math.max(config.width, config.height, config.depth) / 1000;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxDimension * 2.2, maxDimension * 1.4),
      new THREE.MeshStandardMaterial({ color: 0xded8c8, roughness: 0.8, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -mmToScene(config.height) / 2 - 0.08;
    floor.position.z = 0.12;
    scene.add(floor);

    function resize() {
      const rect = shellElement.getBoundingClientRect();
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / Math.max(1, rect.height);
      camera.updateProjectionMatrix();
    }

    const observer = new ResizeObserver(resize);
    observer.observe(shellElement);
    resize();

    let frame = 0;
    let animation = 0;
    const renderLoop = () => {
      frame += 1;
      group.rotation.y = Math.sin(frame / 150) * 0.16;
      group.rotation.x = -0.05;
      renderer.render(scene, camera);
      animation = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    };
  }, [config]);

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
        <div className="render-stage" ref={shellRef}>
          <canvas aria-label="3D production render" ref={canvasRef} />
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
