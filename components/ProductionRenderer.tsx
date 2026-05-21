"use client";

import { Box, Check, Factory, Layers, Ruler, Save, SlidersHorizontal } from "lucide-react";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
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

type RenderCalculations = {
  panes: number;
  bars: number;
  profileMeters: number;
  profileWaste: number;
  glassArea: number;
  glassWidth: number;
  glassHeight: number;
  glassFits: boolean;
  panelFits: boolean;
  gasket: number;
  screws: number;
  hinges: number;
  boardArea: number;
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
    warehouseFit: "Provjera skladista",
    liveEngine: "Live WebGL engine",
    studioQuality: "Studio kvalitet",
    cncPath: "CNC putanja",
    stockYield: "Iskoristenje",
    profileDepth: "Dubina profila",
    clearOpening: "Svijetli otvor",
    materialStack: "Slojevi materijala",
    readyPieces: "Spremni komadi"
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
    warehouseFit: "Lagerpruefung",
    liveEngine: "Live WebGL Engine",
    studioQuality: "Studioqualitaet",
    cncPath: "CNC Pfad",
    stockYield: "Ausbeute",
    profileDepth: "Profiltiefe",
    clearOpening: "Lichte Oeffnung",
    materialStack: "Materialschichten",
    readyPieces: "Fertige Teile"
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
    warehouseFit: "Controllo magazzino",
    liveEngine: "Motore WebGL live",
    studioQuality: "Qualita studio",
    cncPath: "Percorso CNC",
    stockYield: "Resa materiale",
    profileDepth: "Profondita profilo",
    clearOpening: "Luce netta",
    materialStack: "Strati materiale",
    readyPieces: "Pezzi pronti"
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
    warehouseFit: "Control almacen",
    liveEngine: "Motor WebGL en vivo",
    studioQuality: "Calidad estudio",
    cncPath: "Ruta CNC",
    stockYield: "Rendimiento",
    profileDepth: "Profundidad perfil",
    clearOpening: "Apertura libre",
    materialStack: "Capas material",
    readyPieces: "Piezas listas"
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
    warehouseFit: "Warehouse check",
    liveEngine: "Live WebGL engine",
    studioQuality: "Studio quality",
    cncPath: "CNC path",
    stockYield: "Stock yield",
    profileDepth: "Profile depth",
    clearOpening: "Clear opening",
    materialStack: "Material stack",
    readyPieces: "Ready pieces"
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

function createBoardTexture(hexColor: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return undefined;
  }

  const base = new THREE.Color(hexColor);
  context.fillStyle = `#${base.getHexString()}`;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 44; index += 1) {
    const alpha = 0.08 + (index % 7) * 0.018;
    context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
    context.lineWidth = 1 + (index % 3);
    context.beginPath();
    const y = (index / 44) * canvas.height;
    context.moveTo(0, y);
    context.bezierCurveTo(72, y - 16, 148, y + 18, 256, y - 5);
    context.stroke();
  }

  for (let index = 0; index < 18; index += 1) {
    context.strokeStyle = "rgba(0, 0, 0, 0.08)";
    context.lineWidth = 1;
    context.beginPath();
    const y = Math.random() * canvas.height;
    context.moveTo(0, y);
    context.bezierCurveTo(82, y + 24, 166, y - 20, 256, y + 10);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.7, 1.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((item) => {
    Object.values(item).forEach((value) => {
      if (value && typeof value === "object" && "isTexture" in value) {
        (value as THREE.Texture).dispose();
      }
    });
    item.dispose();
  });
}

