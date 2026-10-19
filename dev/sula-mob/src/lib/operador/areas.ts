
// src/lib/operador/areas.ts
// Áreas del operador: se dejan las 8 que ya existían (101-108) y se agregan
// las que aparecen en MATRIZ_DE_CORTE_VITRINA_REFACCIONES.pdf y que no
// estaban en la lista (109-113).
// Proyecto 2-1-0072-0003 — Vitrina para Refacciones — Total a producir: 5 unidades
// "meta" = CANT. TOTAL de la matriz (ya multiplicado por las 5 unidades a producir)

export interface Pieza {
  id: string;
  descripcion: string;
  modulo: string;
  material: string;
  largo: number | null;
  ancho: number | null;
  notas: string;
  meta: number;
  hechas: number;
}

export interface Area {
  codigo: string;
  nombre: string;
  piezas: Pieza[];
}

export interface ProyectoActivo {
  codigo: string;
  cliente: string;
  nombre: string;
  modelo: string;
  totalProducir: number;
}

// TODO Supabase: reemplazar por SELECT a tabla `proyectos` (proyecto activo
// asignado al operador).
export const PROYECTO_ACTIVO: ProyectoActivo = {
  codigo: "PED-3464",
  cliente: "GRUPO AVANT CIM",
  nombre: "Vitrina para Refacciones",
  modelo: "2-1-0072-0003",
  totalProducir: 5,
};

