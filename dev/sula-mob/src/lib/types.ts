/**
 * types.ts
 * ────────
 * Tipos del sistema BOM / Despiece (lista de materiales de cada producto).
 *
 * Flujo: el BOM de cada producto se importa desde un Excel (template) o
 * desde el PDF del plano, y se guarda como plantilla reutilizable por clave
 * (tabla plantilla_despiece). Con las plantillas de las claves de un pedido
 * se genera la Matriz de Corte en Excel.
 *
 * RUTA: src/lib/types.ts
 */

/** Las 9 áreas de producción de la planta (mismos nombres que la tabla `areas`) */
export type AreaProduccion =
  | 'Corte de Lamina'
  | 'Corte de Laser'
  | 'Corte de tubo'
  | 'Doblez'
  | 'Troquel'
  | 'Punteado'
  | 'Soldadura Y Pulido'
  | 'Pintura'
  | 'Empaque';

export const AREAS_PRODUCCION: AreaProduccion[] = [
  'Corte de Lamina',
  'Corte de Laser',
  'Corte de tubo',
  'Doblez',
  'Troquel',
  'Punteado',
  'Soldadura Y Pulido',
  'Pintura',
  'Empaque',
];

/** De dónde se importó el BOM de una plantilla */
export type BomSource = 'excel' | 'pdf' | 'ia' | 'manual';

/* ── Datos para la vista 3D del producto armado ── */

/** Forma con la que se dibuja una pieza */
export type Geometria3D =
  | 'tubo_rectangular' | 'tubo_cuadrado' | 'tubo_redondo'
  | 'lamina_plana' | 'lamina_doblada' | 'placa' | 'cremallera';

/** Capa a la que pertenece una pieza (para ver exterior, interior o explosionado) */
export type Capa3D = 'estructura' | 'interior' | 'exterior' | 'base' | 'accesorio';

export type Eje3D = 'x' | 'y' | 'z';

/**
 * Dónde va una pieza en el producto armado, en palabras. Las coordenadas
 * exactas las calcula src/lib/ensamble-3d.ts con las medidas reales.
 * x = ancho (izquierda-derecha), y = alto, z = fondo (frente-atrás).
 */
export interface Colocacion3D {
  eje_largo: Eje3D;             // hacia dónde corre el LARGO de la pieza ya colocada
  eje_ancho: Eje3D;             // hacia dónde corre su ANCHO (el espesor va en el eje que sobra)
  lado_x: 'izquierda' | 'centro' | 'derecha' | 'ambos' | 'repartido';
  altura_y: 'piso' | 'abajo' | 'medio' | 'arriba' | 'tope' | 'repartido';
  fondo_z: 'frente' | 'centro' | 'atras' | 'ambos' | 'repartido';
}

/** De qué está hecha una pieza: define cómo se dibuja (vidrio transparente, melamina, metal pintado...) */
export type TipoMaterial = 'metal' | 'vidrio' | 'melamina' | 'madera' | 'hule' | 'aluminio' | 'plastico' | 'otro';

/** Dónde va un subensamble completo dentro del producto (o dentro de otro subensamble) */
export interface UbicacionSub {
  lado_x: Colocacion3D['lado_x'];
  altura_y: Colocacion3D['altura_y'];
  fondo_z: Colocacion3D['fondo_z'];
}

export type TipoProducto = 'gondola_central' | 'gondola_pared' | 'exhibidor' | 'mueble' | 'otro';

/** Una pieza física que se fabrica (una fila de la tabla BOM del plano) */
export interface ComponenteBOM {
  descripcion: string;          // ej. "COSTADO DER-IZQ"
  material: string;             // ej. "LAMINA CRS C.20", "T CUAD CRS 1 1/4\" C.14"
  cantidad: number;             // piezas por cada subensamble (columna CANTIDAD del plano)
  largo_mm: number | null;      // largo de corte en mm
  ancho: string;                // ancho en mm, o perfil del tubo (ej. "531.5", "1 1/4\"")
  notas: string;                // proceso de corte: "CORTE LASER", "CORTE 45", "BARRENOS A 6.4MM"...
  pagina: number | null;        // hoja del plano donde está el detalle
  area: AreaProduccion | 'Sin área'; // primera área por la que pasa la pieza
  // Vista 3D (solo cuando el plano se analizó con IA)
  espesor_mm?: number | null;
  geometria?: Geometria3D;
  capa?: Capa3D;
  colocacion?: Colocacion3D;
  /** Acabado de ESTA pieza según el plano, ej. "MT1 - PINTURA EN POLVO NEGRO MATE"; vacío si va al natural */
  acabado?: string;
  tipo_material?: TipoMaterial;
  /** Grados que la pieza se inclina hacia atrás respecto a la vertical (0 = sin inclinar) */
  inclinacion_grados?: number;
  /** Tamaño de la pieza YA ARMADA (doblada, en su posición): cuánto mide en x, y, z, en mm */
  armado?: number[];            // [dx, dy, dz]
  /** Centro de cada una de sus apariciones en UN producto, en mm (origen: centro de la base, en el piso) */
  posiciones?: number[][];      // [[x, y, z], ...]
  /** false = su largo o su ancho no aparece impreso en el plano: hay que revisarla a mano */
  verificada?: boolean;
}

