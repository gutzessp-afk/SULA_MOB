/**
 * /api/analizar-plano/route.ts
 * ────────────────────────────
 * Recibe el plano técnico (PDF) de un producto y guarda su BOM
 * (subensambles, piezas, herrajes) como plantilla reutilizable en la tabla
 * `plantilla_despiece`, por clave.
 *
 * Cómo obtiene el BOM, en este orden:
 *   1. Caché: si la clave ya tiene plantilla, la devuelve (no gasta nada).
 *   2. IA (Claude): lee el PDF completo, con sus dibujos, y devuelve piezas,
 *      acabado y la posición de cada pieza para la vista 3D. Después cada
 *      medida se comprueba contra el texto impreso del plano.
 *   3. Respaldo sin IA (src/lib/bom-pdf.ts): solo si no hay API key o la IA
 *      falla, y solo si logra leer todos los subensambles.
 *
 * Entrada (FormData): plano (PDF), clave, descripcion, force ("true" = ignorar caché)
 * Respuesta: { ok: true, source: 'cache' | 'pdf' | 'ia', bom, advertencias } o { error }
 *
 * La IA requiere ANTHROPIC_API_KEY. Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/analizar-plano/route.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { leerPlanoPDF, leerTextoPlano } from '@/lib/bom-pdf'
import { AREAS_PRODUCCION, type BomSource, type CalidadPlano, type PlantillaBOM, type ProblemaPlano } from '@/lib/types'

// Un plano de ~20 hojas tarda alrededor de un minuto con IA
export const maxDuration = 300

// Modelo que lee los planos. Haiku es el más económico; con ANTHROPIC_PLANO_MODEL se puede
// usar uno más capaz (por ejemplo claude-sonnet-5-5) para planos largos o complejos.
const MODEL = process.env.ANTHROPIC_PLANO_MODEL || 'claude-sonnet-5-5'
// Sin razonamiento previo: la respuesta es solo el JSON del BOM (más rápido y más barato).
// Haiku no razona por defecto; los modelos más nuevos se apagan con "between_tools".
const SIN_RAZONAMIENTO = /haiku/.test(MODEL) ? {} : ({ thinking: { type: 'between_tools' } } as object)
// Vercel no acepta cuerpos de más de 4.5 MB en sus funciones
const MAX_BYTES = 4.4 * 1024 * 1024

/* ═══════════════════════════════════════
   INSTRUCCIONES PARA LEER LOS PLANOS DE SULA
   ═══════════════════════════════════════ */