// TODO Supabase: reemplazar por SELECT a tabla `piezas` (o `matriz_corte`)
// filtrado por proyecto_id + area. La contraseña debe pasar a venir de una
// tabla `operadores` (operador_id -> area_id) en vez de estar fija aquí.
export const AREAS: Record<string, Area> = {
  // ---------- Las 8 áreas que ya existían en el operador ----------
  "101": {
    codigo: "101",
    nombre: "Corte de Tubo",
    piezas: [
      { id: "ct1", descripcion: "POSTE A", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 823.77, ancho: 25.4, notas: "Corte 40.45°/49.55°, incluye poste B", meta: 5, hechas: 0 },
      { id: "ct2", descripcion: "POSTE B", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: null, ancho: null, notas: "Incluido en poste A", meta: 5, hechas: 0 },
      { id: "ct3", descripcion: "POSTE C", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 813.4, ancho: 25.4, notas: "Corte 45° ambos lados", meta: 10, hechas: 0 },
      { id: "ct4", descripcion: "TRAVESAÑO A", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 730, ancho: 25.4, notas: "Corte 45°/40.5°, 2x bno Ø12.70", meta: 10, hechas: 0 },
      { id: "ct5", descripcion: "TRAVESAÑO B", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 600, ancho: 25.4, notas: "Corte 49.55°/45°, 2x bno Ø12.70", meta: 10, hechas: 0 },
      { id: "ct6", descripcion: "TRAVESAÑO CENTRAL A", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 595, ancho: 25.4, notas: "Corte 81°, 2x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "ct7", descripcion: "TRAVESAÑO CENTRAL B", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 637.71, ancho: 25.4, notas: "Corte 81°, 2x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "ct8", descripcion: "PATA", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 81, ancho: 25.4, notas: "Corte 45°", meta: 20, hechas: 0 },
      { id: "ct9", descripcion: "LARGUERO A", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 996.5, ancho: 25.4, notas: "2x bno Ø6.35 1 cara", meta: 20, hechas: 0 },
      { id: "ct10", descripcion: "SOPORTE ENTREPAÑO", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 3/4" cal.18', largo: 996.5, ancho: 19.05, notas: "2x bno Ø6.35 1 cara", meta: 20, hechas: 0 },
      { id: "ct11", descripcion: "COMPLEMENTO ZOCLO", modulo: "Módulo A — Jaula A", material: 'Perfil cuadrado CRS 1" cal.18', largo: 1047.3, ancho: 25.4, notas: "Corte 45°, 2x bno Ø13.49 2 caras", meta: 10, hechas: 0 },
      { id: "ct12", descripcion: "POSTE A", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 823.77, ancho: 25.4, notas: "Corte 40.45°/49.55°, incluye poste B", meta: 5, hechas: 0 },
      { id: "ct13", descripcion: "POSTE B", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: null, ancho: null, notas: "Incluido en poste A", meta: 5, hechas: 0 },
      { id: "ct14", descripcion: "POSTE C", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 813.4, ancho: 25.4, notas: "Corte 45° ambos lados", meta: 10, hechas: 0 },
      { id: "ct15", descripcion: "TRAVESAÑO A", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 730, ancho: 25.4, notas: "Corte 45°/40.5°, 2x bno Ø12.70", meta: 10, hechas: 0 },
      { id: "ct16", descripcion: "TRAVESAÑO B", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 600, ancho: 25.4, notas: "Corte 49.55°/45°, 2x bno Ø12.70", meta: 10, hechas: 0 },
      { id: "ct17", descripcion: "TRAVESAÑO CENTRAL A", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 595, ancho: 25.4, notas: "Corte 81°, 2x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "ct18", descripcion: "TRAVESAÑO CENTRAL B", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 637.71, ancho: 25.4, notas: "Corte 81°, 2x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "ct19", descripcion: "PATA", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 81, ancho: 25.4, notas: "Corte 45°", meta: 20, hechas: 0 },
      { id: "ct20", descripcion: "LARGUERO A", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 996.5, ancho: 25.4, notas: "2x bno Ø6.35 1 cara", meta: 20, hechas: 0 },
      { id: "ct21", descripcion: "SOPORTE ENTREPAÑO", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 3/4" cal.18', largo: 996.5, ancho: 19.05, notas: "2x bno Ø6.35 1 cara", meta: 20, hechas: 0 },
      { id: "ct22", descripcion: "COMPLEMENTO ZOCLO", modulo: "Módulo B — Jaula B", material: 'Perfil cuadrado CRS 1" cal.18', largo: 1047.3, ancho: 25.4, notas: "Corte 45°, 2x bno Ø13.49 2 caras", meta: 10, hechas: 0 },
    ],
  },
  "102": {
    codigo: "102",
    nombre: "Doblez",
    piezas: [
      { id: "db1", descripcion: "FORRO C", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 20", largo: 787.84, ancho: 578, notas: "Desarrollo de lámina, dobleces 90° con muesca", meta: 5, hechas: 0 },
      { id: "db2", descripcion: "PERFIL A", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 20", largo: 994.5, ancho: 53.8, notas: "Desarrollo de lámina, 4x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "db3", descripcion: "PERFIL B", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 20", largo: 994.5, ancho: 47.36, notas: "Desarrollo de lámina, 4x bno Ø4.76", meta: 5, hechas: 0 },
      { id: "db4", descripcion: "PERFIL C", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 20", largo: 823.5, ancho: 27.48, notas: "Desarrollo de lámina, 4x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "db5", descripcion: "PERFIL D", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 20", largo: 823.5, ancho: 20.09, notas: "Espejo de perfil C", meta: 5, hechas: 0 },
      { id: "db6", descripcion: "ZOCLO A", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 18", largo: 1066.06, ancho: 118.47, notas: "Desarrollo de lámina", meta: 5, hechas: 0 },
      { id: "db7", descripcion: "ZOCLO B", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 18", largo: null, ancho: null, notas: "Espejo de zoclo A", meta: 5, hechas: 0 },
      { id: "db8", descripcion: "CHAROLA", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 18", largo: 672.69, ancho: 390, notas: "Dobleces a 90°, 6x bno Ø5", meta: 5, hechas: 0 },
      { id: "db9", descripcion: "FORRO D", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 20", largo: 787.84, ancho: 578, notas: "Espejo de forro C, omitir bnos completos", meta: 5, hechas: 0 },
      { id: "db10", descripcion: "PERFIL A", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 20", largo: 994.5, ancho: 53.8, notas: "Desarrollo de lámina, 4x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "db11", descripcion: "PERFIL B", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 20", largo: 994.5, ancho: 47.36, notas: "Desarrollo de lámina, 4x bno Ø4.76", meta: 5, hechas: 0 },
      { id: "db12", descripcion: "PERFIL C", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 20", largo: 823.5, ancho: 27.48, notas: "Desarrollo de lámina, 4x bno Ø6.35", meta: 5, hechas: 0 },
      { id: "db13", descripcion: "PERFIL D", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 20", largo: 823.5, ancho: 20.09, notas: "Espejo de perfil C", meta: 5, hechas: 0 },
      { id: "db14", descripcion: "ZOCLO B", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 18", largo: 1066.06, ancho: 118.47, notas: "Desarrollo de lámina", meta: 5, hechas: 0 },
      { id: "db15", descripcion: "ZOCLO A", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 18", largo: null, ancho: null, notas: "Espejo de zoclo A", meta: 5, hechas: 0 },
      { id: "db16", descripcion: "CHAROLA", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 18", largo: 672.69, ancho: 390, notas: "Dobleces a 90°, 6x bno Ø5", meta: 5, hechas: 0 },
      { id: "db17", descripcion: "BAGUETA A", modulo: "Baguetas", material: "Lámina CRS cal. 18", largo: 993, ancho: 32.1, notas: "5x bno Ø3.18, doblez a 81°", meta: 10, hechas: 0 },
      { id: "db18", descripcion: "BAGUETA B", modulo: "Baguetas", material: "Lámina CRS cal. 18", largo: 765, ancho: 32.56, notas: "4x bno Ø3.18, doblez a 90°", meta: 5, hechas: 0 },
      { id: "db19", descripcion: "BAGUETA C", modulo: "Baguetas", material: "Lámina CRS cal. 18", largo: 765, ancho: 31.12, notas: "6x bno Ø3.18, doblez", meta: 5, hechas: 0 },
      { id: "db20", descripcion: "BAGUETA D", modulo: "Baguetas", material: "Lámina CRS cal. 18", largo: 765, ancho: null, notas: "Espejo de bagueta B", meta: 5, hechas: 0 },
      { id: "db21", descripcion: "BAGUETA E", modulo: "Baguetas", material: "Lámina CRS cal. 18", largo: 765, ancho: null, notas: "Espejo de bagueta C", meta: 5, hechas: 0 },
      { id: "db22", descripcion: "SOPORTE DE CONTACTOS", modulo: "Soporte de contactos", material: "Lámina CRS cal. 18", largo: 537.09, ancho: 174, notas: "Desarrollo de lámina, 4x bno Ø3", meta: 5, hechas: 0 },
    ],
  },
  "103": {
    codigo: "103",
    nombre: "Corte de Lámina",
    // Sin datos en esta Matriz de Corte (el PDF no trae piezas bajo esta área).
    piezas: [],
  },
  "104": {
    codigo: "104",
    nombre: "Soldadura",
    piezas: [],
  },
  "105": {
    codigo: "105",
    nombre: "Alambrón",
    piezas: [],
  },
  "106": {
    codigo: "106",
    nombre: "Pulido",
    piezas: [],
  },
  "107": {
    codigo: "107",
    nombre: "Pintura",
    piezas: [],
  },
  "108": {
    codigo: "108",
    nombre: "Empaque",
    piezas: [
      { id: "em1", descripcion: "CUBIERTA (HULE)", modulo: "Cubierta", material: "Hule pasillo rayado negro", largo: 2084.5, ancho: 590.5, notas: "Cortar a medida", meta: 5, hechas: 0 },
    ],
  },

  // ---------- Áreas nuevas: estaban en el PDF pero no en la lista original ----------
  "109": {
    codigo: "109",
    nombre: "Corte de Laser",
    piezas: [
      { id: "cl1", descripcion: "OREJA", modulo: "Módulo A — Jaula A", material: "Lámina CRS cal. 12", largo: 25, ancho: 25, notas: "Avellane p/pija c. plana #8, bno Ø8.43", meta: 45, hechas: 0 },
      { id: "cl2", descripcion: "OREJA", modulo: "Módulo B — Jaula B", material: "Lámina CRS cal. 12", largo: 25, ancho: 25, notas: "Avellane p/pija c. plana #8, bno Ø8.43", meta: 45, hechas: 0 },
    ],
  },
  "110": {
    codigo: "110",
    nombre: "Vidrio",
    piezas: [
      { id: "vd1", descripcion: "ENTREPAÑO A", modulo: "Entrepaño A", material: "Vidrio claro 6.00 mm", largo: 990, ancho: 550, notas: "Cantos pulidos y abrillantados, esq. 1x45°", meta: 10, hechas: 0 },
      { id: "vd2", descripcion: "ENTREPAÑO B", modulo: "Entrepaño B", material: "Vidrio claro 6.00 mm", largo: 990, ancho: 510, notas: "Cantos pulidos y abrillantados, esq. 1x45°", meta: 10, hechas: 0 },
      { id: "vd3", descripcion: "FRENTE", modulo: "Frente (vidrio corredizo)", material: "Vidrio claro 6.00 mm", largo: 992.5, ancho: 768, notas: "Cantos pulidos y abrillantados", meta: 10, hechas: 0 },
    ],
  },
  "111": {
    codigo: "111",
    nombre: "Melamina",
    piezas: [
      { id: "ml1", descripcion: "CAMA", modulo: "Cubierta", material: "Melamina negra 1C de 25.00 mm", largo: 2084.5, ancho: 590.5, notas: "Bno. p/grommet en sitio", meta: 5, hechas: 0 },
      { id: "ml2", descripcion: "PISO", modulo: "Módulo A — Jaula A", material: "Melamina negra de 18.00 mm 2C", largo: 995, ancho: 674, notas: "—", meta: 5, hechas: 0 },
      { id: "ml3", descripcion: "PISO", modulo: "Módulo B — Jaula B", material: "Melamina negra de 18.00 mm 2C", largo: 995, ancho: 674, notas: "—", meta: 5, hechas: 0 },
      { id: "ml4", descripcion: "PUERTA A", modulo: "Puerta corrediza", material: "Melamina negra de 18.00 mm 2C", largo: 781, ancho: 513, notas: "Cubrecanto PVC negro 1x22mm, 4x bno Ø35", meta: 20, hechas: 0 },
    ],
  },
  "112": {
    codigo: "112",
    nombre: "Aluminio",
    piezas: [
      { id: "al1", descripcion: "PERFIL ALUMINIO A", modulo: "Cubierta", material: 'Perfil de aluminio 3/16"x1"', largo: 2094, ancho: null, notas: "Corte 45°, 7x bno Ø3.80", meta: 10, hechas: 0 },
      { id: "al2", descripcion: "PERFIL ALUMINIO B", modulo: "Cubierta", material: 'Perfil de aluminio 3/16"x1"', largo: 600, ancho: null, notas: "Corte 45°, 3x bno Ø3.80", meta: 10, hechas: 0 },
    ],
  },
  "113": {
    codigo: "113",
    nombre: "Herraje",
    piezas: [
      { id: "hr1", descripcion: 'PIJA C. PLANA PH. #6X5/8" GALV', modulo: "Cubierta", material: 'Pija C. plana PH. #6x5/8" GALV', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr2", descripcion: 'GROMMET PASACABLE 2"', modulo: "Cubierta", material: 'Grommet pasacable de 2" color negro', largo: null, ancho: null, notas: "—", meta: 5, hechas: 0 },
      { id: "hr3", descripcion: 'TUERCA REMACHABLE Ø3/8"', modulo: "Módulo A — Jaula A", material: 'Tuerca remachable Ø3/8"x18mm', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr4", descripcion: 'NIVELADOR METALICO 3/8"', modulo: "Módulo A — Jaula A", material: 'Nivelador metálico 3/8"', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr5", descripcion: 'PIJA C. FIJADORA #8X5/8" PAV.', modulo: "Módulo A — Jaula A", material: 'Pija C. fijadora #8x5/8" PAV.', largo: null, ancho: null, notas: "—", meta: 80, hechas: 0 },
      { id: "hr6", descripcion: 'TUERCA REMACHABLE Ø3/8"', modulo: "Módulo B — Jaula B", material: 'Tuerca remachable Ø3/8"x18mm', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr7", descripcion: 'NIVELADOR METALICO 3/8"', modulo: "Módulo B — Jaula B", material: 'Nivelador metálico 3/8"', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr8", descripcion: 'PIJA C. FIJADORA #8X5/8" PAV.', modulo: "Módulo B — Jaula B", material: 'Pija C. fijadora #8x5/8" PAV.', largo: null, ancho: null, notas: "—", meta: 80, hechas: 0 },
      { id: "hr9", descripcion: 'TUERCA REMACHABLE Ø3/8"X18MM', modulo: "Herraje de armado", material: 'Tuerca remachable Ø3/8"x18mm', largo: null, ancho: null, notas: "Ensamble general", meta: 40, hechas: 0 },
      { id: "hr10", descripcion: 'PIJA C. FIJADORA #8X5/8" PAV.', modulo: "Herraje de armado", material: 'Pija C. fijadora #8x5/8" PAV.', largo: null, ancho: null, notas: "Ensamble general", meta: 210, hechas: 0 },
      { id: "hr11", descripcion: 'PIJA C. PLANA PH. #6X5/8" GALV', modulo: "Herraje de armado", material: 'Pija C. plana PH. #6x5/8" GALV', largo: null, ancho: null, notas: "Ensamble general", meta: 100, hechas: 0 },
      { id: "hr12", descripcion: 'PIJA PUNTA DE BROCA #8X3/4" PAV.', modulo: "Herraje de armado", material: 'Pija punta de broca #8x3/4" PAV.', largo: null, ancho: null, notas: "—", meta: 120, hechas: 0 },
      { id: "hr13", descripcion: 'NIVELADOR AMI-49 TORNILLO CDA. Ø3/8"', modulo: "Herraje de armado", material: 'Nivelador AMI-49 tornillo CDA. Ø3/8"', largo: null, ancho: null, notas: "—", meta: 40, hechas: 0 },
      { id: "hr14", descripcion: 'PASA CABLES Ø2" NEGRO', modulo: "Herraje de armado", material: 'Pasa cables Ø2" color negro', largo: null, ancho: null, notas: "—", meta: 5, hechas: 0 },
      { id: "hr15", descripcion: "TORNILLO CAB. BOTON ALLEN CDA.", modulo: "Herraje de armado", material: 'Tornillo cab. botón Allen CDAØ1/4"x1-...', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr16", descripcion: 'TUERCA BELLOTA Ø1/4" PAV.', modulo: "Herraje de armado", material: 'Tuerca bellota Ø1/4" PAV.', largo: null, ancho: null, notas: "—", meta: 20, hechas: 0 },
      { id: "hr17", descripcion: "SIST. PUERTA CORREDIZA AL-1535", modulo: "Herraje de armado", material: "Sistema de puerta corrediza AL-1535", largo: null, ancho: null, notas: "—", meta: 10, hechas: 0 },
      { id: "hr18", descripcion: "RIEL ALUMINIO P/SIST. DUCASSE", modulo: "Herraje de armado", material: "Riel de aluminio para sistema Ducasse", largo: null, ancho: null, notas: "Cortar a medida", meta: 5, hechas: 0 },
      { id: "hr19", descripcion: "FIELTRO PARA VIDRIO", modulo: "Herraje de armado", material: "Fieltro para vidrio", largo: null, ancho: null, notas: "Cortar a medida", meta: 5, hechas: 0 },
      { id: "hr20", descripcion: "CERRADURA P/PUERTA CORREDIZA", modulo: "Herraje de armado", material: "De botón cromada organización MZ EL...", largo: null, ancho: null, notas: "—", meta: 10, hechas: 0 },
      { id: "hr21", descripcion: "KIT DE ILUMINACION P/VITRINA", modulo: "Herraje de armado", material: "Kit de iluminación para vitrina", largo: null, ancho: null, notas: "Por Mendez", meta: 5, hechas: 0 },
      { id: "hr22", descripcion: "CONTACTO DUPLEX CON TAPA Y CHALUPA", modulo: "Herraje de armado", material: "Contacto duplex con tapa y chalupa", largo: null, ancho: null, notas: "—", meta: 10, hechas: 0 },
      { id: "hr23", descripcion: "CONTACTO PARA VOZ Y DATOS", modulo: "Herraje de armado", material: "Contacto para voz y datos", largo: null, ancho: null, notas: "—", meta: 5, hechas: 0 },
      { id: "hr24", descripcion: "PLASTICO TRANSPARENTE M208-73", modulo: "Herraje de armado", material: "Plástico transparente M208-73 bralle...", largo: null, ancho: null, notas: "—", meta: 120, hechas: 0 },
    ],
  },
};

export const MOTIVOS_PIEZA = [
  "Falla de máquina",
  "Falta de material",
  "Cambio de herramienta",
  "Pieza rechazada",
] as const;

export const MOTIVOS_AREA = ["Comida", "Junta", "Corte de energía", "Limpieza general"] as const;