/**
 * generar-pdf-pedido.ts
 * ─────────────────────
 * Toma la plantilla en blanco de Click Balance (Pedido_en_blanco.pdf)
 * y llena sus 146 campos de formulario con los datos del pedido.
 *
 * Campos del template:
 *   Encabezado — pedido_p{1|2}, cliente_p{1|2}, elaborado_p{1|2}, etc.
 *   Partidas   — cant_p{1|2}_r{1-9}, clave_p{1|2}_r{1-9}, etc.
 *
 * ORDEN CRÍTICO:
 *   1. Cargar plantilla
 *   2. Limpiar estilos (bordes, fondos) — ANTES de setText()
 *   3. Configurar alineación y quitar maxLength
 *   4. Llenar campos con datos (setText regenera /AP limpio)
 *   5. Aplanar y descargar
 *
 * Si se llena ANTES de limpiar, setText() regenera las apariencias
 * con el fondo azul original de la plantilla.
 */

import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFNumber,
  TextAlignment,
} from 'pdf-lib';
import type { Partida, PedidoData } from './parse-pedido';

// ── Tipos ──────────────────────────────────────────────────────────

type PDFForm = ReturnType<PDFDocument['getForm']>;

// ── Constantes ─────────────────────────────────────────────────────

/** Filas de partidas por página en la plantilla Click Balance */
const ROWS_PER_PAGE = 9;

/** Total de páginas en la plantilla */
const TOTAL_PAGES = 2;

/** Ruta de la plantilla dentro de /public */
const TEMPLATE_URL = '/templates/Pedido_en_blanco.pdf';

// ── Helpers de campos ──────────────────────────────────────────────

/** Escribe texto en un campo. Si no existe, lo ignora. */
function setField(form: PDFForm, name: string, value: string) {
  try {
    form.getTextField(name).setText(value);
  } catch {
    console.warn(`Campo PDF no encontrado: ${name}`);
  }
}

/** Configura alineación. Debe llamarse ANTES de setText(). */
function setAlign(form: PDFForm, name: string, align: TextAlignment) {
  try {
    form.getTextField(name).setAlignment(align);
  } catch { /* campo no encontrado */ }
}

/** Quita maxLength para permitir textos largos (desc > 100 chars). */
function clearMaxLength(form: PDFForm, name: string) {
  try {
    form.getTextField(name).setMaxLength(undefined);
  } catch { /* campo no encontrado */ }
}

// ── Limpieza de estilos ────────────────────────────────────────────

/**
 * Elimina bordes, fondos y apariencias pre-renderizadas de TODOS
 * los widgets del formulario. Esto DEBE ejecutarse ANTES de setText()
 * porque setText() regenera /AP usando los valores actuales de /MK.
 */
function limpiarEstilosCampos(form: PDFForm, pdfDoc: PDFDocument) {
  for (const field of form.getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      widget.dict.delete(PDFName.of('BS')); // Border Style
      widget.dict.delete(PDFName.of('AP')); // Appearance streams

      // /MK contiene Border Color (BC) y Background Color (BG)
      const mk = widget.dict.lookup(PDFName.of('MK'));
      if (mk instanceof PDFDict) {
        mk.delete(PDFName.of('BC'));
        mk.delete(PDFName.of('BG'));
      }

      // Borde invisible [0, 0, 0]
      widget.dict.set(
        PDFName.of('Border'),
        pdfDoc.context.obj([
          PDFNumber.of(0),
          PDFNumber.of(0),
          PDFNumber.of(0),
        ]),
      );
    }
  }
}

// ── Configuración de campos ────────────────────────────────────────

/**
 * Configura alineación centrada en encabezado y columnas,
 * y quita maxLength de descripciones (la plantilla tiene 100
 * pero las descripciones reales pueden ser más largas).
 */
function configurarCampos(form: PDFForm) {
  const { Center } = TextAlignment;

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const p = `_p${page}`;

    // Encabezado centrado
    setAlign(form, `pedido${p}`, Center);
    setAlign(form, `fecha_hora${p}`, Center);
    setAlign(form, `fecha_entrega${p}`, Center);

    // Columnas de partidas
    for (let row = 1; row <= ROWS_PER_PAGE; row++) {
      const r = `${p}_r${row}`;
      setAlign(form, `cant${r}`, Center);
      setAlign(form, `clave${r}`, Center);
      setAlign(form, `unidad${r}`, Center);
      clearMaxLength(form, `desc${r}`);
    }
  }
}

// ── Llenado de datos ───────────────────────────────────────────────

/** Llena los campos de encabezado y partidas en ambas páginas. */
function llenarCampos(form: PDFForm, pedido: PedidoData, partidas: Partida[]) {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const p = `_p${page}`;

    // Encabezado (se repite en cada página)
    setField(form, `pedido${p}`, pedido.numero_pedido || '');
    setField(form, `elaborado${p}`, pedido.elaborado_por || '');
    setField(form, `cliente${p}`, pedido.cliente || '');
    setField(form, `fecha_hora${p}`, pedido.fecha || '');
    setField(form, `fecha_entrega${p}`, pedido.fecha_entrega || '');
    setField(form, `referencia${p}`, pedido.referencia_sucursal || '');

    // Partidas de esta página
    const startIdx = (page - 1) * ROWS_PER_PAGE;

    for (let row = 1; row <= ROWS_PER_PAGE; row++) {
      const r = `${p}_r${row}`;
      const partida = partidas[startIdx + row - 1];

      if (partida) {
        setField(form, `cant${r}`, Number(partida.cantidad).toFixed(2));
        setField(form, `clave${r}`, partida.clave || '');
        setField(form, `unidad${r}`, partida.unidad || '');
        setField(form, `desc${r}`, partida.descripcion || '');
      } else {
        // Fila vacía — limpiar por si la plantilla trae algo
        setField(form, `cant${r}`, '');
        setField(form, `clave${r}`, '');
        setField(form, `unidad${r}`, '');
        setField(form, `desc${r}`, '');
      }
    }
  }
}

// ── Función principal ──────────────────────────────────────────────

/**
 * Genera y descarga el PDF del pedido llenando los campos
 * de la plantilla Click Balance.
 */
export async function generarPdfPedido(pedido: PedidoData, partidas: Partida[]) {
  try {
    // 1. Descargar plantilla
    const response = await fetch(TEMPLATE_URL);
    if (!response.ok) {
      throw new Error(
        `No se encontró la plantilla PDF (HTTP ${response.status}). ` +
        `Verifica que existe en public/templates/Pedido_en_blanco.pdf`,
      );
    }
    const templateBytes = await response.arrayBuffer();

    // 2. Cargar PDF
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // 3. Limpiar estilos (ANTES de setText)
    limpiarEstilosCampos(form, pdfDoc);

    // 4. Configurar alineación y quitar maxLength
    configurarCampos(form);

    // 5. Llenar campos con datos
    llenarCampos(form, pedido, partidas);

    // 6. Aplanar — convierte campos en texto fijo
    form.flatten();

    // 7. Descargar
    const pdfBytesOut = await pdfDoc.save();
    const blob = new Blob([new Uint8Array(pdfBytesOut)], {
      type: 'application/pdf',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Pedido_${pedido.numero_pedido || 'modificado'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error generando PDF:', err);
    const msg = err instanceof Error ? err.message : String(err);
    alert(`Error al generar el PDF:\n${msg}`);
  }
}