const SYSTEM_PROMPT = `Eres ingeniero de manufactura en SULA, una planta que fabrica mobiliario metálico (góndolas, exhibidores, archiveros, muebles de tienda). Lees planos técnicos y extraes la lista de materiales (BOM) con la que el área de corte prepara su Matriz de Corte. Lo que extraigas se usa para cortar material real, así que copia los datos tal como vienen en el plano y no inventes medidas.

Cómo están hechos los planos de SULA:
- Las primeras hojas son el ensamble general: vistas del mueble con sus cotas generales, materiales, acabado y, a veces, una tabla de herraje para armado.
- Una hoja de explosionado lista los subensambles del producto en una tabla (ITEM NO. | PART NUMBER | MATERIAL | QTY., o NO. | DESCRIPCIÓN | MATERIAL | CANTIDAD | LARGO | ANCHO). Las filas con material "VARIOS" son subensambles; su QTY es cuántos lleva UN producto.
- Después viene una hoja por subensamble con su propia tabla de piezas, y hojas de detalle de cada pieza con sus cotas. El cajetín de cada hoja trae DESCRIPCIÓN, MATERIAL, "PIEZAS POR MODELO", a veces "CORTE: L: A:" (largo y ancho de corte) y el número de hoja (por ejemplo 4/20).
- Los nombres suelen traer un prefijo de línea como "AST - 0016 - "; quítalo del nombre de la pieza.

Qué debes devolver:
- modelo, descripcion, linea (la línea o cliente, por ejemplo "ASTURIANO") y dimensiones generales del mueble (ancho x fondo x alto en mm, tomadas de las cotas del ensamble general).
- revision y dibujante: la revisión del plano (por ejemplo "REV-00") y el nombre de quien lo dibujó, como vienen en el cajetín; vacío si no aparecen.
- materiales: TODAS las filas de la tabla MATERIALES del plano, con su código (LM1, MD1, VD1, HL1, BA1...) y su descripción completa. Si el plano no usa códigos, deja el código vacío.
- acabados: TODAS las filas de la tabla ACABADOS del plano, con su código (MT1, MT2...) y su descripción completa (por ejemplo "PINTURA EN POLVO NEGRO MATE"). Todo plano de SULA trae acabado: búscalo en la tabla ACABADOS, en el campo "ACABADO:" del cajetín, en las notas generales y en los globos de las vistas. Si de verdad no aparece, devuelve la lista vacía.
- acabado: el resumen en una línea del acabado del producto, con sus códigos (por ejemplo "MT1 - PINTURA EN POLVO NEGRO MATE").
- subensambles: cada subensamble con la cantidad TOTAL que lleva UN producto y la hoja donde se detalla. Si una fila de la tabla general tiene material propio (no "VARIOS") es una pieza suelta: ponla en un subensamble llamado "ENSAMBLE GENERAL" con cantidad 1.
  - Un subensamble puede estar dentro de otro (una JAULA dentro de un MODULO). Devuélvelos todos como subensambles separados e indica en dentro_de el nombre exacto del subensamble que lo contiene (vacío si va directo en el producto).
  - Nunca pongas un subensamble como componente: las filas "VARIOS" (MODULO A, JAULA A, CUBIERTA...) no son piezas que se corten. Cada pieza fabricada debe aparecer UNA sola vez en todo el BOM, en el subensamble donde el plano la detalla; no la repitas en el ensamble general ni sumes en un subensamble las piezas de otro.
- componentes de cada subensamble: cada pieza fabricada una sola vez, con:
  - descripcion: el nombre de la pieza.
  - material: el material completo como viene (por ejemplo "T-RECT 2 3/4\\"X1\\" C.11", "LAMINA CRS C.20").
  - cantidad: piezas por UN subensamble (la QTY de la tabla del subensamble), no por producto ni por pedido.
  - largo_mm: el largo de corte en milímetros. Búscalo en la tabla, en "CORTE: L:" del cajetín o en la cota mayor de la hoja de detalle de esa pieza. Usa null si de verdad no aparece.
  - ancho: el ancho de corte en mm como texto (o el desarrollo, si es lámina doblada); para tubo, barra o solera, su perfil (por ejemplo "2 3/4\\"x1\\""). Vacío si no aparece.
  - notas: el proceso o detalle que indique el plano (por ejemplo "CORTE LASER", "DESARROLLO PARA DOBLEZ, 4 DOBLECES", "BARRENOS A 6.4MM", "REMACHAR TUERCA"); vacío si no hay.
  - pagina: la hoja del plano donde está el detalle de la pieza.
  - acabado: el acabado de ESA pieza como lo marca el plano, con código y descripción (por ejemplo "MT1 - PINTURA EN POLVO NEGRO MATE"). Las piezas metálicas llevan el acabado de la tabla ACABADOS salvo que el plano diga otra cosa. Vidrio, melamina, hule, aluminio anodizado y plásticos van al natural: deja el acabado vacío y describe su color en el material (por ejemplo "MD1 - MELAMINA NEGRA 18 MM").
  - tipo_material: metal (lámina, tubo, perfil o alambre de acero), vidrio, melamina, madera (MDF, triplay), hule, aluminio, plastico u otro.
  - area: el área de la planta que trabaja la pieza:
    - Tubo, perfil, PTR, solera, ángulo o barra: Corte de tubo.
    - Lámina con desarrollo y dobleces (forros, zoclos, charolas, perfiles y baguetas de lámina): Doblez.
    - Lámina que el plano marca "CORTE LASER", o piezas pequeñas o de contorno complejo sin doblez (orejas, placas, cartabones): Corte de Laser.
    - Lámina plana de corte recto, sin dobleces: Corte de Lamina.
    - Pieza troquelada en serie: Troquel.
    - Vidrio, melamina, hule y aluminio no pasan por las áreas de corte de acero: asígnales Empaque (el sistema los agrupa por su material).
- Revisa al final la tabla MATERIALES: cada material listado (hule, melamina, vidrio, aluminio...) debe aparecer en al menos una pieza del BOM. Si falta, busca la hoja donde se detalla esa pieza y agrégala.
- Las piezas con el mismo nombre en subensambles gemelos (JAULA A y JAULA B, MODULO A y MODULO B) llevan el mismo material y las mismas medidas, salvo que el plano diga lo contrario.
- Precisión de las medidas: junto con el PDF recibes el TEXTO EXACTO de cada hoja (cotas, tablas y cajetín, tal como están impresos). Toda medida que devuelvas debe ser un número que aparezca en ese texto, en la hoja de la pieza; cópialo con sus decimales (823.77, no 824). No calcules, no redondees y no estimes medidas a ojo a partir del dibujo: si la medida no está impresa, usa null.
- Largo y ancho de corte: en un tubo o perfil, el largo es su cota mayor y el ancho su sección. En lámina doblada, usa las medidas del DESARROLLO (la pieza extendida antes de doblar), no las de la pieza ya doblada. En vidrio, melamina y hule, largo × ancho de la hoja.
- Piezas espejo ("ESPEJO DE X", "IGUAL A X", "INCLUIDO EN X"): llevan las mismas medidas que la pieza X; cópialas y deja la referencia en notas.
- Cantidades: usa la columna de cantidad de la tabla del subensamble donde aparece la pieza. No multipliques por el número de módulos ni por la cantidad del pedido.
- Recorre TODAS las hojas del plano, de la primera a la última: cada hoja de detalle es una pieza que debe aparecer en el BOM. No omitas subensambles (jaulas de tubo, entrepaños y frentes de vidrio, puertas, baguetas, cubiertas) aunque el plano sea largo.
- herrajes: nunca los pongas como componentes. Solo lo comercial que se compra (tornillos, tuercas remache, pijas, niveladores, correderas, cerraduras, tapones), con su SKU si lo trae y la cantidad total por UN producto. Si un herraje aparece dentro de un subensamble, multiplica su cantidad por la del subensamble.

Revisión de calidad del plano. Además de leerlo, revísalo como lo haría control de ingeniería antes de liberarlo a producción y lista en "problemas" lo que esté MAL HECHO en el plano mismo, con la hoja, la gravedad y una frase concreta que cite el dato (por ejemplo: "La tabla pide 2 REFUERZO y la hoja de detalle dice 1 PIEZA"). Busca:
- Contradicciones: una cantidad, medida o material que no coincide entre la tabla general, la tabla del subensamble, el cajetín ("PIEZAS POR MODELO", "CORTE: L: A:") y las cotas del dibujo; cotas parciales que no suman la cota total; dimensiones generales distintas entre hojas.
- Datos faltantes: piezas sin material, sin cantidad o sin las cotas necesarias para cortarlas; subensambles de la tabla sin hoja de detalle; piezas dibujadas o con globo que no están en ninguna tabla; filas de tabla sin pieza; acabado no indicado.
- Cajetines mal llenados: modelo, descripción o material de otra pieza o de otro producto (cajetín copiado de otro plano), "VER PLANO" donde debería ir el dato, numeración de hojas o de partidas saltada o repetida.
- Errores de dibujo o de captura: nombres o textos mal escritos que puedan confundir, unidades mezcladas, escalas o vistas que no corresponden a la pieza, notas ilegibles o encimadas.
Gravedad: alta = dos datos del plano se contradicen y con uno de ellos la pieza saldría mal cortada o en cantidad equivocada, o falta un dato sin el cual no se puede fabricar (cita los dos valores y sus hojas); media = obliga a preguntar a ingeniería antes de fabricar; baja = descuido que no afecta la fabricación (faltas de ortografía, cajetín incompleto).
Sé estricto contigo mismo, porque esta lista decide si el plano se regresa a ingeniería:
- Reporta solo problemas reales y comprobados. Antes de anotar una contradicción, haz la cuenta (cantidad por subensamble x subensambles); si al final los datos sí coinciden, NO lo anotes.
- No son problemas: diferencias de redondeo menores a 1 mm entre cajetín y cota; una pieza espejo sin hoja propia; medidas de desarrollo distintas de las de la pieza doblada; herrajes comerciales sin hoja de detalle; tablas sin columnas LARGO/ANCHO cuando la medida está acotada en el dibujo; texto que no se ve en la hoja impresa.
- Máximo 10 problemas, los más importantes primero, cada uno en una sola frase clara de no más de 30 palabras. Si el plano está bien hecho, devuelve la lista vacía.

Además, indica cómo va cada pieza en el producto ARMADO, para dibujarlo en 3D como se ve en las vistas del ensamble general.
- tipo_producto y ancho_mm, alto_mm, profundidad_mm: dimensiones generales del producto armado, de las cotas del ensamble general. Ejes: x = ancho (izquierda a derecha), y = alto (del piso hacia arriba), z = fondo (frente a atrás).
- De cada pieza: espesor_mm (calibre de la lámina en mm, o el lado menor del perfil), geometria (tubo_rectangular, tubo_cuadrado, tubo_redondo, lamina_plana, lamina_doblada, placa o cremallera) y capa (estructura = postes, marcos y travesaños; interior = entrepaños, ménsulas, divisores; exterior = paneles y tapas que cubren; base = patas y lo que toca el piso; accesorio = piezas pequeñas de unión).
- Posición exacta de cada pieza (es lo que se dibuja). Usa las vistas acotadas y el isométrico del ensamble general y de cada subensamble:
  - Sistema de coordenadas del PRODUCTO completo, en milímetros: origen en el centro de la base, a nivel del piso. x = ancho (negativo a la izquierda, positivo a la derecha). y = altura desde el piso (siempre positiva). z = fondo (positivo hacia el frente, negativo hacia atrás). En un mueble de dos caras (góndola central) las dos caras son +z y -z.
  - armado: el tamaño de la pieza YA DOBLADA y colocada, como caja, en una lista de tres números [dx, dy, dz]: cuánto mide en x, en y y en z. No es el desarrollo: un panel de desarrollo 885 x 817 que doblado mide 885 x 762 y 10 de peralte, colocado vertical entre postes, es [885, 762, 10]. Un poste de tubo de 69.9 x 25.4 y 1600 de alto, con su cara ancha viendo al costado, es [25.4, 1600, 69.9]. Un entrepaño horizontal de 905 x 310 con pestaña de 30: [905, 30, 310].
  - posiciones: una lista con el CENTRO [x, y, z] de la pieza cada vez que aparece en UN producto. Debe haber exactamente cantidad de la pieza x cantidad de su subensamble posiciones, todas distintas: 2 postes = una en x negativo y otra en x positivo; 4 patas = las cuatro esquinas; una pieza espejo va en el lado contrario.
  - Calcula con las cotas: una pieza apoyada en el piso con dy 70 tiene y = 35; una tapa de dy 15 que remata un mueble de 1600 tiene y = 1592.5; un poste en el extremo izquierdo de un mueble de 942 de ancho con dx 25.4 tiene x = -458.3. Las piezas que se tocan en el mueble real deben quedar tocándose, sin encimarse ni flotar; ninguna puede salir del ancho, alto y fondo generales.`