function ProductionThreeScene({
  config,
  calculations
}: {
  config: RenderConfig;
  calculations: RenderCalculations;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const container = host;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0xdce8e2, 0.048);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true
    });
    renderer.domElement.className = "render-canvas";
    renderer.domElement.dataset.renderCanvas = "true";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const model = new THREE.Group();
    scene.add(model);

    const outside = productColor(config.outsideColor);
    const inside = productColor(config.insideColor, outside);
    const boardTexture = createBoardTexture(outside);

    const profileMaterial = new THREE.MeshStandardMaterial({
      color: outside,
      metalness: 0.18,
      roughness: 0.34
    });
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: inside,
      metalness: 0.12,
      roughness: 0.42
    });
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.22,
      transparent: true
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbfefff,
      metalness: 0,
      opacity: 0.38,
      roughness: 0.02,
      thickness: 0.18,
      transmission: 0.58,
      transparent: true
    });
    const gasketMaterial = new THREE.MeshStandardMaterial({
      color: 0x111820,
      metalness: 0.05,
      roughness: 0.72
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8d2c4,
      metalness: 0.72,
      roughness: 0.22
    });
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: outside,
      map: boardTexture,
      metalness: 0.02,
      roughness: 0.48
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xf97316,
      opacity: 0.5,
      transparent: true
    });

    const width = clampNumber(config.width / 620, 1.4, 5.4);
    const height = clampNumber(config.height / 620, 1.2, 5.1);
    const depth = clampNumber(config.depth / 260, 0.22, 1.9);
    const frame = clampNumber(config.frameWidth / 620, 0.1, 0.42);
    const maxSize = Math.max(width, height);

    function addBox(
      target: THREE.Group,
      size: THREE.Vector3Tuple,
      position: THREE.Vector3Tuple,
      material: THREE.Material,
      edged = true
    ) {
      const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (edged) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
        edges.renderOrder = 2;
        mesh.add(edges);
      }
      target.add(mesh);
      return mesh;
    }

    function addGuide(points: THREE.Vector3Tuple[], color = 0xf97316) {
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((point) => new THREE.Vector3(point[0], point[1], point[2]))
      );
      const material = new THREE.LineBasicMaterial({
        color,
        opacity: 0.82,
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      model.add(line);
      return line;
    }

    function addDimensionGuides() {
      const z = depth / 2 + 0.2;
      const bottom = -height / 2 - 0.28;
      const left = -width / 2 - 0.28;
      addGuide([[-width / 2, bottom, z], [width / 2, bottom, z]]);
      addGuide([[left, -height / 2, z], [left, height / 2, z]], 0x2f8f62);
      addGuide([[width / 2 + 0.18, -height / 2, -depth / 2], [width / 2 + 0.56, -height / 2 + 0.28, depth / 2]], 0x2e77a8);
      addBox(model, [0.04, 0.18, 0.04], [-width / 2, bottom, z], glowMaterial, false);
      addBox(model, [0.04, 0.18, 0.04], [width / 2, bottom, z], glowMaterial, false);
      addBox(model, [0.18, 0.04, 0.04], [left, -height / 2, z], glowMaterial, false);
      addBox(model, [0.18, 0.04, 0.04], [left, height / 2, z], glowMaterial, false);
    }

    function buildJoinery() {
      addBox(model, [width, frame, depth], [0, height / 2 - frame / 2, 0], profileMaterial);
      addBox(model, [width, frame, depth], [0, -height / 2 + frame / 2, 0], profileMaterial);
      addBox(model, [frame, height, depth], [-width / 2 + frame / 2, 0, 0], profileMaterial);
      addBox(model, [frame, height, depth], [width / 2 - frame / 2, 0, 0], profileMaterial);

      const innerWidth = Math.max(0.4, width - frame * 2);
      const innerHeight = Math.max(0.4, height - frame * 2);
      const paneWidth = innerWidth / config.verticalDivisions;
      const paneHeight = innerHeight / config.horizontalDivisions;

      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addBox(model, [frame * 0.58, innerHeight, depth * 0.94], [-innerWidth / 2 + paneWidth * column, 0, depth * 0.03], innerMaterial);
      }
      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addBox(model, [innerWidth, frame * 0.58, depth * 0.94], [0, innerHeight / 2 - paneHeight * row, depth * 0.03], innerMaterial);
      }

      for (let row = 0; row < config.horizontalDivisions; row += 1) {
        for (let column = 0; column < config.verticalDivisions; column += 1) {
          const centerX = -innerWidth / 2 + paneWidth * (column + 0.5);
          const centerY = innerHeight / 2 - paneHeight * (row + 0.5);
          const clearWidth = Math.max(0.18, paneWidth - frame * 0.78);
          const clearHeight = Math.max(0.18, paneHeight - frame * 0.78);
          const glass = addBox(model, [clearWidth, clearHeight, 0.035], [centerX, centerY, depth * 0.34], glassMaterial, false);
          glass.castShadow = false;

          if (config.openingMode !== "fixed") {
            const sash = frame * 0.24;
            addBox(model, [clearWidth + sash, sash, depth * 0.42], [centerX, centerY + clearHeight / 2, depth * 0.45], innerMaterial);
            addBox(model, [clearWidth + sash, sash, depth * 0.42], [centerX, centerY - clearHeight / 2, depth * 0.45], innerMaterial);
            addBox(model, [sash, clearHeight, depth * 0.42], [centerX - clearWidth / 2, centerY, depth * 0.45], innerMaterial);
            addBox(model, [sash, clearHeight, depth * 0.42], [centerX + clearWidth / 2, centerY, depth * 0.45], innerMaterial);
          }
        }
      }

      if (config.openingMode !== "fixed") {
        addBox(model, [frame * 0.17, height * 0.2, frame * 0.14], [width / 2 - frame * 0.7, 0, depth * 0.78], metalMaterial);
        addBox(model, [frame * 0.2, frame * 0.42, frame * 0.18], [-width / 2 + frame * 0.24, height * 0.22, depth * 0.55], metalMaterial);
        addBox(model, [frame * 0.2, frame * 0.42, frame * 0.18], [-width / 2 + frame * 0.24, -height * 0.22, depth * 0.55], metalMaterial);
      }

      if (config.openingMode === "sliding") {
        addBox(model, [width * 0.92, frame * 0.13, depth * 0.18], [0, -height / 2 + frame * 1.15, depth * 0.72], metalMaterial);
        addBox(model, [width * 0.92, frame * 0.13, depth * 0.18], [0, height / 2 - frame * 1.15, depth * 0.72], metalMaterial);
      }

      if (config.openingMode.includes("tilt")) {
        const diagonal = addBox(model, [Math.hypot(width, height) * 0.72, 0.018, 0.026], [0, 0, depth * 0.86], glowMaterial, false);
        diagonal.rotation.z = Math.atan2(height, width);
      }

      addBox(model, [width - frame * 1.3, frame * 0.08, depth * 0.08], [0, -height / 2 + frame * 1.2, depth * 0.62], gasketMaterial, false);
    }

    function buildFurniture() {
      const board = Math.max(frame * 0.85, 0.14);
      addBox(model, [board, height, depth], [-width / 2 + board / 2, 0, 0], boardMaterial);
      addBox(model, [board, height, depth], [width / 2 - board / 2, 0, 0], boardMaterial);
      addBox(model, [width, board, depth], [0, height / 2 - board / 2, 0], boardMaterial);
      addBox(model, [width, board, depth], [0, -height / 2 + board / 2, 0], boardMaterial);
      addBox(model, [width - board * 2, height - board * 2, board * 0.35], [0, 0, -depth / 2 + board * 0.18], boardMaterial, false);

      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addBox(model, [width - board * 2, board * 0.72, depth * 0.92], [0, height / 2 - (height / config.horizontalDivisions) * row, 0], boardMaterial);
      }
      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addBox(model, [board * 0.72, height - board * 2, depth * 0.92], [-width / 2 + (width / config.verticalDivisions) * column, 0, 0], boardMaterial);
      }

      const doorWidth = (width - board * 2) / Math.max(1, config.verticalDivisions);
      for (let column = 0; column < config.verticalDivisions; column += 1) {
        const centerX = -width / 2 + board + doorWidth * (column + 0.5);
        addBox(model, [doorWidth * 0.84, height * 0.72, board * 0.18], [centerX, 0, depth / 2 + board * 0.12], boardMaterial);
        addBox(model, [board * 0.12, height * 0.2, board * 0.2], [centerX + doorWidth * 0.25, 0, depth / 2 + board * 0.28], metalMaterial);
      }
    }

    function buildUniversal() {
      const bar = Math.max(frame, 0.13);
      const frontZ = depth / 2;
      const backZ = -depth / 2;
      [frontZ, backZ].forEach((z) => {
        addBox(model, [width, bar, bar], [0, height / 2 - bar / 2, z], profileMaterial);
        addBox(model, [width, bar, bar], [0, -height / 2 + bar / 2, z], profileMaterial);
        addBox(model, [bar, height, bar], [-width / 2 + bar / 2, 0, z], profileMaterial);
        addBox(model, [bar, height, bar], [width / 2 - bar / 2, 0, z], profileMaterial);
      });
      [
        [-width / 2 + bar / 2, height / 2 - bar / 2],
        [width / 2 - bar / 2, height / 2 - bar / 2],
        [-width / 2 + bar / 2, -height / 2 + bar / 2],
        [width / 2 - bar / 2, -height / 2 + bar / 2]
      ].forEach(([x, y]) => {
        addBox(model, [bar * 0.72, bar * 0.72, depth], [x, y, 0], innerMaterial);
      });
    }

    if (config.family === "furniture") {
      buildFurniture();
    } else if (config.family === "universal") {
      buildUniversal();
    } else {
      buildJoinery();
    }
    addDimensionGuides();

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(3.8, maxSize * 1.25), 96),
      new THREE.MeshStandardMaterial({
        color: 0xdde7e1,
        metalness: 0.02,
        roughness: 0.86
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -height / 2 - 0.14;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(Math.max(4.2, maxSize * 1.42), 18, 0xf97316, 0x6c7a72);
    grid.position.y = floor.position.y + 0.006;
    grid.material.opacity = 0.24;
    grid.material.transparent = true;
    scene.add(grid);

    const ambient = new THREE.HemisphereLight(0xffffff, 0x26302c, 1.25);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(-2.8, 4.8, 4.4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xf97316, 7, 8);
    rimLight.position.set(3.2, 1.8, 2.8);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x8bdcff, 3.2, 7);
    fillLight.position.set(-2.7, -0.4, 2.2);
    scene.add(fillLight);

    const particleCount = Math.min(170, 64 + calculations.panes * 14);
    const particlePositions = new Float32Array(particleCount * 3);
    for (let index = 0; index < particleCount; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * maxSize * 1.65;
      particlePositions[index * 3 + 1] = (Math.random() - 0.2) * maxSize * 1.2;
      particlePositions[index * 3 + 2] = (Math.random() - 0.5) * maxSize * 1.2;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xf97316,
        opacity: 0.38,
        size: 0.018,
        transparent: true
      })
    );
    scene.add(particles);

    camera.position.set(maxSize * 0.42, maxSize * 0.22, maxSize * 1.28 + 1.8);
    camera.lookAt(0, 0, 0);

    let targetRotationX = 0.08;
    let targetRotationY = -0.42;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let frameId = 0;
    const clock = new THREE.Clock();

    function resize() {
      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(bounds.width));
      const nextHeight = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    }

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) {
        return;
      }
      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      targetRotationY += deltaX * 0.008;
      targetRotationX = clampNumber(targetRotationX + deltaY * 0.005, -0.34, 0.34);
      lastX = event.clientX;
      lastY = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    }

    function animate() {
      const elapsed = clock.getElapsedTime();
      const drift = dragging ? 0 : Math.sin(elapsed * 0.42) * 0.055;
      model.rotation.x += (targetRotationX - model.rotation.x) * 0.08;
      model.rotation.y += (targetRotationY + drift - model.rotation.y) * 0.08;
      model.position.y = Math.sin(elapsed * 0.78) * 0.035;
      particles.rotation.y = elapsed * 0.025;
      particles.rotation.x = Math.sin(elapsed * 0.2) * 0.03;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry?.dispose();
          const material = object.material;
          if (material) {
            disposeMaterial(material);
          }
        }
      });
    };
  }, [calculations.panes, config]);

  return <div className="render-canvas-host" ref={hostRef} />;
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

  const profileYield = Math.round(
    clampNumber(
      (calculations.profileMeters / Math.max(1, (calculations.bars * config.stockProfileLength) / 1000)) * 100,
      1,
      100
    )
  );
  const clearOpening = `${calculations.glassWidth.toFixed(0)} x ${calculations.glassHeight.toFixed(0)} mm`;
  const readyPieces = Math.min(
    config.quantity,
    Math.floor(stockSignals.profiles / Math.max(1, calculations.profileMeters / config.quantity))
  );

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
          <ProductionThreeScene config={config} calculations={calculations} />
          <div className="render-stage-glow" />
          <div className="render-hud render-hud-main">
            <span>{t.liveEngine}</span>
            <strong>{config.width} x {config.height} x {config.depth} mm</strong>
          </div>
          <div className="render-hud render-hud-quality">
            <span>{t.studioQuality}</span>
            <strong>{config.series}</strong>
          </div>
          <div className="render-stage-metrics">
            <span>
              <small>{t.profileDepth}</small>
              <strong>{config.frameWidth} mm</strong>
            </span>
            <span>
              <small>{t.clearOpening}</small>
              <strong>{clearOpening}</strong>
            </span>
            <span>
              <small>{t.stockYield}</small>
              <strong>{profileYield}%</strong>
            </span>
          </div>
          <div className="render-material-strip">
            <span style={{ backgroundColor: productColor(config.outsideColor) }} />
            <span style={{ backgroundColor: productColor(config.insideColor, productColor(config.outsideColor)) }} />
            <span className={calculations.glassFits ? "ok" : "risk"} />
            <strong>{t.materialStack}</strong>
          </div>
          <div className="render-cut-map" aria-label={t.cncPath}>
            <div>
              <span style={{ width: `${profileYield}%` }} />
            </div>
            <small>{t.cncPath}: {calculations.bars} {t.bars} / {calculations.profileWaste.toFixed(2)} m {t.waste}</small>
          </div>
          <div className="render-ready-chip">
            <Factory size={15} />
            <span>{t.readyPieces}: {readyPieces}/{config.quantity}</span>
          </div>
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
