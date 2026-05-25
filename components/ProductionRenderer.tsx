"use client";

import {
  Box,
  Camera,
  Check,
  DoorOpen,
  Factory,
  ImagePlus,
  Layers,
  Move,
  RefreshCw,
  RotateCw,
  Ruler,
  Save,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import { legacyCatalog } from "../app/_domain/legacyCatalog";
import type { Language } from "../app/_domain/i18n";

type RenderFamily = "joinery" | "furniture" | "universal" | "fence";
type DoorSystem = "none" | "hinged" | "sliding";
type HandleType = "bar" | "knob" | "edge" | "recessed" | "sliding-pull";

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
  doorSystem: DoorSystem;
  doorWidth: number;
  doorHeight: number;
  revealGap: number;
  frontProjection: number;
  handleLength: number;
  handleOffset: number;
  handleType: HandleType;
  series: string;
  profileStatus: string;
  glassStatus: string;
  panelStatus: string;
  insideColor: string;
  outsideColor: string;
  insideTextureId: string;
  outsideTextureId: string;
  panelTextureId: string;
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
  | "doorWidth"
  | "doorHeight"
  | "revealGap"
  | "frontProjection"
  | "handleLength"
  | "handleOffset"
  | "stockProfileLength"
  | "stockGlassWidth"
  | "stockGlassHeight"
  | "stockPanelWidth"
  | "stockPanelHeight";

type StockLike = {
  id?: string;
  code?: string;
  name: string;
  category: string;
  supplier?: string;
  onHand: number;
  reserved: number;
  unit: string;
  value: number;
  textureImage?: string;
  textureName?: string;
};

type StockTexture = {
  id: string;
  name: string;
  category: string;
  image: string;
  supplier?: string;
};

type SceneMaterialTextures = {
  outside?: string;
  inside?: string;
  panel?: string;
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

type SavedRenderElement = {
  id: string;
  image: string;
  label: string;
  config: RenderConfig;
  textures: SceneMaterialTextures;
  family: RenderFamily;
  width: number;
  height: number;
  depth: number;
  outsideColor: string;
  insideColor: string;
  placement: PlacementState;
};

type PlacementState = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  rotateX: number;
  rotateY: number;
};

type PlacementMode = "move" | "rotate";

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
    furniture: "Kuhinje",
    universal: "Namještaj",
    fence: "Ograde",
    dimensions: "Dimenzije",
    width: "Širina",
    fenceLength: "Dužina",
    height: "Visina",
    depth: "Dubina",
    frame: "Profil / debljina",
    divisions: "Podjele",
    modules: "Moduli",
    fenceLayout: "Raspored ograde",
    fenceSections: "Segmenti",
    fenceRails: "Prečke",
    verticalModules: "Vertikalni moduli",
    shelfRows: "Police / redovi",
    boardThickness: "Debljina ploče",
    fenceProfile: "Profil stuba / prečke",
    joineryMaterials: "Profili i ispuna",
    kitchenMaterials: "Materijali kuhinje",
    furnitureMaterials: "Materijali namještaja",
    fenceMaterials: "Materijali ograde",
    profileFormat: "Format profila",
    glassFormat: "Format stakla",
    boardFormat: "Format ploče",
    vDivisions: "Vertikalno",
    hDivisions: "Horizontalno",
    opening: "Otvaranje",
    doorHardware: "Vrata i kvake",
    doorSystem: "Sistem vrata",
    noDoors: "Bez vrata",
    hingedDoors: "Klasična vrata",
    slidingDoors: "Klizna vrata",
    doorWidth: "Širina krila",
    doorHeight: "Visina krila",
    handleType: "Tip kvake",
    precisionDetails: "Precizni detalji",
    revealGap: "Zazor / fuga",
    frontProjection: "Izbacaj krila",
    handleLength: "Duzina kvake",
    handleOffset: "Pozicija kvake",
    barHandle: "Ručka",
    knobHandle: "Okrugla kvaka",
    edgeHandle: "Profil ručka",
    recessedHandle: "Ukopana ručka",
    slidingPullHandle: "Ručka za klizna",
    stock: "Skladišni format",
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
    hinges: "šarke",
    screws: "šarafi",
    boards: "Ploče",
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
    warehouseFit: "Provjera skladišta",
    liveEngine: "Live WebGL engine",
    studioQuality: "Studio kvalitet",
    cncPath: "CNC putanja",
    stockYield: "Iskorištenje",
    profileDepth: "Dubina profila",
    clearOpening: "Svijetli otvor",
    materialStack: "Slojevi materijala",
    readyPieces: "Spremni komadi",
    profileColors: "Boje profila",
    outsidePalette: "Vanjska paleta",
    insidePalette: "Unutrašnja paleta",
    physicalCheck: "Fizička provjera",
    validGeometry: "Geometrija je izvodljiva",
    physicalIssue: "Fizički problem",
    saveElement: "Spremi element",
    elementSaved: "Element spremljen",
    placementStudio: "Studio za prostor",
    uploadSpacePhoto: "Uslikaj / učitaj prostor",
    manualPlacement: "Ručno pozicioniranje",
    moveMode: "Pomjeranje",
    rotateMode: "Rotacija",
    xPosition: "Lijevo / desno",
    yPosition: "Gore / dole",
    scale: "Naprijed / nazad",
    rotation: "Rotacija",
    yaw: "Okret lijevo / desno",
    pitch: "Nagib gore / dole",
    roll: "Okretanje",
    resetPlacement: "Resetuj poziciju",
    zoom: "Zoom",
    zoomIn: "Približi render",
    zoomOut: "Udalji render",
    resetZoom: "Resetuj zoom",
    stockTextures: "Teksture iz magacina",
    noStockTextures: "U magacinu još nema učitane teksture.",
    useBaseColor: "Samo boja",
    outsideTexture: "Vanjska tekstura",
    insideTexture: "Unutrašnja tekstura",
    panelTexture: "Panel / namještaj tekstura",
    saveFirst: "Prvo spremi renderovani element, zatim dodaj fotografiju prostora.",
    roomPhotoHint: "Dodaj fotografiju prostorije i pomjeraj element direktno po slici.",
    impossibleFrame: "Profil je predebeo za zadatu širinu/visinu ili broj podjela.",
    impossibleDepth: "Dubina nije logična u odnosu na širinu/visinu elementa.",
    impossibleStock: "Skladišni format mora biti pozitivan."
  },
  de: {
    family: "Produkttyp",
    joinery: "Fenster/Türen",
    furniture: "Küchen",
    universal: "Möbel",
    fence: "Geländer",
    dimensions: "Abmessungen",
    width: "Breite",
    fenceLength: "Länge",
    height: "Höhe",
    depth: "Tiefe",
    frame: "Profil / Stärke",
    divisions: "Teilungen",
    modules: "Module",
    fenceLayout: "Geländeraufteilung",
    fenceSections: "Segmente",
    fenceRails: "Riegel",
    verticalModules: "Vertikale Module",
    shelfRows: "Fächer / Reihen",
    boardThickness: "Plattenstärke",
    fenceProfile: "Pfosten-/Riegelprofil",
    joineryMaterials: "Profile und Füllungen",
    kitchenMaterials: "Küchenmaterialien",
    furnitureMaterials: "Möbelmaterialien",
    fenceMaterials: "Geländermaterialien",
    profileFormat: "Profilformat",
    glassFormat: "Glasformat",
    boardFormat: "Plattenformat",
    vDivisions: "Vertikal",
    hDivisions: "Horizontal",
    opening: "Öffnung",
    doorHardware: "Türen und Griffe",
    doorSystem: "Türsystem",
    noDoors: "Ohne Türen",
    hingedDoors: "Drehtüren",
    slidingDoors: "Schiebetüren",
    doorWidth: "Türblattbreite",
    doorHeight: "Türblatthöhe",
    handleType: "Grifftyp",
    precisionDetails: "Präzise Details",
    revealGap: "Fuge / Spalt",
    frontProjection: "Frontversatz",
    handleLength: "Grifflänge",
    handleOffset: "Griffposition",
    barHandle: "Stangengriff",
    knobHandle: "Knopfgriff",
    edgeHandle: "Profilgriff",
    recessedHandle: "Muschelgriff",
    slidingPullHandle: "Schiebetürgriff",
    stock: "Lagerformat",
    generate: "Auftrag aus Render erstellen",
    bom: "Automatische Stückliste",
    cut: "Zuschnittoptimierung",
    fit: "Formatprüfung",
    waste: "Verschnitt",
    panes: "Felder",
    bars: "Stangen",
    pcs: "Stk",
    qty: "Menge",
    series: "Serie",
    inside: "Innen",
    outside: "Außen",
    hinges: "Bänder",
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
    ok: "Verfügbar",
    risk: "Risiko",
    studio: "3D Produktionsrender",
    materialBrain: "Materiallogik",
    warehouseFit: "Lagerprüfung",
    liveEngine: "Live WebGL Engine",
    studioQuality: "Studioqualität",
    cncPath: "CNC Pfad",
    stockYield: "Ausbeute",
    profileDepth: "Profiltiefe",
    clearOpening: "Lichte Öffnung",
    materialStack: "Materialschichten",
    readyPieces: "Fertige Teile",
    profileColors: "Profilfarben",
    outsidePalette: "Außenpalette",
    insidePalette: "Innenpalette",
    physicalCheck: "Physische Prüfung",
    validGeometry: "Geometrie ist machbar",
    physicalIssue: "Physisches Problem",
    saveElement: "Element speichern",
    elementSaved: "Element gespeichert",
    placementStudio: "Raumstudio",
    uploadSpacePhoto: "Raumfoto aufnehmen/laden",
    manualPlacement: "Manuelle Platzierung",
    moveMode: "Verschieben",
    rotateMode: "Drehen",
    xPosition: "Links / rechts",
    yPosition: "Oben / unten",
    scale: "Vor / zurueck",
    rotation: "Rotation",
    yaw: "Drehung links / rechts",
    pitch: "Neigung oben / unten",
    roll: "Rollen",
    resetPlacement: "Position resetten",
    zoom: "Zoom",
    zoomIn: "Render vergrößern",
    zoomOut: "Render verkleinern",
    resetZoom: "Zoom resetten",
    stockTextures: "Texturen aus dem Lager",
    noStockTextures: "Im Lager ist noch keine Textur geladen.",
    useBaseColor: "Nur Farbe",
    outsideTexture: "Außentextur",
    insideTexture: "Innentextur",
    panelTexture: "Paneel/Möbel-Textur",
    saveFirst: "Render-Element speichern, dann Raumfoto hinzufügen.",
    roomPhotoHint: "Raumfoto laden und Element direkt im Bild bewegen.",
    impossibleFrame: "Profil ist für Breite/Höhe oder Teilungen zu stark.",
    impossibleDepth: "Tiefe ist im Verhältnis zu Breite/Höhe nicht plausibel.",
    impossibleStock: "Lagerformat muss positiv sein."
  },
  it: {
    family: "Tipo prodotto",
    joinery: "Serramenti",
    furniture: "Cucine",
    universal: "Mobili",
    fence: "Ringhiere",
    dimensions: "Dimensioni",
    width: "Larghezza",
    fenceLength: "Lunghezza",
    height: "Altezza",
    depth: "Profondità",
    frame: "Profilo / spessore",
    divisions: "Divisioni",
    modules: "Moduli",
    fenceLayout: "Layout ringhiera",
    fenceSections: "Segmenti",
    fenceRails: "Traversi",
    verticalModules: "Moduli verticali",
    shelfRows: "Ripiani / file",
    boardThickness: "Spessore pannello",
    fenceProfile: "Profilo montante/traverso",
    joineryMaterials: "Profili e tamponamenti",
    kitchenMaterials: "Materiali cucina",
    furnitureMaterials: "Materiali mobili",
    fenceMaterials: "Materiali ringhiera",
    profileFormat: "Formato profilo",
    glassFormat: "Formato vetro",
    boardFormat: "Formato pannello",
    vDivisions: "Verticale",
    hDivisions: "Orizzontale",
    opening: "Apertura",
    doorHardware: "Ante e maniglie",
    doorSystem: "Sistema ante",
    noDoors: "Senza ante",
    hingedDoors: "Ante battenti",
    slidingDoors: "Ante scorrevoli",
    doorWidth: "Larghezza anta",
    doorHeight: "Altezza anta",
    handleType: "Tipo maniglia",
    precisionDetails: "Dettagli precisi",
    revealGap: "Fuga",
    frontProjection: "Sporgenza anta",
    handleLength: "Lunghezza maniglia",
    handleOffset: "Posizione maniglia",
    barHandle: "Maniglia lineare",
    knobHandle: "Pomolo",
    edgeHandle: "Maniglia profilo",
    recessedHandle: "Maniglia incassata",
    slidingPullHandle: "Maniglia scorrevole",
    stock: "Formato magazzino",
    generate: "Crea ordine dal render",
    bom: "Distinta automatica",
    cut: "Ottimizzazione taglio",
    fit: "Controllo formato",
    waste: "Scarto",
    panes: "campi",
    bars: "barre",
    pcs: "pz",
    qty: "Qtà",
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
    studioQuality: "Qualità studio",
    cncPath: "Percorso CNC",
    stockYield: "Resa materiale",
    profileDepth: "Profondità profilo",
    clearOpening: "Luce netta",
    materialStack: "Strati materiale",
    readyPieces: "Pezzi pronti",
    profileColors: "Colori profilo",
    outsidePalette: "Palette esterna",
    insidePalette: "Palette interna",
    physicalCheck: "Controllo fisico",
    validGeometry: "Geometria realizzabile",
    physicalIssue: "Problema fisico",
    saveElement: "Salva elemento",
    elementSaved: "Elemento salvato",
    placementStudio: "Studio ambiente",
    uploadSpacePhoto: "Scatta/carica ambiente",
    manualPlacement: "Posizionamento manuale",
    moveMode: "Sposta",
    rotateMode: "Ruota",
    xPosition: "Sinistra / destra",
    yPosition: "Su / giù",
    scale: "Avanti / indietro",
    rotation: "Rotazione",
    yaw: "Rotazione sinistra / destra",
    pitch: "Inclinazione su / giù",
    roll: "Rollio",
    resetPlacement: "Reset posizione",
    zoom: "Zoom",
    zoomIn: "Avvicina render",
    zoomOut: "Allontana render",
    resetZoom: "Reset zoom",
    stockTextures: "Texture dal magazzino",
    noStockTextures: "Nessuna texture caricata in magazzino.",
    useBaseColor: "Solo colore",
    outsideTexture: "Texture esterna",
    insideTexture: "Texture interna",
    panelTexture: "Texture pannello/mobile",
    saveFirst: "Salva prima l'elemento renderizzato, poi aggiungi la foto ambiente.",
    roomPhotoHint: "Carica una foto ambiente e sposta l'elemento direttamente sull'immagine.",
    impossibleFrame: "Profilo troppo spesso per dimensioni o divisioni.",
    impossibleDepth: "Profondità non plausibile rispetto a larghezza/altezza.",
    impossibleStock: "Il formato magazzino deve essere positivo."
  },
  es: {
    family: "Tipo de producto",
    joinery: "Carpintería",
    furniture: "Cocinas",
    universal: "Muebles",
    fence: "Barandillas",
    dimensions: "Dimensiones",
    width: "Ancho",
    fenceLength: "Longitud",
    height: "Alto",
    depth: "Profundidad",
    frame: "Perfil / espesor",
    divisions: "Divisiones",
    modules: "Módulos",
    fenceLayout: "Diseño barandilla",
    fenceSections: "Segmentos",
    fenceRails: "Travesaños",
    verticalModules: "Módulos verticales",
    shelfRows: "Estantes / filas",
    boardThickness: "Espesor tablero",
    fenceProfile: "Perfil poste/travesaño",
    joineryMaterials: "Perfiles y rellenos",
    kitchenMaterials: "Materiales de cocina",
    furnitureMaterials: "Materiales de muebles",
    fenceMaterials: "Materiales de barandilla",
    profileFormat: "Formato perfil",
    glassFormat: "Formato vidrio",
    boardFormat: "Formato tablero",
    vDivisions: "Vertical",
    hDivisions: "Horizontal",
    opening: "Apertura",
    doorHardware: "Puertas y tiradores",
    doorSystem: "Sistema de puertas",
    noDoors: "Sin puertas",
    hingedDoors: "Puertas abatibles",
    slidingDoors: "Puertas correderas",
    doorWidth: "Ancho de hoja",
    doorHeight: "Alto de hoja",
    handleType: "Tipo de tirador",
    precisionDetails: "Detalles precisos",
    revealGap: "Holgura / junta",
    frontProjection: "Proyeccion de hoja",
    handleLength: "Longitud tirador",
    handleOffset: "Posicion tirador",
    barHandle: "Tirador lineal",
    knobHandle: "Pomo",
    edgeHandle: "Tirador perfil",
    recessedHandle: "Tirador empotrado",
    slidingPullHandle: "Tirador corredera",
    stock: "Formato almacén",
    generate: "Crear orden desde render",
    bom: "Lista automática",
    cut: "Optimización corte",
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
    productionPush: "Enviar a producción",
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
    studio: "Render 3D producción",
    materialBrain: "Lógica de materiales",
    warehouseFit: "Control almacén",
    liveEngine: "Motor WebGL en vivo",
    studioQuality: "Calidad estudio",
    cncPath: "Ruta CNC",
    stockYield: "Rendimiento",
    profileDepth: "Profundidad perfil",
    clearOpening: "Apertura libre",
    materialStack: "Capas material",
    readyPieces: "Piezas listas",
    profileColors: "Colores perfil",
    outsidePalette: "Paleta exterior",
    insidePalette: "Paleta interior",
    physicalCheck: "Control físico",
    validGeometry: "Geometría viable",
    physicalIssue: "Problema físico",
    saveElement: "Guardar elemento",
    elementSaved: "Elemento guardado",
    placementStudio: "Estudio de espacio",
    uploadSpacePhoto: "Tomar/cargar espacio",
    manualPlacement: "Colocación manual",
    moveMode: "Mover",
    rotateMode: "Rotar",
    xPosition: "Izquierda / derecha",
    yPosition: "Arriba / abajo",
    scale: "Adelante / atras",
    rotation: "Rotación",
    yaw: "Giro izquierda / derecha",
    pitch: "Inclinación arriba / abajo",
    roll: "Rotación libre",
    resetPlacement: "Restablecer posición",
    zoom: "Zoom",
    zoomIn: "Acercar render",
    zoomOut: "Alejar render",
    resetZoom: "Restablecer zoom",
    stockTextures: "Texturas del almacén",
    noStockTextures: "Aún no hay textura cargada en almacén.",
    useBaseColor: "Solo color",
    outsideTexture: "Textura exterior",
    insideTexture: "Textura interior",
    panelTexture: "Textura panel/mueble",
    saveFirst: "Guarda primero el elemento renderizado y luego agrega la foto del espacio.",
    roomPhotoHint: "Carga una foto del espacio y mueve el elemento directamente sobre la imagen.",
    impossibleFrame: "Perfil demasiado grueso para dimensiones o divisiones.",
    impossibleDepth: "Profundidad no plausible frente a ancho/alto.",
    impossibleStock: "El formato de almacén debe ser positivo."
  },
  en: {
    family: "Product type",
    joinery: "Joinery",
    furniture: "Kitchens",
    universal: "Furniture",
    fence: "Railings",
    dimensions: "Dimensions",
    width: "Width",
    fenceLength: "Length",
    height: "Height",
    depth: "Depth",
    frame: "Profile / thickness",
    divisions: "Divisions",
    modules: "Modules",
    fenceLayout: "Railing layout",
    fenceSections: "Sections",
    fenceRails: "Rails",
    verticalModules: "Vertical modules",
    shelfRows: "Shelves / rows",
    boardThickness: "Board thickness",
    fenceProfile: "Post / rail profile",
    joineryMaterials: "Profiles and infill",
    kitchenMaterials: "Kitchen materials",
    furnitureMaterials: "Furniture materials",
    fenceMaterials: "Railing materials",
    profileFormat: "Profile format",
    glassFormat: "Glass format",
    boardFormat: "Board format",
    vDivisions: "Vertical",
    hDivisions: "Horizontal",
    opening: "Opening",
    doorHardware: "Doors and handles",
    doorSystem: "Door system",
    noDoors: "No doors",
    hingedDoors: "Hinged doors",
    slidingDoors: "Sliding doors",
    doorWidth: "Leaf width",
    doorHeight: "Leaf height",
    handleType: "Handle type",
    precisionDetails: "Precision details",
    revealGap: "Reveal / gap",
    frontProjection: "Leaf projection",
    handleLength: "Handle length",
    handleOffset: "Handle position",
    barHandle: "Bar handle",
    knobHandle: "Knob handle",
    edgeHandle: "Edge pull",
    recessedHandle: "Recessed pull",
    slidingPullHandle: "Sliding pull",
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
    readyPieces: "Ready pieces",
    profileColors: "Profile colors",
    outsidePalette: "Outside palette",
    insidePalette: "Inside palette",
    physicalCheck: "Physical check",
    validGeometry: "Geometry is buildable",
    physicalIssue: "Physical issue",
    saveElement: "Save element",
    elementSaved: "Element saved",
    placementStudio: "Room placement studio",
    uploadSpacePhoto: "Capture/upload room",
    manualPlacement: "Manual placement",
    moveMode: "Move",
    rotateMode: "Rotate",
    xPosition: "Left / right",
    yPosition: "Up / down",
    scale: "Forward / back",
    rotation: "Rotation",
    yaw: "Yaw left / right",
    pitch: "Pitch up / down",
    roll: "Roll",
    resetPlacement: "Reset placement",
    zoom: "Zoom",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
    stockTextures: "Warehouse textures",
    noStockTextures: "No texture has been uploaded in stock yet.",
    useBaseColor: "Base color",
    outsideTexture: "Outside texture",
    insideTexture: "Inside texture",
    panelTexture: "Panel / furniture texture",
    saveFirst: "Save the rendered element first, then add a room photo.",
    roomPhotoHint: "Add a room photo and move the element directly on the image.",
    impossibleFrame: "Profile is too thick for the dimensions or divisions.",
    impossibleDepth: "Depth is not plausible against width/height.",
    impossibleStock: "Warehouse format must be positive."
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

const dimensionBounds: Record<NumericConfigKey, { min: number; max: number }> = {
  width: { min: 80, max: 20000 },
  height: { min: 80, max: 16000 },
  depth: { min: 1, max: 8000 },
  frameWidth: { min: 3, max: 2500 },
  quantity: { min: 1, max: 999 },
  verticalDivisions: { min: 1, max: 12 },
  horizontalDivisions: { min: 1, max: 10 },
  doorWidth: { min: 40, max: 20000 },
  doorHeight: { min: 40, max: 16000 },
  revealGap: { min: 0, max: 120 },
  frontProjection: { min: 0, max: 260 },
  handleLength: { min: 20, max: 2200 },
  handleOffset: { min: 0, max: 1200 },
  stockProfileLength: { min: 100, max: 30000 },
  stockGlassWidth: { min: 80, max: 20000 },
  stockGlassHeight: { min: 80, max: 16000 },
  stockPanelWidth: { min: 80, max: 20000 },
  stockPanelHeight: { min: 80, max: 16000 }
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function classNames(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function productColor(value: string, fallback = "#30343a") {
  return colorHex[value] ?? fallback;
}

function maxFrameWidth(config: Pick<RenderConfig, "width" | "height" | "verticalDivisions" | "horizontalDivisions">) {
  const paneWidth = config.width / Math.max(1, config.verticalDivisions);
  const paneHeight = config.height / Math.max(1, config.horizontalDivisions);
  return Math.max(3, Math.floor(Math.min(paneWidth, paneHeight) * 0.42));
}

function maxDoorWidth(
  config: Pick<RenderConfig, "width" | "frameWidth" | "verticalDivisions" | "doorSystem">
) {
  const innerWidth = Math.max(40, config.width - config.frameWidth * 2);
  const leafCount = Math.max(1, config.verticalDivisions);
  const overlapFactor = config.doorSystem === "sliding" ? 1.18 : 0.96;
  return Math.max(40, Math.floor((innerWidth / leafCount) * overlapFactor));
}

function maxDoorHeight(config: Pick<RenderConfig, "height" | "frameWidth">) {
  return Math.max(40, Math.floor(config.height - config.frameWidth * 2));
}

function scaledFrameThickness(config: RenderConfig) {
  if (config.family === "furniture" || config.family === "universal") {
    return clampNumber(config.frameWidth / 210, 0.045, 0.34);
  }
  if (config.family === "fence") {
    return clampNumber(config.frameWidth / 430, 0.06, 0.5);
  }
  return clampNumber(config.frameWidth / 520, 0.055, 0.54);
}

function scaledRevealGap(config: RenderConfig) {
  return clampNumber(config.revealGap / 260, 0.006, 0.12);
}

function scaledFrontProjection(config: RenderConfig) {
  return clampNumber(config.frontProjection / 260, 0.018, 0.26);
}

function scaledHandleLength(config: RenderConfig, panelHeight: number) {
  return clampNumber(config.handleLength / 620, 0.08, Math.max(0.09, panelHeight * 0.88));
}

function scaledHandleEdgeOffset(config: RenderConfig, panelWidth: number) {
  return clampNumber(config.handleOffset / 620, 0.025, Math.max(0.03, panelWidth * 0.46));
}

function normalizeConfig(config: RenderConfig) {
  const next = { ...config };
  (Object.keys(dimensionBounds) as NumericConfigKey[]).forEach((key) => {
    const bounds = dimensionBounds[key];
    next[key] = Math.round(clampNumber(next[key], bounds.min, bounds.max)) as never;
  });
  next.frameWidth = clampNumber(next.frameWidth, dimensionBounds.frameWidth.min, maxFrameWidth(next));
  next.doorWidth = clampNumber(next.doorWidth, dimensionBounds.doorWidth.min, maxDoorWidth(next));
  next.doorHeight = clampNumber(next.doorHeight, dimensionBounds.doorHeight.min, maxDoorHeight(next));
  return next;
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

function createUploadedTexture(source: string | undefined, repeatX = 1.9, repeatY = 1.15) {
  if (!source) {
    return undefined;
  }

  const texture = new THREE.TextureLoader().load(source, (loadedTexture) => {
    loadedTexture.needsUpdate = true;
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
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

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const nextRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + nextRadius, y);
  context.lineTo(x + width - nextRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + nextRadius);
  context.lineTo(x + width, y + height - nextRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - nextRadius, y + height);
  context.lineTo(x + nextRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - nextRadius);
  context.lineTo(x, y + nextRadius);
  context.quadraticCurveTo(x, y, x + nextRadius, y);
  context.closePath();
}

function createFrontFacingElementImage(config: RenderConfig) {
  const canvas = document.createElement("canvas");
  canvas.width = 980;
  canvas.height = 980;
  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const outside = productColor(config.outsideColor);
  const inside = productColor(config.insideColor, outside);
  const ratio = clampNumber(config.width / Math.max(1, config.height), 0.22, 4.5);
  const maxWidth = 820;
  const maxHeight = 820;
  const modelWidth = ratio >= 1 ? maxWidth : maxHeight * ratio;
  const modelHeight = ratio >= 1 ? maxWidth / ratio : maxHeight;
  const x = (canvas.width - modelWidth) / 2;
  const y = (canvas.height - modelHeight) / 2;
  const minSide = Math.min(modelWidth, modelHeight);
  const frame = clampNumber(
    (config.frameWidth / Math.max(1, Math.min(config.width, config.height))) *
      minSide,
    10,
    Math.max(18, minSide * 0.24)
  );

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.shadowColor = "rgba(16, 24, 32, 0.24)";
  context.shadowBlur = 26;
  context.shadowOffsetY = 22;

  if (config.family === "fence") {
    const post = clampNumber(frame * 0.9, 12, 72);
    const rail = clampNumber(frame * 0.58, 8, 46);
    const sections = Math.max(1, config.verticalDivisions);
    const rails = Math.max(1, config.horizontalDivisions);

    context.shadowColor = "transparent";
    context.fillStyle = outside;

    for (let index = 0; index <= sections; index += 1) {
      const postX = x + (modelWidth / sections) * index - post / 2;
      context.fillRect(postX, y, post, modelHeight);
    }

    for (let railIndex = 0; railIndex < rails; railIndex += 1) {
      const railY =
        rails === 1
          ? y + modelHeight * 0.5 - rail / 2
          : y + modelHeight * (0.18 + (0.64 / Math.max(1, rails - 1)) * railIndex) - rail / 2;
      context.fillRect(x, railY, modelWidth, rail);
    }

    context.fillStyle = inside;
    for (let section = 0; section < sections; section += 1) {
      const sectionWidth = modelWidth / sections;
      const centerX = x + sectionWidth * (section + 0.5);
      drawRoundedRect(
        context,
        centerX - post * 0.24,
        y + post * 0.8,
        post * 0.48,
        modelHeight - post * 1.6,
        Math.max(3, post * 0.14)
      );
      context.fill();
    }
  } else if (config.family === "furniture" || config.family === "universal") {
    drawRoundedRect(context, x, y, modelWidth, modelHeight, 10);
    context.fillStyle = outside;
    context.fill();
    context.shadowColor = "transparent";

    const board = clampNumber(frame * 0.82, 12, 70);
    context.fillStyle = inside;
    context.fillRect(x + board, y + board, modelWidth - board * 2, modelHeight - board * 2);
    context.fillStyle = outside;
    for (let row = 1; row < config.horizontalDivisions; row += 1) {
      const lineY = y + (modelHeight / config.horizontalDivisions) * row - board * 0.32;
      context.fillRect(x + board, lineY, modelWidth - board * 2, board * 0.64);
    }
    for (let column = 1; column < config.verticalDivisions; column += 1) {
      const lineX = x + (modelWidth / config.verticalDivisions) * column - board * 0.32;
      context.fillRect(lineX, y + board, board * 0.64, modelHeight - board * 2);
    }

    if (config.family === "furniture" && config.doorSystem !== "none") {
      const doorCount = Math.max(1, config.verticalDivisions);
      const doorWidth = (modelWidth - board * 2) / doorCount;
      const doorHeight = clampNumber(
        (config.doorHeight / Math.max(1, config.height)) * modelHeight,
        modelHeight * 0.34,
        modelHeight - board * 2
      );
      const doorY = y + modelHeight / 2 - doorHeight / 2;

      context.fillStyle = outside;
      for (let column = 0; column < doorCount; column += 1) {
        const doorX = x + board + doorWidth * column;
        context.fillRect(doorX + 3, doorY, doorWidth - 6, doorHeight);
        context.fillStyle = "rgba(255, 255, 255, 0.24)";
        context.fillRect(doorX + doorWidth * 0.72, doorY + doorHeight * 0.24, 5, doorHeight * 0.32);
        context.fillStyle = outside;
      }
    }
  } else {
    drawRoundedRect(context, x, y, modelWidth, modelHeight, 8);
    context.fillStyle = outside;
    context.fill();
    context.shadowColor = "transparent";

    const glassX = x + frame;
    const glassY = y + frame;
    const glassWidth = modelWidth - frame * 2;
    const glassHeight = modelHeight - frame * 2;

    const glassGradient = context.createLinearGradient(glassX, glassY, glassX + glassWidth, glassY + glassHeight);
    glassGradient.addColorStop(0, "rgba(223, 250, 255, 0.9)");
    glassGradient.addColorStop(0.48, "rgba(145, 193, 205, 0.78)");
    glassGradient.addColorStop(1, "rgba(226, 250, 255, 0.86)");
    context.fillStyle = glassGradient;
    context.fillRect(glassX, glassY, glassWidth, glassHeight);

    context.strokeStyle = "rgba(255, 255, 255, 0.58)";
    context.lineWidth = Math.max(2, frame * 0.08);
    context.strokeRect(glassX + 3, glassY + 3, glassWidth - 6, glassHeight - 6);

    context.fillStyle = inside;
    const mullion = clampNumber(frame * 0.46, 6, 34);
    for (let column = 1; column < config.verticalDivisions; column += 1) {
      const lineX = glassX + (glassWidth / config.verticalDivisions) * column - mullion / 2;
      context.fillRect(lineX, glassY, mullion, glassHeight);
    }
    for (let row = 1; row < config.horizontalDivisions; row += 1) {
      const lineY = glassY + (glassHeight / config.horizontalDivisions) * row - mullion / 2;
      context.fillRect(glassX, lineY, glassWidth, mullion);
    }

    if (config.openingMode !== "fixed") {
      context.fillStyle = "rgba(17, 24, 32, 0.72)";
      const handleWidth = clampNumber(frame * 0.16, 4, 12);
      const handleHeight = clampNumber(modelHeight * 0.16, 44, 120);
      drawRoundedRect(
        context,
        x + modelWidth - frame * 0.62,
        y + modelHeight * 0.5 - handleHeight / 2,
        handleWidth,
        handleHeight,
        handleWidth / 2
      );
      context.fill();
    }
  }

  context.shadowColor = "transparent";
  context.strokeStyle = "rgba(255, 255, 255, 0.3)";
  context.lineWidth = 2;
  context.strokeRect(x + 1, y + 1, modelWidth - 2, modelHeight - 2);

  return canvas.toDataURL("image/png");
}

function createDefaultPlacement(offset = 0): PlacementState {
  return {
    x: clampNumber(50 + offset * 4, 18, 82),
    y: clampNumber(58 + offset * 3, 18, 82),
    scale: 52,
    rotation: 0,
    rotateX: 0,
    rotateY: 0
  };
}

function ProductionThreeScene({
  config,
  calculations,
  materialTextures,
  zoom
}: {
  config: RenderConfig;
  calculations: RenderCalculations;
  materialTextures: SceneMaterialTextures;
  zoom: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

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
    camera.zoom = zoomRef.current / 100;
    const model = new THREE.Group();
    scene.add(model);

    const outside = productColor(config.outsideColor);
    const inside = productColor(config.insideColor, outside);
    const outsideTexture = createUploadedTexture(materialTextures.outside, 2.2, 1.18);
    const insideTexture = createUploadedTexture(materialTextures.inside, 2.2, 1.18);
    const boardTexture =
      createUploadedTexture(materialTextures.panel, 2.8, 1.55) ?? createBoardTexture(outside);

    const profileMaterial = new THREE.MeshStandardMaterial({
      color: outsideTexture ? 0xffffff : outside,
      map: outsideTexture,
      metalness: 0.18,
      roughness: 0.34
    });
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: insideTexture ? 0xffffff : inside,
      map: insideTexture,
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
      depthWrite: false,
      metalness: 0,
      opacity: 0.38,
      roughness: 0.02,
      side: THREE.DoubleSide,
      thickness: 0.18,
      transmission: 0.58,
      transparent: true
    });
    const glassHighlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      opacity: 0.26,
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
      color: materialTextures.panel ? 0xffffff : outside,
      map: boardTexture,
      metalness: 0.02,
      roughness: 0.48
    });
    const width = clampNumber(config.width / 620, 1.4, 5.4);
    const height = clampNumber(config.height / 620, 1.2, 5.1);
    const depth = clampNumber(config.depth / 260, 0.22, 1.9);
    const frame = scaledFrameThickness(config);
    const reveal = scaledRevealGap(config);
    const frontProjection = scaledFrontProjection(config);
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

    function addSphere(
      target: THREE.Group,
      radius: number,
      position: THREE.Vector3Tuple,
      material: THREE.Material
    ) {
      const geometry = new THREE.SphereGeometry(radius, 24, 16);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      target.add(mesh);
      return mesh;
    }

    function buildJoinery() {
      const mainDepth = Math.max(depth * 0.86, 0.16);
      const faceDepth = Math.max(depth * 0.2, 0.055);
      const faceZ = depth / 2 + faceDepth / 2;
      const groove = clampNumber(frame * 0.08 + reveal * 0.45, 0.014, 0.09);
      const lip = clampNumber(frame * 0.16, 0.028, 0.12);
      const bead = clampNumber(frame * 0.12 + reveal * 0.22, 0.02, 0.09);
      const sash = clampNumber(frame * 0.44 + reveal * 0.38, frame * 0.28, frame * 0.68);
      const sashDepth = Math.max(depth * 0.48, 0.13);
      const sashZ = config.openingMode === "fixed" ? depth * 0.2 : depth * 0.3 + frontProjection;
      const beadZ = sashZ + sashDepth / 2 + faceDepth * 0.42;
      const glassZ = sashZ + sashDepth / 2 + 0.018;

      addBox(model, [width, frame, mainDepth], [0, height / 2 - frame / 2, 0], profileMaterial, false);
      addBox(model, [width, frame, mainDepth], [0, -height / 2 + frame / 2, 0], profileMaterial, false);
      addBox(model, [frame, height, mainDepth], [-width / 2 + frame / 2, 0, 0], profileMaterial, false);
      addBox(model, [frame, height, mainDepth], [width / 2 - frame / 2, 0, 0], profileMaterial, false);

      const innerWidth = Math.max(0.4, width - frame * 2);
      const innerHeight = Math.max(0.4, height - frame * 2);
      const paneWidth = innerWidth / config.verticalDivisions;
      const paneHeight = innerHeight / config.horizontalDivisions;

      addBox(model, [width - frame * 0.52, lip, faceDepth], [0, height / 2 - frame + lip / 2, faceZ], innerMaterial, false);
      addBox(model, [width - frame * 0.52, lip, faceDepth], [0, -height / 2 + frame - lip / 2, faceZ], innerMaterial, false);
      addBox(model, [lip, height - frame * 0.52, faceDepth], [-width / 2 + frame - lip / 2, 0, faceZ], innerMaterial, false);
      addBox(model, [lip, height - frame * 0.52, faceDepth], [width / 2 - frame + lip / 2, 0, faceZ], innerMaterial, false);

      addBox(model, [innerWidth, groove, faceDepth * 0.55], [0, innerHeight / 2 - groove / 2, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox(model, [innerWidth, groove, faceDepth * 0.55], [0, -innerHeight / 2 + groove / 2, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox(model, [groove, innerHeight, faceDepth * 0.55], [-innerWidth / 2 + groove / 2, 0, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox(model, [groove, innerHeight, faceDepth * 0.55], [innerWidth / 2 - groove / 2, 0, faceZ + faceDepth * 0.34], gasketMaterial, false);

      function addStructuralBar(centerX: number, centerY: number, length: number, horizontal: boolean) {
        if (horizontal) {
          addBox(model, [innerWidth, frame * 0.56, mainDepth * 0.92], [0, centerY, depth * 0.02], innerMaterial, false);
          addBox(model, [innerWidth - lip, lip, faceDepth], [0, centerY, faceZ], profileMaterial, false);
          addBox(model, [innerWidth - lip * 1.8, groove, faceDepth * 0.6], [0, centerY, faceZ + faceDepth * 0.44], gasketMaterial, false);
          return;
        }

        addBox(model, [frame * 0.56, length, mainDepth * 0.92], [centerX, 0, depth * 0.02], innerMaterial, false);
        addBox(model, [lip, length - lip, faceDepth], [centerX, 0, faceZ], profileMaterial, false);
        addBox(model, [groove, length - lip * 1.7, faceDepth * 0.6], [centerX, 0, faceZ + faceDepth * 0.44], gasketMaterial, false);
      }

      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addStructuralBar(-innerWidth / 2 + paneWidth * column, 0, innerHeight, false);
      }
      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addStructuralBar(0, innerHeight / 2 - paneHeight * row, innerWidth, true);
      }

      for (let row = 0; row < config.horizontalDivisions; row += 1) {
        for (let column = 0; column < config.verticalDivisions; column += 1) {
          const centerX = -innerWidth / 2 + paneWidth * (column + 0.5);
          const centerY = innerHeight / 2 - paneHeight * (row + 0.5);
          const sashOuterWidth = Math.max(0.24, paneWidth - reveal * 0.75);
          const sashOuterHeight = Math.max(0.24, paneHeight - reveal * 0.75);
          const clearWidth = Math.max(0.12, sashOuterWidth - sash * 2 - reveal * 2);
          const clearHeight = Math.max(0.12, sashOuterHeight - sash * 2 - reveal * 2);
          const gasketWidth = clearWidth + bead * 1.55;
          const gasketHeight = clearHeight + bead * 1.55;

          addBox(model, [sashOuterWidth, sash, sashDepth], [centerX, centerY + sashOuterHeight / 2 - sash / 2, sashZ], innerMaterial, false);
          addBox(model, [sashOuterWidth, sash, sashDepth], [centerX, centerY - sashOuterHeight / 2 + sash / 2, sashZ], innerMaterial, false);
          addBox(model, [sash, sashOuterHeight, sashDepth], [centerX - sashOuterWidth / 2 + sash / 2, centerY, sashZ], innerMaterial, false);
          addBox(model, [sash, sashOuterHeight, sashDepth], [centerX + sashOuterWidth / 2 - sash / 2, centerY, sashZ], innerMaterial, false);

          addBox(model, [gasketWidth, groove, faceDepth * 0.72], [centerX, centerY + gasketHeight / 2, beadZ], gasketMaterial, false);
          addBox(model, [gasketWidth, groove, faceDepth * 0.72], [centerX, centerY - gasketHeight / 2, beadZ], gasketMaterial, false);
          addBox(model, [groove, gasketHeight, faceDepth * 0.72], [centerX - gasketWidth / 2, centerY, beadZ], gasketMaterial, false);
          addBox(model, [groove, gasketHeight, faceDepth * 0.72], [centerX + gasketWidth / 2, centerY, beadZ], gasketMaterial, false);

          addBox(model, [clearWidth + bead, bead, faceDepth * 0.8], [centerX, centerY + clearHeight / 2 + bead / 2, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox(model, [clearWidth + bead, bead, faceDepth * 0.8], [centerX, centerY - clearHeight / 2 - bead / 2, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox(model, [bead, clearHeight + bead, faceDepth * 0.8], [centerX - clearWidth / 2 - bead / 2, centerY, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox(model, [bead, clearHeight + bead, faceDepth * 0.8], [centerX + clearWidth / 2 + bead / 2, centerY, beadZ + faceDepth * 0.18], profileMaterial, false);

          const backGlass = addBox(model, [clearWidth, clearHeight, 0.018], [centerX, centerY, glassZ - 0.055], glassMaterial, false);
          const frontGlass = addBox(model, [clearWidth, clearHeight, 0.022], [centerX, centerY, glassZ + 0.018], glassMaterial, false);
          backGlass.castShadow = false;
          frontGlass.castShadow = false;

          addBox(model, [Math.max(clearWidth * 0.035, 0.012), clearHeight * 0.84, 0.012], [centerX - clearWidth * 0.28, centerY + clearHeight * 0.02, glassZ + 0.04], glassHighlightMaterial, false);
          addBox(model, [Math.max(clearWidth * 0.018, 0.008), clearHeight * 0.58, 0.012], [centerX + clearWidth * 0.32, centerY + clearHeight * 0.08, glassZ + 0.045], glassHighlightMaterial, false);
        }
      }

      if (config.openingMode !== "fixed") {
        const handleHeight = scaledHandleLength(config, height);
        const handleOffset = scaledHandleEdgeOffset(config, width);
        const handleX = width / 2 - frame - handleOffset * 0.32;
        const handleZ = beadZ + faceDepth * 0.85;
        addBox(model, [frame * 0.18, handleHeight * 1.08, frame * 0.09], [handleX, 0, handleZ - frame * 0.05], gasketMaterial, false);
        addBox(model, [frame * 0.12, handleHeight, frame * 0.12], [handleX, 0, handleZ + frame * 0.06], metalMaterial, false);
        addBox(model, [frame * 0.2, frame * 0.2, frame * 0.1], [handleX, handleHeight * 0.38, handleZ + frame * 0.04], metalMaterial, false);
        addBox(model, [frame * 0.2, frame * 0.2, frame * 0.1], [handleX, -handleHeight * 0.38, handleZ + frame * 0.04], metalMaterial, false);

        [-0.31, 0, 0.31].forEach((offset) => {
          addBox(model, [frame * 0.16, frame * 0.34, frame * 0.16], [-width / 2 + frame * 0.3, offset * height, faceZ + faceDepth * 0.1], metalMaterial, false);
        });
      }

      if (config.openingMode === "sliding") {
        addBox(model, [width * 0.92, frame * 0.13, depth * 0.18], [0, -height / 2 + frame * 1.15, faceZ], metalMaterial);
        addBox(model, [width * 0.92, frame * 0.13, depth * 0.18], [0, height / 2 - frame * 1.15, faceZ], metalMaterial);
      }

      addBox(model, [width - frame * 1.3, frame * 0.08, depth * 0.08], [0, -height / 2 + frame * 1.2, depth * 0.62], gasketMaterial, false);
    }

    function buildFurniture() {
      const board = frame;
      const innerWidth = Math.max(0.28, width - board * 2);
      const innerHeight = Math.max(0.28, height - board * 2);
      addBox(model, [board, height, depth], [-width / 2 + board / 2, 0, 0], boardMaterial);
      addBox(model, [board, height, depth], [width / 2 - board / 2, 0, 0], boardMaterial);
      addBox(model, [width, board, depth], [0, height / 2 - board / 2, 0], boardMaterial);
      addBox(model, [width, board, depth], [0, -height / 2 + board / 2, 0], boardMaterial);
      addBox(model, [width - board * 2, height - board * 2, board * 0.35], [0, 0, -depth / 2 + board * 0.18], boardMaterial, false);

      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addBox(model, [innerWidth, board * 0.72, depth * 0.92], [0, height / 2 - (height / config.horizontalDivisions) * row, 0], boardMaterial);
      }
      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addBox(model, [board * 0.72, height - board * 2, depth * 0.92], [-width / 2 + (width / config.verticalDivisions) * column, 0, 0], boardMaterial);
      }

      const trimDepth = Math.max(board * 0.18, frontProjection * 0.4, 0.026);
      const trimWidth = Math.max(board * 0.28, reveal * 0.75, 0.035);
      const trimZ = depth / 2 + trimDepth / 2;
      addBox(model, [innerWidth, trimWidth, trimDepth], [0, innerHeight / 2 - trimWidth / 2, trimZ], gasketMaterial, false);
      addBox(model, [innerWidth, trimWidth, trimDepth], [0, -innerHeight / 2 + trimWidth / 2, trimZ], gasketMaterial, false);
      addBox(model, [trimWidth, innerHeight, trimDepth], [-innerWidth / 2 + trimWidth / 2, 0, trimZ], gasketMaterial, false);
      addBox(model, [trimWidth, innerHeight, trimDepth], [innerWidth / 2 - trimWidth / 2, 0, trimZ], gasketMaterial, false);

      const doorCount = Math.max(1, config.verticalDivisions);
      const moduleWidth = innerWidth / doorCount;
      const doorThickness = Math.max(frontProjection, board * 0.22, 0.035);
      const doorWidth = clampNumber(
        config.doorWidth / 620,
        Math.min(0.12, moduleWidth * 0.5),
        config.doorSystem === "sliding" ? moduleWidth * 1.16 : moduleWidth * 0.96
      );
      const doorHeight = clampNumber(config.doorHeight / 620, 0.12, innerHeight * 0.98);
      const frontZ = depth / 2 + doorThickness * 0.72;

      function addFurnitureHandle(
        centerX: number,
        centerY: number,
        panelZ: number,
        panelWidth: number,
        panelHeight: number,
        sideSign: number
      ) {
        const handleX = centerX + sideSign * (panelWidth / 2 - scaledHandleEdgeOffset(config, panelWidth));
        const handleZ = panelZ + doorThickness * 0.9;
        const handleHeight = scaledHandleLength(config, panelHeight);

        if (config.handleType === "knob") {
          addSphere(model, clampNumber(board * 0.18, 0.035, 0.07), [handleX, centerY, handleZ], metalMaterial);
          return;
        }

        if (config.handleType === "edge") {
          addBox(
            model,
            [Math.max(board * 0.09, 0.025), handleHeight, Math.max(board * 0.08, 0.026)],
            [centerX + sideSign * (panelWidth / 2 - board * 0.05), centerY, handleZ],
            metalMaterial,
            false
          );
          return;
        }

        if (config.handleType === "recessed") {
          addBox(
            model,
            [Math.max(board * 0.18, 0.05), handleHeight * 1.15, Math.max(board * 0.04, 0.018)],
            [handleX, centerY, handleZ],
            gasketMaterial,
            false
          );
          addBox(
            model,
            [Math.max(board * 0.08, 0.02), handleHeight * 0.86, Math.max(board * 0.035, 0.016)],
            [handleX, centerY, handleZ + 0.006],
            metalMaterial,
            false
          );
          return;
        }

        if (config.handleType === "sliding-pull") {
          addBox(
            model,
            [Math.max(board * 0.22, 0.06), handleHeight * 1.35, Math.max(board * 0.045, 0.02)],
            [handleX, centerY, handleZ],
            gasketMaterial,
            false
          );
          addBox(
            model,
            [Math.max(board * 0.04, 0.016), handleHeight * 1.18, Math.max(board * 0.035, 0.016)],
            [handleX + sideSign * board * 0.05, centerY, handleZ + 0.008],
            metalMaterial,
            false
          );
          return;
        }

        addBox(
          model,
          [Math.max(board * 0.12, 0.035), handleHeight, Math.max(board * 0.1, 0.028)],
          [handleX, centerY, handleZ],
          metalMaterial,
          false
        );
      }

      if (config.doorSystem === "sliding") {
        addBox(model, [innerWidth, Math.max(board * 0.18, 0.04), Math.max(board * 0.18, 0.035)], [0, doorHeight / 2 + board * 0.34, frontZ + reveal], metalMaterial, false);
        addBox(model, [innerWidth, Math.max(board * 0.18, 0.04), Math.max(board * 0.18, 0.035)], [0, -doorHeight / 2 - board * 0.34, frontZ + reveal], metalMaterial, false);
      }

      if (config.doorSystem !== "none") {
        for (let column = 0; column < doorCount; column += 1) {
          const sideSign = column % 2 === 0 ? 1 : -1;
          const centerX =
            config.doorSystem === "sliding"
              ? doorCount === 1
                ? 0
                : -Math.max(0, innerWidth - doorWidth) / 2 +
                  (Math.max(0, innerWidth - doorWidth) / (doorCount - 1)) * column
              : -innerWidth / 2 + moduleWidth * (column + 0.5);
          const panelZ =
            config.doorSystem === "sliding"
              ? frontZ + (column % 2) * doorThickness * 1.35
              : frontZ;
          const visibleDoorWidth = Math.max(0.08, doorWidth - reveal * 2);
          const visibleDoorHeight = Math.max(0.08, doorHeight - reveal * 2);

          addBox(model, [doorWidth + reveal * 0.8, doorHeight + reveal * 0.8, Math.max(0.018, doorThickness * 0.26)], [centerX, 0, panelZ - doorThickness * 0.72], gasketMaterial, false);
          addBox(model, [visibleDoorWidth, visibleDoorHeight, doorThickness], [centerX, 0, panelZ], boardMaterial);
          if (config.doorSystem === "hinged") {
            [-0.32, 0.32].forEach((offset) => {
              addBox(
                model,
                [Math.max(board * 0.12, 0.035), Math.max(board * 0.45, 0.095), Math.max(board * 0.12, 0.032)],
                [centerX - sideSign * (visibleDoorWidth / 2 - board * 0.06), offset * visibleDoorHeight, panelZ + doorThickness * 0.65],
                metalMaterial,
                false
              );
            });
          }
          addFurnitureHandle(centerX, 0, panelZ, visibleDoorWidth, visibleDoorHeight, sideSign);
        }
      }
    }

    function buildUniversal() {
      const board = frame;
      const innerWidth = Math.max(0.28, width - board * 2);
      const innerHeight = Math.max(0.28, height - board * 2);
      const backThickness = Math.max(board * 0.32, 0.035);
      addBox(model, [width, board, depth], [0, height / 2 - board / 2, 0], boardMaterial);
      addBox(model, [width, board, depth], [0, -height / 2 + board / 2, 0], boardMaterial);
      addBox(model, [board, height, depth], [-width / 2 + board / 2, 0, 0], boardMaterial);
      addBox(model, [board, height, depth], [width / 2 - board / 2, 0, 0], boardMaterial);
      addBox(model, [innerWidth, innerHeight, backThickness], [0, 0, -depth / 2 + backThickness / 2], innerMaterial, false);

      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addBox(model, [innerWidth, board * 0.72, depth * 0.9], [0, height / 2 - (height / config.horizontalDivisions) * row, 0], boardMaterial);
      }
      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addBox(model, [board * 0.72, innerHeight, depth * 0.9], [-width / 2 + (width / config.verticalDivisions) * column, 0, 0], boardMaterial);
      }

      const trimDepth = Math.max(board * 0.2, frontProjection * 0.5, 0.028);
      const trimWidth = Math.max(board * 0.34, reveal * 0.9, 0.04);
      const trimZ = depth / 2 + trimDepth / 2;
      addBox(model, [innerWidth, trimWidth, trimDepth], [0, innerHeight / 2 - trimWidth / 2, trimZ], gasketMaterial, false);
      addBox(model, [innerWidth, trimWidth, trimDepth], [0, -innerHeight / 2 + trimWidth / 2, trimZ], gasketMaterial, false);
      addBox(model, [trimWidth, innerHeight, trimDepth], [-innerWidth / 2 + trimWidth / 2, 0, trimZ], gasketMaterial, false);
      addBox(model, [trimWidth, innerHeight, trimDepth], [innerWidth / 2 - trimWidth / 2, 0, trimZ], gasketMaterial, false);

      const plinthHeight = Math.min(board * 1.5, height * 0.12);
      addBox(model, [width * 0.82, plinthHeight, depth * 0.72], [0, -height / 2 - plinthHeight * 0.35, -depth * 0.04], gasketMaterial, false);
    }

    function buildFence() {
      const post = Math.max(frame * 0.92, 0.09);
      const rail = Math.max(frame * 0.5, 0.055);
      const railDepth = Math.max(depth * 0.62 + frontProjection * 0.55, post * 0.82);
      const sections = Math.max(1, config.verticalDivisions);
      const rails = Math.max(1, config.horizontalDivisions);
      const sectionWidth = width / sections;

      for (let index = 0; index <= sections; index += 1) {
        const x = -width / 2 + sectionWidth * index;
        addBox(model, [post, height, post], [x, 0, 0], profileMaterial);
        addBox(model, [post * 1.12, post * 0.18, post * 1.12], [x, height / 2 + post * 0.12, 0], metalMaterial, false);
        addBox(model, [post * 1.36, post * 0.16, post * 1.36], [x, -height / 2 - post * 0.08, 0], gasketMaterial, false);
      }

      for (let railIndex = 0; railIndex < rails; railIndex += 1) {
        const y =
          rails === 1
            ? 0
            : -height * 0.34 + (height * 0.68 / Math.max(1, rails - 1)) * railIndex;
        addBox(model, [width, rail, railDepth], [0, y, depth * 0.04 + frontProjection * 0.18], innerMaterial);
      }

      const balusterCount = Math.min(28, Math.max(sections * 2, sections + rails));
      const balusterHeight = height * 0.72;
      const balusterFace = Math.max(rail * 0.52 + reveal * 0.45, 0.035);
      for (let index = 0; index < balusterCount; index += 1) {
        const x = -width / 2 + (width / (balusterCount + 1)) * (index + 1);
        addBox(model, [balusterFace, balusterHeight, balusterFace], [x, 0, depth * 0.22 + frontProjection * 0.22], boardMaterial);
      }

      addBox(model, [width + post * 0.7, rail * 0.72, railDepth * 1.08], [0, height / 2 - rail * 0.7, depth * 0.05 + frontProjection * 0.18], profileMaterial);
    }

    if (config.family === "furniture") {
      buildFurniture();
    } else if (config.family === "universal") {
      buildUniversal();
    } else if (config.family === "fence") {
      buildFence();
    } else {
      buildJoinery();
    }

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

    camera.position.set(maxSize * 0.28, maxSize * 0.16, maxSize * 1.48 + 2);
    camera.lookAt(0, 0, 0);

    let targetRotationX = 0.045;
    let targetRotationY = -0.26;
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
      camera.zoom += (zoomRef.current / 100 - camera.zoom) * 0.16;
      camera.updateProjectionMatrix();
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
  }, [
    calculations.panes,
    config,
    materialTextures.inside,
    materialTextures.outside,
    materialTextures.panel
  ]);

  return <div className="render-canvas-host" ref={hostRef} />;
}

function PlacementThreeElement({
  element,
  selected
}: {
  element: SavedRenderElement;
  selected: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const config = element.config;
  const textures = element.textures;
  const placementStyle = {
    "--placement-ratio": String(clampNumber(element.width / Math.max(1, element.height), 0.28, 4.2)),
    left: `${element.placement.x}%`,
    top: `${element.placement.y}%`,
    transform: `translate(-50%, -50%) perspective(900px) rotateX(${element.placement.rotateX}deg) rotateY(${element.placement.rotateY}deg) rotateZ(${element.placement.rotation}deg)`,
    width: `${element.placement.scale}%`
  } as CSSProperties;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }
    const container = host;

    const scene = new THREE.Scene();
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.domElement.className = "placement-three-canvas";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    const model = new THREE.Group();
    scene.add(model);

    const outside = productColor(config.outsideColor);
    const inside = productColor(config.insideColor, outside);
    const outsideTexture = createUploadedTexture(textures.outside, 2.2, 1.18);
    const insideTexture = createUploadedTexture(textures.inside, 2.2, 1.18);
    const boardTexture =
      createUploadedTexture(textures.panel, 2.8, 1.55) ?? createBoardTexture(outside);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.18,
      transparent: true
    });
    const profileMaterial = new THREE.MeshStandardMaterial({
      color: outsideTexture ? 0xffffff : outside,
      map: outsideTexture,
      metalness: 0.18,
      roughness: 0.34
    });
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: insideTexture ? 0xffffff : inside,
      map: insideTexture,
      metalness: 0.1,
      roughness: 0.42
    });
    const boardMaterial = new THREE.MeshStandardMaterial({
      color: textures.panel ? 0xffffff : outside,
      map: boardTexture,
      metalness: 0.02,
      roughness: 0.48
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xcff7ff,
      depthWrite: false,
      metalness: 0,
      opacity: 0.34,
      roughness: 0.03,
      side: THREE.DoubleSide,
      thickness: 0.14,
      transmission: 0.54,
      transparent: true
    });
    const glassHighlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthWrite: false,
      opacity: 0.24,
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

    const width = clampNumber(config.width / 620, 0.75, 5.4);
    const height = clampNumber(config.height / 620, 0.55, 5.1);
    const depth = clampNumber(config.depth / 260, 0.08, 1.9);
    const frame = scaledFrameThickness(config);
    const reveal = scaledRevealGap(config);
    const frontProjection = scaledFrontProjection(config);

    function addBox(
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
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial));
      }
      model.add(mesh);
      return mesh;
    }

    function addSphere(radius: number, position: THREE.Vector3Tuple, material: THREE.Material) {
      const geometry = new THREE.SphereGeometry(radius, 24, 16);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true;
      model.add(mesh);
      return mesh;
    }

    function addFurnitureHandle(
      centerX: number,
      centerY: number,
      panelZ: number,
      panelWidth: number,
      panelHeight: number,
      sideSign: number,
      board: number,
      doorThickness: number
    ) {
      const handleX = centerX + sideSign * (panelWidth / 2 - scaledHandleEdgeOffset(config, panelWidth));
      const handleZ = panelZ + doorThickness * 0.9;
      const handleHeight = scaledHandleLength(config, panelHeight);

      if (config.handleType === "knob") {
        addSphere(clampNumber(board * 0.18, 0.035, 0.07), [handleX, centerY, handleZ], metalMaterial);
        return;
      }

      if (config.handleType === "edge") {
        addBox(
          [Math.max(board * 0.09, 0.025), handleHeight, Math.max(board * 0.08, 0.026)],
          [centerX + sideSign * (panelWidth / 2 - board * 0.05), centerY, handleZ],
          metalMaterial,
          false
        );
        return;
      }

      if (config.handleType === "recessed" || config.handleType === "sliding-pull") {
        addBox(
          [Math.max(board * 0.18, 0.05), handleHeight * 1.15, Math.max(board * 0.04, 0.018)],
          [handleX, centerY, handleZ],
          gasketMaterial,
          false
        );
        addBox(
          [Math.max(board * 0.07, 0.018), handleHeight * 0.9, Math.max(board * 0.035, 0.016)],
          [handleX + sideSign * board * 0.04, centerY, handleZ + 0.008],
          metalMaterial,
          false
        );
        return;
      }

      addBox(
        [Math.max(board * 0.12, 0.035), handleHeight, Math.max(board * 0.1, 0.028)],
        [handleX, centerY, handleZ],
        metalMaterial,
        false
      );
    }

    function buildJoinery() {
      const mainDepth = Math.max(depth * 0.86, 0.16);
      const faceDepth = Math.max(depth * 0.2, 0.055);
      const faceZ = depth / 2 + faceDepth / 2;
      const groove = clampNumber(frame * 0.08 + reveal * 0.45, 0.014, 0.09);
      const lip = clampNumber(frame * 0.16, 0.028, 0.12);
      const bead = clampNumber(frame * 0.12 + reveal * 0.22, 0.02, 0.09);
      const sash = clampNumber(frame * 0.44 + reveal * 0.38, frame * 0.28, frame * 0.68);
      const sashDepth = Math.max(depth * 0.48, 0.13);
      const sashZ = config.openingMode === "fixed" ? depth * 0.2 : depth * 0.3 + frontProjection;
      const beadZ = sashZ + sashDepth / 2 + faceDepth * 0.42;
      const glassZ = sashZ + sashDepth / 2 + 0.018;

      addBox([width, frame, mainDepth], [0, height / 2 - frame / 2, 0], profileMaterial, false);
      addBox([width, frame, mainDepth], [0, -height / 2 + frame / 2, 0], profileMaterial, false);
      addBox([frame, height, mainDepth], [-width / 2 + frame / 2, 0, 0], profileMaterial, false);
      addBox([frame, height, mainDepth], [width / 2 - frame / 2, 0, 0], profileMaterial, false);

      const innerWidth = Math.max(0.3, width - frame * 2);
      const innerHeight = Math.max(0.3, height - frame * 2);
      const paneWidth = innerWidth / config.verticalDivisions;
      const paneHeight = innerHeight / config.horizontalDivisions;

      addBox([width - frame * 0.52, lip, faceDepth], [0, height / 2 - frame + lip / 2, faceZ], innerMaterial, false);
      addBox([width - frame * 0.52, lip, faceDepth], [0, -height / 2 + frame - lip / 2, faceZ], innerMaterial, false);
      addBox([lip, height - frame * 0.52, faceDepth], [-width / 2 + frame - lip / 2, 0, faceZ], innerMaterial, false);
      addBox([lip, height - frame * 0.52, faceDepth], [width / 2 - frame + lip / 2, 0, faceZ], innerMaterial, false);

      addBox([innerWidth, groove, faceDepth * 0.55], [0, innerHeight / 2 - groove / 2, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox([innerWidth, groove, faceDepth * 0.55], [0, -innerHeight / 2 + groove / 2, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox([groove, innerHeight, faceDepth * 0.55], [-innerWidth / 2 + groove / 2, 0, faceZ + faceDepth * 0.34], gasketMaterial, false);
      addBox([groove, innerHeight, faceDepth * 0.55], [innerWidth / 2 - groove / 2, 0, faceZ + faceDepth * 0.34], gasketMaterial, false);

      function addStructuralBar(centerX: number, centerY: number, length: number, horizontal: boolean) {
        if (horizontal) {
          addBox([innerWidth, frame * 0.56, mainDepth * 0.92], [0, centerY, depth * 0.02], innerMaterial, false);
          addBox([innerWidth - lip, lip, faceDepth], [0, centerY, faceZ], profileMaterial, false);
          addBox([innerWidth - lip * 1.8, groove, faceDepth * 0.6], [0, centerY, faceZ + faceDepth * 0.44], gasketMaterial, false);
          return;
        }

        addBox([frame * 0.56, length, mainDepth * 0.92], [centerX, 0, depth * 0.02], innerMaterial, false);
        addBox([lip, length - lip, faceDepth], [centerX, 0, faceZ], profileMaterial, false);
        addBox([groove, length - lip * 1.7, faceDepth * 0.6], [centerX, 0, faceZ + faceDepth * 0.44], gasketMaterial, false);
      }

      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addStructuralBar(-innerWidth / 2 + paneWidth * column, 0, innerHeight, false);
      }
      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addStructuralBar(0, innerHeight / 2 - paneHeight * row, innerWidth, true);
      }

      for (let row = 0; row < config.horizontalDivisions; row += 1) {
        for (let column = 0; column < config.verticalDivisions; column += 1) {
          const centerX = -innerWidth / 2 + paneWidth * (column + 0.5);
          const centerY = innerHeight / 2 - paneHeight * (row + 0.5);
          const sashOuterWidth = Math.max(0.2, paneWidth - reveal * 0.75);
          const sashOuterHeight = Math.max(0.2, paneHeight - reveal * 0.75);
          const clearWidth = Math.max(0.1, sashOuterWidth - sash * 2 - reveal * 2);
          const clearHeight = Math.max(0.1, sashOuterHeight - sash * 2 - reveal * 2);
          const gasketWidth = clearWidth + bead * 1.55;
          const gasketHeight = clearHeight + bead * 1.55;

          addBox([sashOuterWidth, sash, sashDepth], [centerX, centerY + sashOuterHeight / 2 - sash / 2, sashZ], innerMaterial, false);
          addBox([sashOuterWidth, sash, sashDepth], [centerX, centerY - sashOuterHeight / 2 + sash / 2, sashZ], innerMaterial, false);
          addBox([sash, sashOuterHeight, sashDepth], [centerX - sashOuterWidth / 2 + sash / 2, centerY, sashZ], innerMaterial, false);
          addBox([sash, sashOuterHeight, sashDepth], [centerX + sashOuterWidth / 2 - sash / 2, centerY, sashZ], innerMaterial, false);

          addBox([gasketWidth, groove, faceDepth * 0.72], [centerX, centerY + gasketHeight / 2, beadZ], gasketMaterial, false);
          addBox([gasketWidth, groove, faceDepth * 0.72], [centerX, centerY - gasketHeight / 2, beadZ], gasketMaterial, false);
          addBox([groove, gasketHeight, faceDepth * 0.72], [centerX - gasketWidth / 2, centerY, beadZ], gasketMaterial, false);
          addBox([groove, gasketHeight, faceDepth * 0.72], [centerX + gasketWidth / 2, centerY, beadZ], gasketMaterial, false);

          addBox([clearWidth + bead, bead, faceDepth * 0.8], [centerX, centerY + clearHeight / 2 + bead / 2, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox([clearWidth + bead, bead, faceDepth * 0.8], [centerX, centerY - clearHeight / 2 - bead / 2, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox([bead, clearHeight + bead, faceDepth * 0.8], [centerX - clearWidth / 2 - bead / 2, centerY, beadZ + faceDepth * 0.18], profileMaterial, false);
          addBox([bead, clearHeight + bead, faceDepth * 0.8], [centerX + clearWidth / 2 + bead / 2, centerY, beadZ + faceDepth * 0.18], profileMaterial, false);

          const backGlass = addBox([clearWidth, clearHeight, 0.018], [centerX, centerY, glassZ - 0.055], glassMaterial, false);
          const frontGlass = addBox([clearWidth, clearHeight, 0.022], [centerX, centerY, glassZ + 0.018], glassMaterial, false);
          backGlass.castShadow = false;
          frontGlass.castShadow = false;

          addBox([Math.max(clearWidth * 0.035, 0.012), clearHeight * 0.84, 0.012], [centerX - clearWidth * 0.28, centerY + clearHeight * 0.02, glassZ + 0.04], glassHighlightMaterial, false);
          addBox([Math.max(clearWidth * 0.018, 0.008), clearHeight * 0.58, 0.012], [centerX + clearWidth * 0.32, centerY + clearHeight * 0.08, glassZ + 0.045], glassHighlightMaterial, false);
        }
      }

      if (config.openingMode !== "fixed") {
        const handleHeight = scaledHandleLength(config, height);
        const handleOffset = scaledHandleEdgeOffset(config, width);
        const handleX = width / 2 - frame - handleOffset * 0.32;
        const handleZ = beadZ + faceDepth * 0.85;
        addBox([frame * 0.18, handleHeight * 1.08, frame * 0.09], [handleX, 0, handleZ - frame * 0.05], gasketMaterial, false);
        addBox([frame * 0.12, handleHeight, frame * 0.12], [handleX, 0, handleZ + frame * 0.06], metalMaterial, false);
        addBox([frame * 0.2, frame * 0.2, frame * 0.1], [handleX, handleHeight * 0.38, handleZ + frame * 0.04], metalMaterial, false);
        addBox([frame * 0.2, frame * 0.2, frame * 0.1], [handleX, -handleHeight * 0.38, handleZ + frame * 0.04], metalMaterial, false);

        [-0.31, 0, 0.31].forEach((offset) => {
          addBox([frame * 0.16, frame * 0.34, frame * 0.16], [-width / 2 + frame * 0.3, offset * height, faceZ + faceDepth * 0.1], metalMaterial, false);
        });
      }
    }

    function buildFurniture() {
      const board = frame;
      const innerWidth = Math.max(0.25, width - board * 2);
      const innerHeight = Math.max(0.25, height - board * 2);
      addBox([board, height, depth], [-width / 2 + board / 2, 0, 0], boardMaterial);
      addBox([board, height, depth], [width / 2 - board / 2, 0, 0], boardMaterial);
      addBox([width, board, depth], [0, height / 2 - board / 2, 0], boardMaterial);
      addBox([width, board, depth], [0, -height / 2 + board / 2, 0], boardMaterial);
      addBox([innerWidth, innerHeight, board * 0.32], [0, 0, -depth / 2 + board * 0.16], innerMaterial, false);

      for (let row = 1; row < config.horizontalDivisions; row += 1) {
        addBox([innerWidth, board * 0.7, depth * 0.9], [0, height / 2 - (height / config.horizontalDivisions) * row, 0], boardMaterial);
      }
      for (let column = 1; column < config.verticalDivisions; column += 1) {
        addBox([board * 0.7, innerHeight, depth * 0.9], [-width / 2 + (width / config.verticalDivisions) * column, 0, 0], boardMaterial);
      }

      const trimDepth = Math.max(board * 0.18, frontProjection * 0.4, 0.026);
      const trimWidth = Math.max(board * 0.28, reveal * 0.75, 0.035);
      const trimZ = depth / 2 + trimDepth / 2;
      addBox([innerWidth, trimWidth, trimDepth], [0, innerHeight / 2 - trimWidth / 2, trimZ], gasketMaterial, false);
      addBox([innerWidth, trimWidth, trimDepth], [0, -innerHeight / 2 + trimWidth / 2, trimZ], gasketMaterial, false);
      addBox([trimWidth, innerHeight, trimDepth], [-innerWidth / 2 + trimWidth / 2, 0, trimZ], gasketMaterial, false);
      addBox([trimWidth, innerHeight, trimDepth], [innerWidth / 2 - trimWidth / 2, 0, trimZ], gasketMaterial, false);

      if (config.family !== "furniture" || config.doorSystem === "none") {
        return;
      }

      const doorCount = Math.max(1, config.verticalDivisions);
      const moduleWidth = innerWidth / doorCount;
      const doorThickness = Math.max(frontProjection, board * 0.22, 0.035);
      const doorWidth = clampNumber(config.doorWidth / 620, 0.12, config.doorSystem === "sliding" ? moduleWidth * 1.16 : moduleWidth * 0.96);
      const doorHeight = clampNumber(config.doorHeight / 620, 0.12, innerHeight * 0.98);
      const frontZ = depth / 2 + doorThickness * 0.72;

      if (config.doorSystem === "sliding") {
        addBox([innerWidth, Math.max(board * 0.18, 0.04), Math.max(board * 0.18, 0.035)], [0, doorHeight / 2 + board * 0.34, frontZ + reveal], metalMaterial, false);
        addBox([innerWidth, Math.max(board * 0.18, 0.04), Math.max(board * 0.18, 0.035)], [0, -doorHeight / 2 - board * 0.34, frontZ + reveal], metalMaterial, false);
      }

      for (let column = 0; column < doorCount; column += 1) {
        const sideSign = column % 2 === 0 ? 1 : -1;
        const centerX =
          config.doorSystem === "sliding"
            ? doorCount === 1
              ? 0
              : -Math.max(0, innerWidth - doorWidth) / 2 +
                (Math.max(0, innerWidth - doorWidth) / (doorCount - 1)) * column
            : -innerWidth / 2 + moduleWidth * (column + 0.5);
        const panelZ = config.doorSystem === "sliding" ? frontZ + (column % 2) * doorThickness * 1.35 : frontZ;
        const visibleDoorWidth = Math.max(0.08, doorWidth - reveal * 2);
        const visibleDoorHeight = Math.max(0.08, doorHeight - reveal * 2);
        addBox([doorWidth + reveal * 0.8, doorHeight + reveal * 0.8, Math.max(0.018, doorThickness * 0.26)], [centerX, 0, panelZ - doorThickness * 0.72], gasketMaterial, false);
        addBox([visibleDoorWidth, visibleDoorHeight, doorThickness], [centerX, 0, panelZ], boardMaterial);
        addFurnitureHandle(centerX, 0, panelZ, visibleDoorWidth, visibleDoorHeight, sideSign, board, doorThickness);
      }
    }

    function buildFence() {
      const post = Math.max(frame * 0.92, 0.09);
      const rail = Math.max(frame * 0.5, 0.055);
      const railDepth = Math.max(depth * 0.62 + frontProjection * 0.55, post * 0.82);
      const sections = Math.max(1, config.verticalDivisions);
      const rails = Math.max(1, config.horizontalDivisions);
      const sectionWidth = width / sections;

      for (let index = 0; index <= sections; index += 1) {
        addBox([post, height, post], [-width / 2 + sectionWidth * index, 0, 0], profileMaterial);
      }
      for (let railIndex = 0; railIndex < rails; railIndex += 1) {
        const y =
          rails === 1
            ? 0
            : -height * 0.34 + (height * 0.68 / Math.max(1, rails - 1)) * railIndex;
        addBox([width, rail, railDepth], [0, y, depth * 0.04 + frontProjection * 0.18], innerMaterial);
      }
      const balusterCount = Math.min(28, Math.max(sections * 2, sections + rails));
      const balusterFace = Math.max(rail * 0.52 + reveal * 0.45, 0.035);
      for (let index = 0; index < balusterCount; index += 1) {
        const x = -width / 2 + (width / (balusterCount + 1)) * (index + 1);
        addBox([balusterFace, height * 0.72, balusterFace], [x, 0, depth * 0.22 + frontProjection * 0.22], boardMaterial);
      }
    }

    if (config.family === "fence") {
      buildFence();
    } else if (config.family === "furniture" || config.family === "universal") {
      buildFurniture();
    } else {
      buildJoinery();
    }

    const ambient = new THREE.HemisphereLight(0xffffff, 0x26302c, 1.42);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(-2.2, 3.8, 4.2);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0xf97316, 4.2, 7);
    rimLight.position.set(2.4, 1.6, 3.4);
    scene.add(rimLight);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    model.position.sub(center);

    function resize() {
      const bounds = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(bounds.width));
      const nextHeight = Math.max(1, Math.floor(bounds.height));
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      const fitSize = Math.max(size.y, size.x / Math.max(0.45, camera.aspect), 0.4);
      camera.position.set(0, 0, fitSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.34 + size.z);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }

    let frameId = 0;
    function renderFrame() {
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    renderFrame();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
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
  }, [config, textures.inside, textures.outside, textures.panel]);

  return (
    <div
      aria-label={element.label}
      className={classNames("placed-render-element", selected && "active")}
      ref={hostRef}
      style={placementStyle}
    />
  );
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
    doorSystem: "hinged",
    doorWidth: 520,
    doorHeight: 1420,
    revealGap: 6,
    frontProjection: 28,
    handleLength: 360,
    handleOffset: 70,
    handleType: "bar",
    series: "PVC 82MD",
    profileStatus: "DOSTUPNO",
    glassStatus: "DSL - DOSTUPNO",
    panelStatus: "GLATKI - DOSTUPNO",
    insideColor: "BIANCO",
    outsideColor: "ANTRAZIT",
    insideTextureId: "",
    outsideTextureId: "",
    panelTextureId: "",
    stockProfileLength: 6500,
    stockGlassWidth: 3210,
    stockGlassHeight: 2250,
    stockPanelWidth: 2800,
    stockPanelHeight: 2070
  });
  const [savedElements, setSavedElements] = useState<SavedRenderElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState("");
  const [roomPhoto, setRoomPhoto] = useState("");
  const [placementMode, setPlacementMode] = useState<PlacementMode>("move");
  const [renderZoom, setRenderZoom] = useState(100);
  const [draftNumbers, setDraftNumbers] = useState<
    Partial<Record<NumericConfigKey, string>>
  >({});
  const [isDraggingPlacement, setIsDraggingPlacement] = useState(false);
  const renderStageRef = useRef<HTMLDivElement | null>(null);
  const placementRef = useRef<HTMLDivElement | null>(null);
  const roomPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const selectedElement =
    savedElements.find((element) => element.id === selectedElementId) ??
    savedElements[0] ??
    null;
  const placement = selectedElement?.placement ?? createDefaultPlacement();

  useEffect(() => {
    const stage = renderStageRef.current;
    if (!stage) {
      return undefined;
    }

    function handleWheel(event: globalThis.WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      setRenderZoom((previous) =>
        Math.round(clampNumber(previous + (event.deltaY > 0 ? -7 : 7), 55, 180))
      );
    }

    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const stockTextures = useMemo<StockTexture[]>(
    () =>
      stock
        .filter((item) => item.textureImage)
        .map((item) => ({
          id: item.id ?? item.name,
          name: item.textureName ? `${item.name} - ${item.textureName}` : item.name,
          category: item.category,
          image: item.textureImage ?? "",
          supplier: item.supplier
        })),
    [stock]
  );

  const findStockTexture = (id: string) =>
    stockTextures.find((texture) => texture.id === id);

  const firstStockTexture = (...terms: string[]) =>
    stockTextures.find((texture) => {
      const category = texture.category.toLowerCase();
      const name = texture.name.toLowerCase();
      return terms.some((term) => category.includes(term) || name.includes(term));
    });

  const selectedOutsideTexture =
    config.outsideTextureId === "__base__"
      ? undefined
      : findStockTexture(config.outsideTextureId) ?? firstStockTexture("profil", "profile");
  const selectedInsideTexture =
    config.insideTextureId === "__base__"
      ? undefined
      : findStockTexture(config.insideTextureId) ?? selectedOutsideTexture;
  const selectedPanelTexture =
    config.panelTextureId === "__base__"
      ? undefined
      : findStockTexture(config.panelTextureId) ??
        firstStockTexture("panel", "ploca", "ploce", "furniture") ??
        selectedOutsideTexture;

  const sceneMaterialTextures = useMemo(
    () => ({
      outside: selectedOutsideTexture?.image,
      inside: selectedInsideTexture?.image,
      panel: selectedPanelTexture?.image
    }),
    [selectedInsideTexture?.image, selectedOutsideTexture?.image, selectedPanelTexture?.image]
  );

  const calculations = useMemo(() => {
    const panes = Math.max(1, config.verticalDivisions * config.horizontalDivisions);
    const isFenceConfig = config.family === "fence";
    const fenceSections = Math.max(1, config.verticalDivisions);
    const fenceRails = Math.max(1, config.horizontalDivisions);
    const frameLinearMm =
      isFenceConfig
        ? 0
        : 2 * (config.width + config.height) +
          Math.max(0, config.verticalDivisions - 1) * (config.height - config.frameWidth * 2) +
          Math.max(0, config.horizontalDivisions - 1) * (config.width - config.frameWidth * 2);
    const sashLinearMm =
      config.family !== "joinery" || config.openingMode === "fixed"
        ? 0
        : panes * 2 * (config.width / config.verticalDivisions + config.height / config.horizontalDivisions) * 0.82;
    const doorLinearMm =
      config.family === "furniture" && config.doorSystem !== "none"
        ? 2 *
          (config.doorWidth + config.doorHeight) *
          Math.max(1, config.verticalDivisions) *
          config.quantity
        : 0;
    const fenceLinearMm = isFenceConfig
      ? ((fenceSections + 1) * config.height +
          fenceRails * config.width +
          Math.max(0, fenceSections * 2) * config.height * 0.72) *
        config.quantity
      : 0;
    const totalProfileMm = (frameLinearMm + sashLinearMm) * config.quantity + doorLinearMm + fenceLinearMm;
    const bars = totalProfileMm > 0 ? Math.ceil(totalProfileMm / config.stockProfileLength) : 0;
    const profileWasteMm = bars > 0 ? bars * config.stockProfileLength - totalProfileMm : 0;
    const glassWidth = Math.max(100, config.width / config.verticalDivisions - config.frameWidth * 2.2);
    const glassHeight = Math.max(100, config.height / config.horizontalDivisions - config.frameWidth * 2.2);
    const glassArea =
      config.family === "joinery"
        ? (glassWidth * glassHeight * panes * config.quantity) / 1_000_000
        : 0;
    const glassFits =
      config.family !== "joinery" ||
      (glassWidth <= config.stockGlassWidth &&
        glassHeight <= config.stockGlassHeight);
    const moduleWidth = config.width / Math.max(1, config.verticalDivisions);
    const moduleHeight = config.height / Math.max(1, config.horizontalDivisions);
    const panelFits =
      config.family === "joinery"
        ? config.width <= config.stockPanelWidth && config.height <= config.stockPanelHeight
        : isFenceConfig
          ? true
        : Math.max(moduleWidth, config.family === "furniture" ? config.doorWidth : 0) <= config.stockPanelWidth &&
          Math.max(moduleHeight, config.family === "furniture" ? config.doorHeight : 0) <= config.stockPanelHeight;
    const gasket =
      config.family === "joinery"
        ? ((config.width + config.height) * 2 * panes * config.quantity) / 1000
        : 0;
    const screws = Math.ceil((totalProfileMm / 1000) * 6);
    const hinges =
      config.family === "furniture"
        ? config.doorSystem === "hinged"
          ? Math.max(2, config.verticalDivisions * 2) * config.quantity
          : 0
        : isFenceConfig
          ? 0
        : config.openingMode === "fixed" || config.openingMode === "sliding"
          ? 0
          : Math.max(2, config.horizontalDivisions * 2) * config.quantity;
    const furnitureDoorArea =
      config.family === "furniture" && config.doorSystem !== "none"
        ? (config.doorWidth * config.doorHeight * config.verticalDivisions * config.quantity) /
          1_000_000
        : 0;
    const boardArea =
      config.family === "furniture" || config.family === "universal"
        ? ((config.width * config.height * 2 + config.width * config.depth * 2 + config.height * config.depth * 2) *
            config.quantity) /
            1_000_000 +
          furnitureDoorArea
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

  const physicalIssues = useMemo(() => {
    const issues: string[] = [];
    const paneWidth = config.width / Math.max(1, config.verticalDivisions);
    const paneHeight = config.height / Math.max(1, config.horizontalDivisions);
    const clearWidth = paneWidth - config.frameWidth * 2.2;
    const clearHeight = paneHeight - config.frameWidth * 2.2;
    const largestFace = Math.max(config.width, config.height);

    if (
      (config.family === "joinery" && (clearWidth < 30 || clearHeight < 30)) ||
      config.frameWidth > maxFrameWidth(config)
    ) {
      issues.push(t.impossibleFrame);
    }
    if (config.depth > largestFace * 2.25) {
      issues.push(t.impossibleDepth);
    }
    if (
      ((config.family === "joinery" || config.family === "fence") &&
        (config.stockProfileLength <= 0 ||
          (config.family === "joinery" &&
            (config.stockGlassWidth <= 0 || config.stockGlassHeight <= 0)))) ||
      config.stockPanelWidth <= 0 ||
      config.stockPanelHeight <= 0
    ) {
      issues.push(t.impossibleStock);
    }

    return issues;
  }, [config, t]);

  const isGeometryValid = physicalIssues.length === 0;

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
    if (config.family === "furniture" || config.family === "universal") {
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
        </div>
      </div>
    );
  }

  function update<K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) {
    setConfig((previous) => normalizeConfig({ ...previous, [key]: value }));
  }

  function applyFamilyPreset(family: RenderFamily) {
    setDraftNumbers({});
    setConfig((previous) => {
      const presets: Record<RenderFamily, Partial<RenderConfig>> = {
        joinery: {
          width: 1400,
          height: 1600,
          depth: 82,
          frameWidth: 82,
          verticalDivisions: 2,
          horizontalDivisions: 1,
          openingMode: "tilt-turn",
          revealGap: 6,
          frontProjection: 28,
          handleLength: 360,
          handleOffset: 70
        },
        furniture: {
          width: 1195,
          height: 655,
          depth: 300,
          frameWidth: 15,
          verticalDivisions: 2,
          horizontalDivisions: 2,
          doorSystem: "hinged",
          doorWidth: 520,
          doorHeight: 600,
          revealGap: 4,
          frontProjection: 22,
          handleLength: 260,
          handleOffset: 55
        },
        universal: {
          width: 1200,
          height: 1800,
          depth: 420,
          frameWidth: 18,
          verticalDivisions: 2,
          horizontalDivisions: 4,
          revealGap: 3,
          frontProjection: 12,
          handleLength: 260,
          handleOffset: 55
        },
        fence: {
          width: 3200,
          height: 1200,
          depth: 80,
          frameWidth: 70,
          verticalDivisions: 4,
          horizontalDivisions: 3,
          revealGap: 12,
          frontProjection: 20,
          handleLength: 260,
          handleOffset: 55,
          profileStatus: "DOSTUPNO",
          outsideColor: "ANTRAZIT",
          insideColor: "RAL9006"
        }
      };

      return normalizeConfig({ ...previous, family, ...presets[family] });
    });
  }

  function numberUpdate(key: NumericConfigKey, value: string) {
    const bounds = dimensionBounds[key];
    const numericValue = Number(value);
    setDraftNumbers((previous) => ({ ...previous, [key]: value }));

    if (!value.trim() || !Number.isFinite(numericValue)) {
      return;
    }

    if (numericValue >= bounds.min) {
      setConfig((previous) =>
        normalizeConfig({
          ...previous,
          [key]: Math.min(numericValue, bounds.max)
        })
      );
    }
  }

  function commitNumber(key: NumericConfigKey) {
    setConfig((previous) => {
      const bounds = dimensionBounds[key];
      const raw = draftNumbers[key] ?? String(previous[key]);
      const numericValue = Number(raw);
      const next = Number.isFinite(numericValue)
        ? clampNumber(numericValue, bounds.min, bounds.max)
        : previous[key];

      return normalizeConfig({ ...previous, [key]: next });
    });
    setDraftNumbers((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function numericInputProps(key: NumericConfigKey, max = dimensionBounds[key].max) {
    return {
      inputMode: "numeric" as const,
      max,
      min: dimensionBounds[key].min,
      onBlur: () => commitNumber(key),
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        numberUpdate(key, event.target.value),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      },
      step: 1,
      type: "number",
      value: draftNumbers[key] ?? String(config[key])
    };
  }

  function updatePlacement<K extends keyof PlacementState>(key: K, value: PlacementState[K]) {
    const activeId = selectedElement?.id;
    if (!activeId) {
      return;
    }
    setSavedElements((previous) =>
      previous.map((element) =>
        element.id === activeId
          ? {
              ...element,
              placement: { ...element.placement, [key]: value }
            }
          : element
      )
    );
  }

  function resetPlacementValue<K extends keyof PlacementState>(key: K) {
    updatePlacement(key, createDefaultPlacement()[key]);
  }

  function renderPlacementSlider(
    key: keyof PlacementState,
    label: string,
    icon: ReactNode,
    min: number,
    max: number
  ) {
    const value = placement[key];
    const progress = clampNumber(((value - min) / Math.max(1, max - min)) * 100, 0, 100);

    return (
      <div className="placement-slider-row" key={key}>
        <div className="placement-slider-head">
          <span className="placement-slider-label">
            {icon}
            {label}
          </span>
          <button
            aria-label={`${label} reset`}
            className="placement-slider-reset"
            disabled={!selectedElement}
            onClick={() => resetPlacementValue(key)}
            type="button"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <input
          aria-label={label}
          max={max}
          min={min}
          onChange={(event) => updatePlacement(key, Number(event.target.value))}
          style={{ "--range-progress": `${progress}%` } as CSSProperties}
          type="range"
          value={value}
        />
      </div>
    );
  }

  function updateRenderZoom(delta: number) {
    setRenderZoom((previous) => Math.round(clampNumber(previous + delta, 55, 180)));
  }

  function saveRenderedElement() {
    if (!isGeometryValid) {
      return;
    }

    const id = `element-${Date.now()}`;
    const nextElement: SavedRenderElement = {
      id,
      image: createFrontFacingElementImage(config),
      label: `${config.width} x ${config.height} x ${config.depth} mm`,
      config: { ...config },
      textures: { ...sceneMaterialTextures },
      family: config.family,
      width: config.width,
      height: config.height,
      depth: config.depth,
      outsideColor: config.outsideColor,
      insideColor: config.insideColor,
      placement: createDefaultPlacement(savedElements.length)
    };

    setSavedElements((previous) => [nextElement, ...previous].slice(0, 12));
    setSelectedElementId(id);
  }

  function handleRoomPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRoomPhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function openRoomPhotoPicker() {
    roomPhotoInputRef.current?.click();
  }

  function setPlacementFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = placementRef.current?.getBoundingClientRect();
    if (!bounds || !selectedElement) {
      return;
    }

    const xPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
    const yPercent = ((event.clientY - bounds.top) / bounds.height) * 100;

    if (placementMode === "rotate") {
      updatePlacement("rotateY", Math.round(clampNumber((xPercent - 50) * 1.35, -68, 68)));
      updatePlacement("rotateX", Math.round(clampNumber((50 - yPercent) * 0.9, -48, 48)));
      return;
    }

    updatePlacement("x", clampNumber(xPercent, 0, 100));
    updatePlacement("y", clampNumber(yPercent, 0, 100));
  }

  function handlePlacementPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".room-photo-empty:not(.passive)") || !selectedElement) {
      return;
    }
    setIsDraggingPlacement(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlacementFromPointer(event);
  }

  function handlePlacementPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (isDraggingPlacement) {
      setPlacementFromPointer(event);
    }
  }

  function handlePlacementPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    setIsDraggingPlacement(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resetPlacement() {
    const activeId = selectedElement?.id;
    if (!activeId) {
      return;
    }
    setSavedElements((previous) =>
      previous.map((element) =>
        element.id === activeId
          ? { ...element, placement: createDefaultPlacement() }
          : element
      )
    );
  }

  function renderColorSwatches(key: "insideColor" | "outsideColor", label: string) {
    return (
      <div className="color-swatch-field">
        <span>{label}</span>
        <div className="color-swatch-grid">
          {legacyCatalog.colors.map((color) => (
            <button
              aria-label={color}
              className={classNames("color-swatch", config[key] === color && "active")}
              key={`${key}-${color}`}
              onClick={() => update(key, color)}
              style={{ backgroundColor: productColor(color) }}
              title={color}
              type="button"
            />
          ))}
        </div>
      </div>
    );
  }

  function renderTexturePicker(
    key: "insideTextureId" | "outsideTextureId" | "panelTextureId",
    label: string,
    selectedTexture: StockTexture | undefined,
    preferredTerms: string[]
  ) {
    const preferred = stockTextures.filter((texture) => {
      const category = texture.category.toLowerCase();
      const name = texture.name.toLowerCase();
      return preferredTerms.some((term) => category.includes(term) || name.includes(term));
    });
    const options = preferred.length ? preferred : stockTextures;

    return (
      <div className="stock-texture-picker">
        <span>{label}</span>
        <div className="stock-texture-grid">
          <button
            className={classNames((config[key] === "__base__" || !selectedTexture) && "active")}
            onClick={() => update(key, "__base__")}
            type="button"
          >
            <span className="stock-texture-thumb empty" />
            <small>{t.useBaseColor}</small>
          </button>
          {options.map((texture) => (
            <button
              className={classNames(selectedTexture?.id === texture.id && "active")}
              key={`${key}-${texture.id}`}
              onClick={() => update(key, texture.id)}
              title={texture.name}
              type="button"
            >
              <span
                className="stock-texture-thumb"
                style={{ backgroundImage: `url(${texture.image})` }}
              />
              <small>{texture.name}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const isJoinery = config.family === "joinery";
  const isKitchen = config.family === "furniture";
  const isFence = config.family === "fence";
  const materialTitle = isJoinery
    ? t.joineryMaterials
    : isKitchen
      ? t.kitchenMaterials
      : isFence
        ? t.fenceMaterials
        : t.furnitureMaterials;
  const profileYield = Math.round(
    clampNumber(
      (calculations.profileMeters / Math.max(1, (calculations.bars * config.stockProfileLength) / 1000)) * 100,
      1,
      100
    )
  );
  const readyPieces = Math.min(
    config.quantity,
    isJoinery || isFence
      ? Math.floor(stockSignals.profiles / Math.max(1, calculations.profileMeters / config.quantity))
      : Math.floor(stockSignals.panels / Math.max(1, calculations.boardArea / config.quantity))
  );
  const doorSystemLabel: Record<DoorSystem, string> = {
    none: t.noDoors,
    hinged: t.hingedDoors,
    sliding: t.slidingDoors
  };
  const handleTypeLabel: Record<HandleType, string> = {
    bar: t.barHandle,
    knob: t.knobHandle,
    edge: t.edgeHandle,
    recessed: t.recessedHandle,
    "sliding-pull": t.slidingPullHandle
  };
  const moduleCountLabel = isJoinery ? t.panes : isFence ? t.fenceSections : t.modules;
  const visibleModuleCount = isFence ? config.verticalDivisions : calculations.panes;
  const productionMetric = isJoinery || isFence
    ? `${calculations.profileMeters.toFixed(1)} m`
    : `${calculations.boardArea.toFixed(2)} m2`;
  const widthLabel = isFence ? t.fenceLength : t.width;
  const dimensionThicknessLabel = isJoinery ? t.frame : isFence ? t.fenceProfile : t.boardThickness;
  const divisionTitle = isJoinery ? t.divisions : isFence ? t.fenceLayout : t.modules;
  const verticalDivisionLabel = isJoinery ? t.vDivisions : isFence ? t.fenceSections : t.verticalModules;
  const horizontalDivisionLabel = isJoinery ? t.hDivisions : isFence ? t.fenceRails : t.shelfRows;
  const materialFitOk = isJoinery ? calculations.glassFits : isFence ? stockSignals.profiles >= calculations.profileMeters : calculations.panelFits;
  const materialReference = isJoinery ? config.series : isFence ? config.profileStatus : config.panelStatus;
  const stockTextureTerms = isJoinery || isFence
    ? ["profil", "profile"]
    : ["panel", "ploca", "ploce", "furniture", "wood", "drvo", "front"];

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
          <span><Layers size={15} /> {visibleModuleCount} {moduleCountLabel}</span>
          <span><Factory size={15} /> {productionMetric}</span>
          {isKitchen ? (
            <span>
              <DoorOpen size={15} />
              {doorSystemLabel[config.doorSystem]} - {config.doorWidth} x {config.doorHeight} mm - {handleTypeLabel[config.handleType]}
            </span>
          ) : null}
        </div>
      </div>

      <div className="render-workbench">
        <div className="render-stage" aria-label="3D production render" ref={renderStageRef}>
          <ProductionThreeScene
            calculations={calculations}
            config={config}
            materialTextures={sceneMaterialTextures}
            zoom={renderZoom}
          />
          <div className="render-stage-glow" />
          <div className="render-hud render-hud-main">
            <span>{t.liveEngine}</span>
            <strong>{config.width} x {config.height} x {config.depth} mm</strong>
          </div>
          <div className="render-hud render-hud-quality">
            <span>{t.studioQuality}</span>
            <strong>{materialReference}</strong>
          </div>
          <div className="render-material-strip">
            <span
              className={classNames(selectedOutsideTexture && "has-texture")}
              style={
                selectedOutsideTexture
                  ? { backgroundImage: `url(${selectedOutsideTexture.image})` }
                  : { backgroundColor: productColor(config.outsideColor) }
              }
            />
            <span
              className={classNames(selectedInsideTexture && "has-texture")}
              style={
                selectedInsideTexture
                  ? { backgroundImage: `url(${selectedInsideTexture.image})` }
                  : { backgroundColor: productColor(config.insideColor, productColor(config.outsideColor)) }
              }
            />
            <span className={materialFitOk ? "ok" : "risk"} />
            <strong>{t.materialStack}</strong>
          </div>
          <div className="render-cut-map" aria-label={t.cncPath}>
            <div>
              <span style={{ width: `${profileYield}%` }} />
            </div>
            <small>
              {isJoinery
                ? `${t.cncPath}: ${calculations.bars} ${t.bars} / ${calculations.profileWaste.toFixed(2)} m ${t.waste}`
                : isFence
                  ? `${t.cut}: ${calculations.bars} ${t.bars} / ${calculations.profileWaste.toFixed(2)} m ${t.waste}`
                : `${t.cut}: ${calculations.boardArea.toFixed(2)} m2 / ${config.verticalDivisions} x ${config.horizontalDivisions} ${t.modules}`}
            </small>
          </div>
          <div className="render-ready-chip">
            <Factory size={15} />
            <span>{t.readyPieces}: {readyPieces}/{config.quantity}</span>
          </div>
          <div className="render-zoom-controls" aria-label={t.zoom}>
            <button onClick={() => updateRenderZoom(-10)} title={t.zoomOut} type="button">
              <ZoomOut size={16} />
            </button>
            <button className="render-zoom-value" onClick={() => setRenderZoom(100)} title={t.resetZoom} type="button">
              {renderZoom}%
            </button>
            <button onClick={() => updateRenderZoom(10)} title={t.zoomIn} type="button">
              <ZoomIn size={16} />
            </button>
          </div>
        </div>

        <div className="render-controls">
          <div className="control-section">
            <div className="control-title">
              <Box size={17} />
              <strong>{t.family}</strong>
            </div>
            <div className="segmented-control">
              {(["joinery", "furniture", "universal", "fence"] as RenderFamily[]).map((family) => (
                <button
                  className={config.family === family ? "active" : ""}
                  key={family}
                  onClick={() => applyFamilyPreset(family)}
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
                <span>{widthLabel} mm</span>
                <input {...numericInputProps("width")} />
              </label>
              <label>
                <span>{t.height} mm</span>
                <input {...numericInputProps("height")} />
              </label>
              <label>
                <span>{t.depth} mm</span>
                <input {...numericInputProps("depth")} />
              </label>
              <label>
                <span>{dimensionThicknessLabel} mm</span>
                <input {...numericInputProps("frameWidth", maxFrameWidth(config))} />
              </label>
            </div>
            <div className={classNames("geometry-check", isGeometryValid ? "ok" : "risk")}>
              <Check size={15} />
              <div>
                <strong>{isGeometryValid ? t.validGeometry : t.physicalIssue}</strong>
                <span>{isGeometryValid ? t.physicalCheck : physicalIssues[0]}</span>
              </div>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <SlidersHorizontal size={17} />
              <strong>{divisionTitle}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{verticalDivisionLabel}</span>
                <input {...numericInputProps("verticalDivisions")} />
              </label>
              <label>
                <span>{horizontalDivisionLabel}</span>
                <input {...numericInputProps("horizontalDivisions")} />
              </label>
              {isJoinery ? (
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
              ) : null}
              <label>
                <span>{t.qty}</span>
                <input {...numericInputProps("quantity")} />
              </label>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <SlidersHorizontal size={17} />
              <strong>{t.precisionDetails}</strong>
            </div>
            <div className="control-grid">
              <label>
                <span>{t.revealGap} mm</span>
                <input {...numericInputProps("revealGap")} />
              </label>
              <label>
                <span>{t.frontProjection} mm</span>
                <input {...numericInputProps("frontProjection")} />
              </label>
              {!isFence ? (
                <>
                  <label>
                    <span>{t.handleLength} mm</span>
                    <input
                      {...numericInputProps("handleLength")}
                      disabled={isKitchen ? config.doorSystem === "none" : isJoinery && config.openingMode === "fixed"}
                    />
                  </label>
                  <label>
                    <span>{t.handleOffset} mm</span>
                    <input
                      {...numericInputProps("handleOffset")}
                      disabled={isKitchen ? config.doorSystem === "none" : isJoinery && config.openingMode === "fixed"}
                    />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          {isKitchen ? (
            <div className="control-section">
              <div className="control-title">
                <DoorOpen size={17} />
                <strong>{t.doorHardware}</strong>
              </div>
              <div className="control-grid">
                <label>
                  <span>{t.doorSystem}</span>
                  <select value={config.doorSystem} onChange={(event) => update("doorSystem", event.target.value as DoorSystem)}>
                    <option value="none">{t.noDoors}</option>
                    <option value="hinged">{t.hingedDoors}</option>
                    <option value="sliding">{t.slidingDoors}</option>
                  </select>
                </label>
                <label>
                  <span>{t.handleType}</span>
                  <select value={config.handleType} onChange={(event) => update("handleType", event.target.value as HandleType)} disabled={config.doorSystem === "none"}>
                    <option value="bar">{t.barHandle}</option>
                    <option value="knob">{t.knobHandle}</option>
                    <option value="edge">{t.edgeHandle}</option>
                    <option value="recessed">{t.recessedHandle}</option>
                    <option value="sliding-pull">{t.slidingPullHandle}</option>
                  </select>
                </label>
                <label>
                  <span>{t.doorWidth} mm</span>
                  <input {...numericInputProps("doorWidth", maxDoorWidth(config))} disabled={config.doorSystem === "none"} />
                </label>
                <label>
                  <span>{t.doorHeight} mm</span>
                  <input {...numericInputProps("doorHeight", maxDoorHeight(config))} disabled={config.doorSystem === "none"} />
                </label>
              </div>
            </div>
          ) : null}

          <div className="control-section">
            <div className="control-title">
              <Layers size={17} />
              <strong>{materialTitle}</strong>
            </div>
            <div className="control-grid">
              {isJoinery ? (
                <>
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
                </>
              ) : null}
              {isFence ? (
                <label>
                  <span>{t.profile}</span>
                  <select value={config.profileStatus} onChange={(event) => update("profileStatus", event.target.value)}>
                    {legacyCatalog.materialStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!isFence ? (
                <label>
                  <span>{t.panel}</span>
                  <select value={config.panelStatus} onChange={(event) => update("panelStatus", event.target.value)}>
                    {legacyCatalog.panelStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
              ) : null}
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
              {renderColorSwatches("outsideColor", t.outsidePalette)}
              {renderColorSwatches("insideColor", t.insidePalette)}
              <div className="stock-texture-section">
                <div className="stock-texture-heading">
                  <strong>{t.stockTextures}</strong>
                  <span>{stockTextures.length ? `${stockTextures.length}` : t.noStockTextures}</span>
                </div>
                {stockTextures.length ? (
                  <>
                    {renderTexturePicker(
                      "outsideTextureId",
                      t.outsideTexture,
                      selectedOutsideTexture,
                      stockTextureTerms
                    )}
                    {renderTexturePicker(
                      "insideTextureId",
                      t.insideTexture,
                      selectedInsideTexture,
                      stockTextureTerms
                    )}
                    {!isFence ? renderTexturePicker(
                      "panelTextureId",
                      t.panelTexture,
                      selectedPanelTexture,
                      ["panel", "ploca", "ploce", "furniture", "wood", "drvo", "front"]
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="control-section">
            <div className="control-title">
              <Factory size={17} />
              <strong>{t.stock}</strong>
            </div>
            <div className="control-grid">
              {isJoinery || isFence ? (
                <>
                  <label>
                    <span>{t.profileFormat} mm</span>
                    <input {...numericInputProps("stockProfileLength")} />
                  </label>
                  {isJoinery ? (
                    <>
                      <label>
                        <span>{t.glassFormat} W</span>
                        <input {...numericInputProps("stockGlassWidth")} />
                      </label>
                      <label>
                        <span>{t.glassFormat} H</span>
                        <input {...numericInputProps("stockGlassHeight")} />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
              {!isFence ? (
                <>
                  <label>
                    <span>{isJoinery ? t.panel : t.boardFormat} W</span>
                    <input {...numericInputProps("stockPanelWidth")} />
                  </label>
                  <label>
                    <span>{isJoinery ? t.panel : t.boardFormat} H</span>
                    <input {...numericInputProps("stockPanelHeight")} />
                  </label>
                </>
              ) : null}
            </div>
          </div>

          <div className="control-section placement-controls">
            <div className="control-title">
              <Camera size={17} />
              <strong>{t.placementStudio}</strong>
            </div>
            <div className="placement-actions">
              <button className="soft-action" disabled={!isGeometryValid} onClick={saveRenderedElement} type="button">
                <Save size={16} />
                {t.saveElement}
              </button>
              <label className="soft-action file-action">
                <ImagePlus size={16} />
                {t.uploadSpacePhoto}
                <input accept="image/*" capture="environment" onChange={handleRoomPhoto} type="file" />
              </label>
            </div>
            {savedElements.length ? (
              <div className="saved-elements-list">
                {savedElements.map((element) => (
                  <button
                    className={classNames(
                      "saved-element-chip",
                      selectedElement?.id === element.id && "active"
                    )}
                    key={element.id}
                    onClick={() => setSelectedElementId(element.id)}
                    type="button"
                  >
                    <img alt={element.label} src={element.image} />
                    <div>
                      <strong>{t.elementSaved}</strong>
                      <span>{element.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="control-hint">{t.saveFirst}</p>
            )}
          </div>
        </div>
      </div>

      <div className="placement-studio-panel">
        <div className="panel-heading">
          <div>
            <p>{t.placementStudio}</p>
            <h3>{t.manualPlacement}</h3>
          </div>
          <button className="soft-action compact-action" onClick={resetPlacement} type="button">
            <RefreshCw size={15} />
            {t.resetPlacement}
          </button>
        </div>
        <div className="placement-workspace">
          <div
            className={classNames(
              "room-placement-canvas",
              isDraggingPlacement && "dragging",
              placementMode === "rotate" && "rotating"
            )}
            onPointerCancel={handlePlacementPointerUp}
            onPointerDown={handlePlacementPointerDown}
            onPointerMove={handlePlacementPointerMove}
            onPointerUp={handlePlacementPointerUp}
            ref={placementRef}
          >
            <input
              accept="image/*"
              capture="environment"
              className="room-photo-input"
              onChange={handleRoomPhoto}
              ref={roomPhotoInputRef}
              type="file"
            />
            {roomPhoto ? (
              <img alt={t.placementStudio} className="room-photo" src={roomPhoto} />
            ) : savedElements.length ? (
              null
            ) : (
              <button className="room-photo-empty" onClick={openRoomPhotoPicker} type="button">
                <Camera size={28} />
                <strong>{t.uploadSpacePhoto}</strong>
                <span>{t.roomPhotoHint}</span>
              </button>
            )}
            {savedElements.map((element) => (
              <PlacementThreeElement
                element={element}
                key={element.id}
                selected={selectedElement?.id === element.id}
              />
            ))}
          </div>
          <div className="placement-sliders">
            <div className="placement-mode-toggle">
              <button
                className={placementMode === "move" ? "active" : ""}
                onClick={() => setPlacementMode("move")}
                type="button"
              >
                <Move size={14} />
                {t.moveMode}
              </button>
              <button
                className={placementMode === "rotate" ? "active" : ""}
                onClick={() => setPlacementMode("rotate")}
                type="button"
              >
                <RotateCw size={14} />
                {t.rotateMode}
              </button>
            </div>
            {renderPlacementSlider("x", t.xPosition, <Move size={14} />, 0, 100)}
            {renderPlacementSlider("y", t.yPosition, <Move size={14} />, 0, 100)}
            {renderPlacementSlider("scale", t.scale, <Ruler size={14} />, 12, 180)}
            {renderPlacementSlider("rotateY", t.yaw, <RotateCw size={14} />, -68, 68)}
            {renderPlacementSlider("rotateX", t.pitch, <RotateCw size={14} />, -48, 48)}
            {renderPlacementSlider("rotation", t.roll, <RotateCw size={14} />, -180, 180)}
          </div>
        </div>
      </div>

      <div className="render-output">
        <article>
          <strong>{t.bom}</strong>
          <ul>
            {isJoinery ? (
              <>
                <li>{t.profile}: {calculations.profileMeters.toFixed(2)} m / {calculations.bars} {t.bars}</li>
                <li>{t.glass}: {calculations.glassArea.toFixed(2)} m2 ({calculations.panes} {t.pcs})</li>
                <li>{t.gasket}: {calculations.gasket.toFixed(1)} m</li>
                <li>{t.hardware}: {calculations.hinges} {t.hinges}, {calculations.screws} {t.screws}</li>
              </>
            ) : isFence ? (
              <>
                <li>{t.profile}: {calculations.profileMeters.toFixed(2)} m / {calculations.bars} {t.bars}</li>
                <li>{t.fenceSections}: {config.verticalDivisions}</li>
                <li>{t.fenceRails}: {config.horizontalDivisions}</li>
                <li>{t.hardware}: {calculations.screws} {t.screws}</li>
              </>
            ) : (
              <>
                <li>{t.boards}: {calculations.boardArea.toFixed(2)} m2</li>
                <li>{t.modules}: {config.verticalDivisions} x {config.horizontalDivisions}</li>
                {isKitchen && config.doorSystem !== "none" ? (
                  <li>{t.doorHardware}: {doorSystemLabel[config.doorSystem]}, {config.doorWidth} x {config.doorHeight} mm, {handleTypeLabel[config.handleType]}</li>
                ) : null}
                <li>{t.hardware}: {calculations.hinges} {t.hinges}, {calculations.screws} {t.screws}</li>
              </>
            )}
          </ul>
        </article>
        <article>
          <strong>{t.cut}</strong>
          <ul>
            {isJoinery ? (
              <>
                <li>{t.waste}: {calculations.profileWaste.toFixed(2)} m {t.profile}</li>
                <li>{t.fit}: {calculations.glassWidth.toFixed(0)} x {calculations.glassHeight.toFixed(0)} mm {t.glass}</li>
                <li>{t.panel}: {calculations.panelFits ? t.ok : t.risk}</li>
              </>
            ) : isFence ? (
              <>
                <li>{t.waste}: {calculations.profileWaste.toFixed(2)} m {t.profile}</li>
                <li>{t.fit}: {(config.width / Math.max(1, config.verticalDivisions)).toFixed(0)} mm {t.fenceSections}</li>
                <li>{t.profile}: {stockSignals.profiles >= calculations.profileMeters ? t.ok : t.risk}</li>
              </>
            ) : (
              <>
                <li>{t.boards}: {calculations.boardArea.toFixed(2)} m2</li>
                <li>{t.fit}: {(config.width / Math.max(1, config.verticalDivisions)).toFixed(0)} x {(config.height / Math.max(1, config.horizontalDivisions)).toFixed(0)} mm</li>
                <li>{t.panel}: {calculations.panelFits ? t.ok : t.risk}</li>
              </>
            )}
          </ul>
        </article>
        <article>
          <strong>{t.warehouseFit}</strong>
          <div className="fit-grid">
            {isJoinery || isFence ? (
              <>
                <span className={stockSignals.profiles >= calculations.profileMeters ? "ok" : "risk"}><Check size={14} /> {t.profile}: {stockSignals.profiles.toFixed(0)} m</span>
                {isJoinery ? <span className={calculations.glassFits ? "ok" : "risk"}><Check size={14} /> {t.glass}: {calculations.glassFits ? t.ok : t.risk}</span> : null}
              </>
            ) : null}
            {!isFence ? <span className={stockSignals.panels > 0 ? "ok" : "risk"}><Check size={14} /> {t.panel}: {stockSignals.panels.toFixed(0)} pcs</span> : null}
          </div>
        </article>
        <article className="render-action-card">
          <strong>{t.productionPush}</strong>
          <button
            className="primary-action"
            disabled={!isGeometryValid}
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
                note: `${t.studio}: ${t[config.family]}, ${config.width}x${config.height}x${config.depth}mm${
                  isKitchen
                    ? `, ${doorSystemLabel[config.doorSystem]}, ${config.doorWidth}x${config.doorHeight}mm, ${handleTypeLabel[config.handleType]}`
                    : ""
                }, ${
                  isJoinery
                    ? `${calculations.profileMeters.toFixed(2)}m ${t.profile}, ${calculations.glassArea.toFixed(2)}m2 ${t.glass}.`
                    : isFence
                      ? `${calculations.profileMeters.toFixed(2)}m ${t.profile}, ${config.verticalDivisions} ${t.fenceSections}, ${config.horizontalDivisions} ${t.fenceRails}.`
                    : `${calculations.boardArea.toFixed(2)}m2 ${t.boards}, ${config.verticalDivisions}x${config.horizontalDivisions} ${t.modules}.`
                }`
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