/** JSON Schema de la respuesta: la API garantiza que la salida cumple esta forma */
function esquemaBOM(areas: string[]) {
  const texto = { type: 'string' }
  const codigos = {
    type: 'array',
    items: {
      type: 'object', additionalProperties: false, required: ['codigo', 'descripcion'],
      properties: { codigo: texto, descripcion: texto },
    },
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['modelo', 'descripcion', 'linea', 'revision', 'dibujante', 'acabado', 'acabados', 'dimensiones', 'tipo_producto', 'ancho_mm', 'alto_mm', 'profundidad_mm', 'materiales', 'subensambles', 'herrajes', 'problemas'],
    properties: {
      problemas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['hoja', 'gravedad', 'descripcion'],
          properties: { hoja: { type: 'integer' }, gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] }, descripcion: texto },
        },
      },
      tipo_producto: { type: 'string', enum: ['gondola_central', 'gondola_pared', 'exhibidor', 'mueble', 'otro'] },
      ancho_mm: { type: 'number' },
      alto_mm: { type: 'number' },
      profundidad_mm: { type: 'number' },
      modelo: texto,
      descripcion: texto,
      linea: texto,
      revision: texto,
      dibujante: texto,
      acabado: texto,
      dimensiones: texto,
      materiales: codigos,
      acabados: codigos,
      subensambles: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['nombre', 'cantidad', 'pagina', 'dentro_de', 'componentes'],
          properties: {
            nombre: texto,
            cantidad: { type: 'integer' },
            dentro_de: texto,
            pagina: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
            componentes: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                required: ['descripcion', 'material', 'cantidad', 'largo_mm', 'ancho', 'notas', 'pagina', 'area', 'acabado', 'tipo_material', 'espesor_mm', 'geometria', 'capa', 'inclinacion_grados', 'armado', 'posiciones'],
                properties: {
                  descripcion: texto,
                  material: texto,
                  cantidad: { type: 'integer' },
                  largo_mm: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  ancho: texto,
                  notas: texto,
                  pagina: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
                  // enum: la IA solo puede elegir áreas que existen en la planta
                  area: { type: 'string', enum: areas },
                  // El acabado se lee siempre del plano
                  acabado: texto,
                  tipo_material: { type: 'string', enum: ['metal', 'vidrio', 'melamina', 'madera', 'hule', 'aluminio', 'plastico', 'otro'] },
                  inclinacion_grados: { type: 'number' },
                  // Caja de la pieza ya armada y el centro de cada aparición (mm, marco del producto)
                  armado: { type: 'array', items: { type: 'number' } },
                  posiciones: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
                  // Datos para la vista 3D del producto armado
                  espesor_mm: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                  geometria: { type: 'string', enum: ['tubo_rectangular', 'tubo_cuadrado', 'tubo_redondo', 'lamina_plana', 'lamina_doblada', 'placa', 'cremallera'] },
                  capa: { type: 'string', enum: ['estructura', 'interior', 'exterior', 'base', 'accesorio'] },
                },
              },
            },
          },
        },
      },
      herrajes: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['descripcion', 'sku', 'cantidad'],
          properties: { descripcion: texto, sku: texto, cantidad: { type: 'integer' } },
        },
      },
    },
  }
}