/** Grupo de piezas que forman una parte del producto (ej. "CUERPO", "GAVETA ARCHIVADORA") */
export interface SubensambeBOM {
  nombre: string;
  cantidad: number;             // cuántos de este subensamble lleva UNA unidad del producto
  pagina: number | null;
  componentes: ComponenteBOM[];
  // Vista 3D (solo cuando el plano se analizó con IA)
  dentro_de?: string;           // nombre del subensamble que lo contiene ("" = va directo en el producto)
  ancho_mm?: number;            // medidas generales del subensamble armado (0 = no se sabe)
  alto_mm?: number;
  profundidad_mm?: number;
  ubicacion?: UbicacionSub;
}

/** Herraje comercial que no se fabrica (tornillería, niveladores, correderas, cerraduras) */
export interface HerrajeBOM {
  descripcion: string;
  sku: string;                  // código del proveedor si el plano lo trae
  cantidad: number;             // por UNA unidad del producto
}

/** Algo mal hecho en el plano mismo (no en la lectura): dato faltante, contradicción, cajetín copiado... */
export interface ProblemaPlano {
  hoja: number | null;
  gravedad: 'alta' | 'media' | 'baja';
  descripcion: string;
}

/** Qué tan confiable es el plano para fabricar con él */
export interface CalidadPlano {
  nivel: 'bueno' | 'con_observaciones' | 'deficiente';
  problemas: ProblemaPlano[];
}

/** BOM completo de un modelo/clave */
export interface PlantillaBOM {
  modelo: string;               // clave que aparece en el plano (ej. "2-1-0072-0009")
  descripcion: string;          // ej. "ARCHIVERO LATERAL 2 CAJONES"
  linea: string;                // línea o cliente del producto (ej. "VENTO")
  revision?: string;            // revisión del plano según el cajetín (ej. "REV-00")
  dibujante?: string;           // quien dibujó el plano según el cajetín
  materiales: { codigo: string; descripcion: string }[]; // tabla MATERIALES del plano (LM1, LM2...)
  acabado?: string;             // ej. "Pintura electrostática negro mate"
  acabados?: { codigo: string; descripcion: string }[]; // tabla ACABADOS del plano (MT1, MT2...)
  dimensiones?: string;         // dimensiones generales, ej. "2400 x 1000 x 400 mm"
  // Vista 3D
  tipo_producto?: TipoProducto;
  ancho_mm?: number | null;     // dimensiones generales del producto armado
  alto_mm?: number | null;
  profundidad_mm?: number | null;
  subensambles: SubensambeBOM[];
  herrajes: HerrajeBOM[];
  /** Revisión de calidad del plano: la llena el análisis */
  calidad?: CalidadPlano;
}

/** Registro de la tabla `plantilla_despiece` en Supabase */
export interface PlantillaDespiece {
  id: string;
  clave: string;                // clave de la partida del pedido (llave del caché)
  clave_completa: string | null;
  descripcion: string | null;
  linea: string | null;
  bom: PlantillaBOM;
  plano_nombre: string | null;
  source: BomSource;
  created_at: string;
  updated_at: string;
}

/** Línea del pedido (PDF) que se usa para la matriz */
export interface PartidaPedido {
  clave: string;
  descripcion: string;
  cantidad: number;
}

/** Cuerpo de POST /api/generar-matriz-corte */
export interface MatrizCorteRequest {
  cliente: string;
  nombre_proyecto: string;
  fecha_entrega: string;        // YYYY-MM-DD o vacío
  partidas: PartidaPedido[];
}