/* ═══════════════════════════════════════
   LLAMADA A CLAUDE HAIKU
   ═══════════════════════════════════════ */

async function analizarConIA(pdfBase64: string, textoHojas: string[][], clave: string, descripcion: string, areas: string[], signal?: AbortSignal): Promise<PlantillaBOM> {
  // El texto impreso de cada hoja: el modelo copia de aquí los números en vez de leerlos del dibujo
  const textoPlano = textoHojas.some(h => h.length)
    ? 'TEXTO EXACTO DE CADA HOJA DEL PLANO:\n' + textoHojas.map((h, i) => `--- HOJA ${i + 1} ---\n${h.join(' | ')}`).join('\n').slice(0, 120_000)
    : ''

  const client = new Anthropic({ timeout: 280_000, maxRetries: 1 })

  // Con streaming la conexión no se corta aunque la respuesta tarde
  const respuesta = await client.messages
    .stream(
      {
        model: MODEL,
        max_tokens: 64000,
        ...SIN_RAZONAMIENTO,
        output_config: { format: { type: 'json_schema', schema: esquemaBOM(areas) } },
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            ...(textoPlano ? [{ type: "text" as const, text: textoPlano }] : []),
            { type: 'text', text: `Extrae el BOM completo de este plano.\nClave del pedido: ${clave}\nDescripción en el pedido: ${descripcion || '(sin descripción)'}` },
          ],
        }],
      },
      { signal }
    )
    .finalMessage()

  if (respuesta.stop_reason === 'refusal') throw new Error('La IA declinó analizar este plano.')
  if (respuesta.stop_reason === 'max_tokens') throw new Error('El BOM de este plano salió demasiado largo para una sola respuesta.')

  const texto = respuesta.content.find(b => b.type === 'text')
  if (!texto || texto.type !== 'text') throw new Error('La IA no devolvió el BOM.')
  return JSON.parse(texto.text) as PlantillaBOM
}

function mensajeDeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'La API key de Claude no es válida. Revisa ANTHROPIC_API_KEY.'
  if (err instanceof Anthropic.RateLimitError) return 'Claude está recibiendo muchas solicitudes. Intenta de nuevo en un momento.'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Claude tardó demasiado en analizar el plano. Intenta de nuevo.'
  if (err instanceof Anthropic.APIConnectionError) return 'No se pudo conectar con Claude.'
  if (err instanceof Anthropic.APIError) {
    // El cuerpo del error trae el motivo (por ejemplo, cuenta sin saldo)
    const cuerpo = err.error as { error?: { message?: unknown } } | undefined
    const detalle = typeof cuerpo?.error?.message === 'string' ? cuerpo.error.message : 'intenta de nuevo.'
    return `Claude respondió con un error (${err.status ?? 'sin código'}): ${detalle}`
  }
  return err instanceof Error ? err.message : 'Error al analizar el plano.'
}

/**
 * Quita lo que no es una pieza: filas que en realidad son un subensamble
 * (mismo nombre que un subensamble, o material "VARIOS") y subensambles vacíos
 * que nadie usa como contenedor.
 */
function limpiarBOM(bom: PlantillaBOM): PlantillaBOM {
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  const nombres = new Set((bom.subensambles ?? []).map(s => norm(s.nombre)))
  // Lo que se compra hecho va a herrajes, no a la lista de corte
  const esHerraje = (t: string) => /^(PIJA|TORNILLO|TUERCA|NIVELADOR|REMACHE|RONDANA|ROLDANA|ARANDELA|TAPON|REGATON|BISAGRA|CORREDERA|CERRADURA|RODAJA|RUEDA|IMAN)\b/.test(norm(t))
  const herrajes = [...(bom.herrajes ?? [])]
  const subensambles = (bom.subensambles ?? []).map(s => ({
    ...s,
    componentes: (s.componentes ?? []).filter(c => {
      // Fila que representa a OTRO subensamble completo (material "VARIOS" o sin medidas): no es una pieza.
      // Una pieza con su material y su largo sí lo es, aunque se llame igual que su subensamble.
      const sinDatos = norm(c.material) === 'VARIOS' || !c.material.trim() || c.largo_mm === null
      if (norm(c.material) === 'VARIOS' || (sinDatos && nombres.has(norm(c.descripcion)) && norm(c.descripcion) !== norm(s.nombre))) return false
      // Una "roldana" o "tapón" cortado de lámina o tubo sí se fabrica: se queda como pieza
      const seFabrica = /\b(LAMINA|LAM|TUBO|T RECT|T CUAD|PTR|ALAMBRON|REDONDO|SOLERA|ANGULO|PLACA|PERFIL)\b/.test(norm(c.material))
      if (!esHerraje(c.descripcion) || seFabrica) return true
      const cantidad = (c.cantidad || 1) * (s.cantidad || 1)
      const ya = herrajes.find(h => norm(h.descripcion) === norm(c.descripcion))
      if (ya) ya.cantidad = Math.max(ya.cantidad, cantidad)
      else herrajes.push({ descripcion: c.descripcion, sku: '', cantidad })
      return false
    }),
  }))
  const contenedores = new Set(subensambles.map(s => norm(s.dentro_de ?? '')))
  return { ...bom, herrajes, subensambles: subensambles.filter(s => s.componentes.length > 0 || contenedores.has(norm(s.nombre))) }
}

/**
 * Comprueba cada medida contra lo que está impreso en el plano. Una medida
 * que no aparece en el texto de ninguna hoja probablemente fue estimada o mal
 * leída: la pieza se marca (verificada = false) para revisarla a mano.
 * También completa las piezas espejo, compara los subensambles gemelos,
 * revisa que cada material del plano se use y completa datos del cajetín.
 */
function verificarContraPlano(bom: PlantillaBOM, textoHojas: string[][]): { bom: PlantillaBOM; sinVerificar: number; avisos: string[] } {
  const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  const todo = textoHojas.flat()
  const hayTexto = todo.length > 0

  // Números impresos en cada hoja y en todo el plano
  const numerosDe = (fragmentos: string[]) => {
    const set = new Set<number>()
    for (const f of fragmentos) for (const m of f.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) set.add(Math.round(Number(m[0]) * 100))
    return set
  }
  const porHoja = textoHojas.map(numerosDe)
  const enPlano = numerosDe(todo)
  const impreso = (valor: number, pagina: number | null) => {
    const v = Math.round(valor * 100)
    const hoja = pagina !== null ? porHoja[pagina - 1] : undefined
    return (hoja?.has(v) ?? false) || enPlano.has(v)
  }

  let sinVerificar = 0
  const subensambles = (bom.subensambles ?? []).map(sub => {
    const componentes = sub.componentes.map(c => ({ ...c }))
    for (const c of componentes) {
      // Pieza espejo sin medidas: toma las de la pieza a la que hace referencia
      const ref = norm(c.notas).match(/(?:ESPEJO DE|IGUAL A|INCLUIDO EN)\s+(.+)$/)?.[1]
      if (ref && (c.largo_mm === null || !c.ancho)) {
        const original = componentes.find(o => o !== c && ref.startsWith(norm(o.descripcion)) && o.largo_mm !== null)
        if (original) {
          c.largo_mm ??= original.largo_mm
          c.ancho ||= original.ancho
          c.espesor_mm ??= original.espesor_mm
        }
      }
      if (!hayTexto) continue
      const anchoNumero = /^\s*\d+(\.\d+)?\s*$/.test(c.ancho) ? Number(c.ancho) : null
      const ok = c.largo_mm !== null && impreso(c.largo_mm, c.pagina) && (anchoNumero === null || impreso(anchoNumero, c.pagina))
      c.verificada = ok
      if (!ok) sinVerificar++
    }
    return { ...sub, componentes }
  })

  // Piezas con el mismo nombre en subensambles gemelos deben coincidir en material y largo
  const avisos: string[] = []
  const clave = (t: string) => norm(t).replace(/\b(DE|DEL|LA|EL)\b/g, ' ').replace(/\s+/g, ' ').trim()
  // Gemelos = mismo nombre salvo la letra o número final ("JAULA A" y "JAULA B")
  const familia = (t: string) => norm(t).replace(/\s+[A-Z0-9]$/, '')
  const vistas = new Map<string, { sub: string; c: (typeof subensambles)[number]['componentes'][number] }>()
  for (const sub of subensambles) {
    for (const c of sub.componentes) {
      const k = `${familia(sub.nombre)} / ${clave(c.descripcion)}`
      const previa = vistas.get(k)
      if (!previa) { vistas.set(k, { sub: sub.nombre, c }); continue }
      if (previa.sub === sub.nombre) continue
      if (norm(previa.c.material) !== norm(c.material) || previa.c.largo_mm !== c.largo_mm) {
        if (previa.c.verificada !== false) sinVerificar++
        if (c.verificada !== false) sinVerificar++
        previa.c.verificada = false
        c.verificada = false
        avisos.push(`"${c.descripcion}" no coincide entre ${previa.sub} y ${sub.nombre} (material o largo distinto).`)
      }
    }
  }

  // Cada material de la tabla MATERIALES debe usarse en alguna pieza
  // "T-RECT", "T-CUAD" y "PTR" son tubo
  const usados = subensambles.flatMap(s => s.componentes).map(c => norm(c.material).replace(/\bT (RECT|REC|CUAD|RED)\w*|\bPTR\b/g, 'TUBO')).join(' | ')
  for (const mat of bom.materiales ?? []) {
    const palabra = norm(mat.descripcion).match(/HULE|MELAMINA|VIDRIO|ALUMINIO|ACRILICO|MDF|TRIPLAY|TUBO|LAMINA|PERFIL/)?.[0]
    if (palabra && !usados.includes(palabra) && !(mat.codigo && usados.includes(norm(mat.codigo)))) {
      avisos.push(`El plano lista el material "${[mat.codigo, mat.descripcion].filter(Boolean).join(' ')}" pero ninguna pieza lo usa: puede faltar una pieza.`)
    }
  }

  // Datos del cajetín, leídos directo del texto si el análisis no los trajo
  const revision = bom.revision || todo.map(t => t.match(/\bREV[\s.-]*\d{1,2}\b/i)?.[0]).find(Boolean)?.toUpperCase().replace(/[\s.]+/g, '-') || ''
  return { bom: { ...bom, revision, subensambles }, sinVerificar, avisos }
}

/* ═══════════════════════════════════════
   CALIDAD DEL PLANO
   ═══════════════════════════════════════ */

/**
 * Junta lo que detectó la IA al revisar el plano con comprobaciones propias
 * (sin IA) sobre el texto impreso, y decide qué tan confiable es el plano:
 *   bueno · con observaciones · deficiente (no conviene fabricar sin corregirlo)
 */
function evaluarPlano(bom: PlantillaBOM, deIA: ProblemaPlano[], textoHojas: string[][], clave: string, descripcionPedido: string): CalidadPlano {
  // Primero las comprobaciones propias; al final se suman las de la IA que no digan lo mismo
  const problemas: ProblemaPlano[] = []
  const yaCubierto: RegExp[] = []
  const agregar = (gravedad: ProblemaPlano['gravedad'], descripcion: string, hoja: number | null = null) => problemas.push({ hoja, gravedad, descripcion })
  const piezas = bom.subensambles.flatMap(s => s.componentes)
  const hojas = (lista: number[]) => (lista.length > 6 ? `${lista.slice(0, 6).join(', ')}…` : lista.join(', '))

  let planoEquivocado = false
  // 1. ¿El plano es de esta clave? (subir el plano de otro producto es el error más caro)
  const claveDe = (t: string) => t.match(/\d-\d-\d{4}-\d{3,4}/)?.[0]
  const modelo = claveDe(bom.modelo || '')
  if (claveDe(clave) && modelo && modelo !== claveDe(clave)) {
    agregar('alta', `El plano es del modelo ${modelo}, pero se subió para la clave ${clave} del pedido.`)
    planoEquivocado = true
  }

  // 2. Cajetines con el modelo de otro producto (hojas copiadas de otro plano)
  if (modelo) {
    const ajenas = new Map<string, number[]>()
    textoHojas.forEach((fragmentos, i) => {
      // Solo fragmentos que son únicamente una clave: así no se confunde con rutas de archivo
      const otras = fragmentos.map(f => f.trim()).filter(f => /^\d-\d-\d{4}-\d{3,4}$/.test(f) && f !== modelo)
      for (const o of new Set(otras)) ajenas.set(o, [...(ajenas.get(o) ?? []), i + 1])
    })
    const sinCeros = (t: string) => t.replace(/-0+/g, '-')
    for (const [otra, lista] of ajenas) {
      const motivo = sinCeros(otra) === sinCeros(modelo) ? 'modelo mal escrito' : 'cajetín copiado de otro plano'
      agregar('media', `El cajetín de la(s) hoja(s) ${hojas(lista)} dice modelo ${otra} en vez de ${modelo} (${motivo}).`, lista[0])
      yaCubierto.push(new RegExp(otra.replace(/-/g, '\\-') + '(?!\\d)'))
    }
    const sinModelo = textoHojas.map((f, i) => (f.some(t => /^(S\/M|VER PLANO)$/i.test(t.trim())) && !f.some(t => t.trim() === modelo) ? i + 1 : 0)).filter(Boolean)
    if (sinModelo.length) yaCubierto.push(/VER PLANO|S\/M/i)
    if (sinModelo.length) agregar('baja', `La(s) hoja(s) ${hojas(sinModelo)} no llevan el modelo en el cajetín ("S/M" o "VER PLANO").`, sinModelo[0])
  }

  // 3. Numeración de hojas (3/20): faltantes, repetidas o total distinto al del PDF
  const numeradas = textoHojas.map(f => f.map(t => t.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)).find(Boolean)).map(m => (m ? { n: Number(m[1]), total: Number(m[2]) } : null))
  const conNumero = numeradas.filter((x): x is { n: number; total: number } => x !== null)
  if (conNumero.length >= textoHojas.length * 0.6 && textoHojas.length > 1) {
    const total = conNumero[0].total
    if (total !== textoHojas.length) agregar('media', `El plano dice tener ${total} hojas y el PDF trae ${textoHojas.length}: puede venir incompleto o con hojas de más.`)
    const vistos = conNumero.map(x => x.n)
    const repetidas = [...new Set(vistos.filter((n, i) => vistos.indexOf(n) !== i))]
    if (repetidas.length) agregar('baja', `Número de hoja repetido: ${hojas(repetidas)}.`)
  }

  // 4. Datos generales que todo plano debe traer
  if (!bom.acabado?.trim() && !bom.acabados?.length) agregar('alta', 'El plano no indica el acabado.')
  if (!(bom.ancho_mm && bom.alto_mm && bom.profundidad_mm)) agregar('media', 'El plano no trae completas las dimensiones generales (ancho, alto y fondo).')

  // 5. Medidas del pedido contra las del plano ("535 X 283 X 1600 MM" en la descripción del pedido)
  const pedido = descripcionPedido.match(/(\d{3,4})\s*[xX×]\s*(\d{2,4})\s*[xX×]\s*(\d{3,4})/)
  if (pedido && bom.ancho_mm && bom.alto_mm && bom.profundidad_mm) {
    const delPedido = pedido.slice(1, 4).map(Number).sort((a, b) => a - b)
    const delPlano = [bom.ancho_mm, bom.alto_mm, bom.profundidad_mm].sort((a, b) => a - b)
    if (delPedido.some((v, i) => Math.abs(v - delPlano[i]) > Math.max(15, delPlano[i] * 0.03))) {
      yaCubierto.push(/\bpedido\b/i)
      agregar('media', `El pedido describe el producto de ${pedido.slice(1, 4).join(' x ')} mm y el plano mide ${bom.ancho_mm} x ${bom.profundidad_mm} x ${bom.alto_mm} mm.`)
    }
  }

  // 6. Piezas que no se pueden cortar con lo que trae el plano
  const sinLargo = piezas.filter(p => p.largo_mm === null)
  const sinMaterial = piezas.filter(p => !p.material.trim())
  const porRevisar = piezas.filter(p => p.verificada === false && p.largo_mm !== null)
  const nombres = (lista: typeof piezas) => lista.slice(0, 4).map(p => p.descripcion).join(', ') + (lista.length > 4 ? '…' : '')
  if (sinLargo.length) agregar(sinLargo.length > piezas.length * 0.15 ? 'alta' : 'media', `${sinLargo.length} pieza(s) sin medida de corte en el plano: ${nombres(sinLargo)}.`)
  if (sinMaterial.length) agregar('alta', `${sinMaterial.length} pieza(s) sin material: ${nombres(sinMaterial)}.`)
  if (porRevisar.length > Math.max(2, piezas.length * 0.2)) agregar('media', `${porRevisar.length} pieza(s) con medidas que no aparecen impresas tal cual en el plano: ${nombres(porRevisar)}.`)

  for (const p of deIA) {
    const texto = p?.descripcion?.trim()
    // Se descartan los que la propia IA termina dando por buenos ("...consistente, sin embargo...")
    if (!texto || yaCubierto.some(re => re.test(texto)) || /\b(consistente|correcto)\b[,;:]/i.test(texto) || /\bcoincide \(/i.test(texto)) continue
    problemas.push({ hoja: p.hoja !== null && p.hoja > 0 ? p.hoja : null, gravedad: p.gravedad, descripcion: texto })
  }

  // Sin repetidos, lo más grave primero
  const orden = { alta: 0, media: 1, baja: 2 }
  const unicos = problemas.filter((p, i) => problemas.findIndex(q => q.descripcion === p.descripcion) === i).sort((a, b) => orden[a.gravedad] - orden[b.gravedad])
  // Deficiente = plano equivocado, o 3 o más problemas graves. Los descuidos menores no cuentan.
  const altas = unicos.filter(p => p.gravedad === 'alta').length
  const medias = unicos.filter(p => p.gravedad === 'media').length
  const nivel: CalidadPlano['nivel'] = planoEquivocado || altas >= 3 ? 'deficiente' : altas + medias > 0 ? 'con_observaciones' : 'bueno'
  return { nivel, problemas: unicos.slice(0, 25) }
}

const contarPiezas = (bom: PlantillaBOM) => (bom.subensambles ?? []).reduce((n, s) => n + (s.componentes?.length ?? 0), 0)

/* ═══════════════════════════════════════
   HANDLER POST
   ═══════════════════════════════════════ */

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) {
    return NextResponse.json({ error: 'Solo los administradores pueden analizar planos.' }, { status: 403 })
  }

  const form = await request.formData().catch(() => null)
  const plano = form?.get('plano')
  const clave = String(form?.get('clave') ?? '').trim()
  const descripcion = String(form?.get('descripcion') ?? '').trim().slice(0, 300)
  const force = form?.get('force') === 'true'

  if (!clave) return NextResponse.json({ error: 'Falta la clave del producto.' }, { status: 400 })
  const supabase = supabaseServidor()

  // 1. Caché
  if (!force) {
    const { data } = await supabase.from('plantilla_despiece').select('bom').eq('clave', clave).maybeSingle()
    if (data?.bom) return NextResponse.json({ ok: true, source: 'cache', bom: data.bom, advertencias: [] })
  }

  if (!(plano instanceof File)) return NextResponse.json({ error: 'Falta el archivo PDF del plano.' }, { status: 400 })
  if (plano.type && plano.type !== 'application/pdf' && !plano.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'El plano debe ser un archivo PDF.' }, { status: 400 })
  }
  if (plano.size > MAX_BYTES) {
    return NextResponse.json({ error: 'El PDF pesa más de 4.4 MB; redúcelo o divídelo antes de subirlo.' }, { status: 413 })
  }

  try {
    const buffer = Buffer.from(await plano.arrayBuffer())
    let bom: PlantillaBOM | null = null
    let advertencias: string[] = []
    let source: BomSource = 'pdf'

    // 2. IA: lee el plano completo (piezas, acabado y posición de cada pieza para el 3D)
    let errorIA: unknown = null
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const { data: areasData } = await supabase.from('areas').select('nombre').eq('activo', true)
        const areas = areasData?.length ? areasData.map(a => a.nombre as string) : AREAS_PRODUCCION
        const textoHojas = await leerTextoPlano(buffer).catch(() => [] as string[][])
        // Hasta dos intentos: una respuesta cortada o vacía casi siempre sale bien a la segunda
        let analizado: PlantillaBOM | null = null
        for (let intento = 1; intento <= 2 && !analizado; intento++) {
          try {
            const respuesta = limpiarBOM(await analizarConIA(buffer.toString('base64'), textoHojas, clave, descripcion, areas, request.signal))
            if (contarPiezas(respuesta) === 0) throw new Error('La IA no encontró piezas en este plano.')
            analizado = respuesta
          } catch (err) {
            // Sin saldo, key inválida o petición cancelada: reintentar no ayuda
            const definitivo = err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError
              || err instanceof Anthropic.BadRequestError || request.signal.aborted
            if (intento === 2 || definitivo) throw err
            console.error('[analizar-plano] Primer intento fallido, se reintenta:', err)
          }
        }
        if (!analizado) throw new Error('La IA no devolvió el despiece.')
        const verificado = verificarContraPlano(analizado, textoHojas)
        // La lista de problemas de la IA se convierte en la calificación del plano
        const { problemas: deIA, ...sinProblemas } = verificado.bom as PlantillaBOM & { problemas?: ProblemaPlano[] }
        bom = { ...sinProblemas, calidad: evaluarPlano(sinProblemas, deIA ?? [], textoHojas, clave, descripcion) }
        if (bom.calidad?.nivel === 'deficiente') advertencias.unshift(`PLANO DEFICIENTE: tiene ${bom.calidad.problemas.length} problema(s) que conviene corregir con ingeniería antes de fabricar.`)
        advertencias.push(...verificado.avisos)
        if (verificado.sinVerificar) advertencias.push(`${verificado.sinVerificar} pieza(s) con medidas que no aparecen impresas en el plano: están marcadas con "Revisar" en el despiece.`)
        if (!bom.acabado?.trim() && !bom.acabados?.length) advertencias.push('No se encontró el acabado en el plano: revísalo y captúralo.')
        source = 'ia'
      } catch (err) {
        console.error('[analizar-plano] El análisis con IA falló:', err)
        errorIA = err
      }
    }

    // 3. Respaldo sin IA (sin API key o si la IA falló): el lector directo de tablas.
    //    Solo se acepta si leyó TODOS los subensambles; un despiece a medias es peor que un error.
    if (!bom) {
      try {
        const leido = await leerPlanoPDF(buffer, descripcion)
        const piezas = leido.bom.subensambles.flatMap(s => s.componentes)
        const conLargo = piezas.filter(p => p.largo_mm !== null).length
        const incompleto = leido.advertencias.some(a => /No se encontró la hoja/i.test(a))
        if (piezas.length > 0 && conLargo >= piezas.length * 0.6 && !incompleto) {
          bom = leido.bom
          advertencias = [...leido.advertencias, 'Leído sin IA: no incluye la vista 3D ni el acabado por pieza.']
          source = 'pdf'
        }
      } catch (err) {
        console.error('[analizar-plano] El lector directo falló:', err)
      }
    }
    if (!bom) {
      if (errorIA) throw errorIA
      return NextResponse.json(
        { error: 'No se pudo leer este plano sin IA y falta la variable ANTHROPIC_API_KEY.' },
        { status: 503 }
      )
    }

    // 4. Guardar (o reemplazar) la plantilla de esta clave
    const fila = {
      clave,
      clave_completa: bom.modelo || clave,
      descripcion: bom.descripcion || descripcion || null,
      linea: bom.linea || null,
      bom,
      plano_nombre: plano.name,
      source,
    }
    let { error } = await supabase.from('plantilla_despiece').upsert(fila, { onConflict: 'clave' })
    // PGRST204 = la tabla aún no tiene la columna "source": se guarda sin ella
    if (error?.code === 'PGRST204') {
      const { source: _omitida, ...sinSource } = fila // eslint-disable-line @typescript-eslint/no-unused-vars
      ;({ error } = await supabase.from('plantilla_despiece').upsert(sinSource, { onConflict: 'clave' }))
    }
    if (error) throw new Error('El plano se analizó, pero no se pudo guardar la plantilla: ' + error.message)

    return NextResponse.json({ ok: true, source, bom, advertencias })
  } catch (err) {
    console.error('[analizar-plano] Error:', err)
    return NextResponse.json({ error: mensajeDeError(err) }, { status: 500 })
  }
}
