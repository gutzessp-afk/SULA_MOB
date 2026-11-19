/**
 * /api/proyectos/desde-pedido/route.ts
 * ────────────────────────────────────
 * Crea una ORDEN NUEVA (proyecto) a partir de un pedido PDF ya leído por /api/parse-pdf.
 * La usa el arrastre de pedidos del panel admin (src/components/admin/SoltarPedido.tsx).
 *
 *   POST { pedido: { numero_pedido, cliente, fecha, fecha_entrega, referencia_sucursal,
 *                    elaborado_por, partidas: [{ cantidad, clave, unidad, descripcion, precio? }] },
 *          areas?: string[]   (ids de las áreas por las que pasa; vacío = todas),
 *          prioridad?: 'baja' | 'media' | 'alta' | 'urgente' }
 *   → 200 { proyecto: { id, codigo, nombre }, partidas }
 *   → 409 { error, existe: true, proyecto_id }  si ya hay un proyecto con ese código
 *
 * Hace exactamente lo mismo que "Crear proyecto" en /admin/proyectos (crearProyecto):
 *   proyectos → proyecto_productos → producto_area_avance (si se eligieron áreas) → progreso inicial
 *   → partidas (despiece/BOM) → explosión de material 'pendiente' → Historial "pedido_creado".
 * Solo administradores.
 *
 * RUTA DEL ARCHIVO: src/app/api/proyectos/desde-pedido/route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import { esAdmin, supabaseServidor } from '@/lib/admin-api'
import { obtenerUsuarioDeSesion, registrarActividad } from '@/lib/registrar-actividad'

const PRIORIDADES = ['baja', 'media', 'alta', 'urgente']
const err = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status })
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

interface PartidaEntrada { cantidad: number; clave: string; unidad: string; descripcion: string; precio: number }

export async function POST(request: NextRequest) {
  if (!(await esAdmin())) return err('Solo administradores.', 403)
  const body = await request.json().catch(() => null)
  const p = body?.pedido
  if (!p || typeof p !== 'object') return err('Falta el pedido.', 400)

  /* ── Validar lo que viene del PDF ── */
  const numero = texto(p.numero_pedido, 20).replace(/^PED-/i, '')
  if (!numero) return err('El PDF no trae número de pedido: créalo a mano desde Proyectos.', 400)
  const partidas: PartidaEntrada[] = (Array.isArray(p.partidas) ? p.partidas : [])
    .slice(0, 500)
    .map((x: Record<string, unknown>) => ({
      cantidad: Math.max(0, Math.round(Number(x?.cantidad) || 0)),
      clave: texto(x?.clave, 60),
      unidad: texto(x?.unidad, 20) || 'Pieza',
      descripcion: texto(x?.descripcion, 1000),
      precio: Math.max(0, Number(x?.precio) || 0),
    }))
    .filter((x: PartidaEntrada) => x.descripcion)
  if (!partidas.length) return err('El PDF no trae partidas: créalo a mano desde Proyectos.', 400)

  const codigo = `PED-${numero}`
  const nombre = `Pedido ${numero}`
  const cliente = texto(p.cliente, 200)
  const referencia = texto(p.referencia_sucursal, 200)
  const fecha = texto(p.fecha, 20)
  const fechaEntrega = texto(p.fecha_entrega, 20)
  const elaboradoPor = texto(p.elaborado_por, 120)
  const prioridad = PRIORIDADES.includes(body?.prioridad) ? body.prioridad : 'media'
  const areasElegidas: string[] = Array.isArray(body?.areas) ? body.areas.filter((a: unknown) => typeof a === 'string').slice(0, 50) : []

  const supabase = supabaseServidor()

  /* ── El código es único: si ya existe, se avisa con el id para abrirlo ── */
  const { data: existente } = await supabase.from('proyectos').select('id').eq('codigo', codigo).maybeSingle()
  if (existente) return err(`Ya existe el pedido ${codigo}.`, 409, { existe: true, proyecto_id: existente.id })

  /* ── 1. Proyecto (mismos campos que crearProyecto) ── */
  const { data: proyecto, error } = await supabase
    .from('proyectos')
    .insert({
      codigo,
      nombre,
      cliente,
      referencia_sucursal: referencia || null,
      prioridad,
      progreso: 0,
      descripcion: [
        fecha && `Fecha: ${fecha}`,
        fechaEntrega && `Entrega: ${fechaEntrega}`,
        referencia && `Ref: ${referencia}`,
        elaboradoPor && `Elaboró: ${elaboradoPor}`,
      ].filter(Boolean).join(' | ') || null,
    })
    .select('id, codigo, nombre')
    .single()
  if (error || !proyecto) {
    if (error?.code === '23505') return err(`Ya existe el pedido ${codigo}.`, 409, { existe: true })
    return err(`No se pudo crear el pedido: ${error?.message ?? 'error desconocido'}`, 500)
  }

  const avisos: string[] = []

  /* ── 2. Productos del sistema anterior (avance por área) ── */
  const { data: productos, error: errProd } = await supabase
    .from('proyecto_productos')
    .insert(partidas.map(x => ({ proyecto_id: proyecto.id, nombre: `[${x.clave}] ${x.descripcion}`, cantidad: x.cantidad, progreso: 0 })))
    .select('id, cantidad')
  if (errProd) avisos.push(`No se guardaron los productos: ${errProd.message}`)

  /* ── 3. Áreas: las elegidas pendientes, las demás terminadas (igual que crearProyecto) ── */
  if (productos?.length && areasElegidas.length > 0) {
    const { data: areas } = await supabase.from('areas').select('id, peso').eq('activo', true)
    const lista = areas ?? []
    const matriz = productos.flatMap(prod => lista.map(area => {
      const aplica = areasElegidas.includes(area.id)
      const piezas = prod.cantidad || 0
      return { producto_id: prod.id, area_id: area.id, porcentaje: aplica ? 0 : 100, completado: !aplica, piezas_totales: piezas, piezas_completadas: aplica ? 0 : piezas }
    }))
    const { error: errAreas } = await supabase.from('producto_area_avance').upsert(matriz, { onConflict: 'producto_id,area_id' })
    if (errAreas) avisos.push(`No se guardaron las áreas elegidas: ${errAreas.message}`)
    else {
      const pesoTotal = lista.reduce((s, a) => s + (Number(a.peso) || 0), 0)
      const pesoTerminado = lista.filter(a => !areasElegidas.includes(a.id)).reduce((s, a) => s + (Number(a.peso) || 0), 0)
      const progresoInicial = pesoTotal > 0 ? Math.round((pesoTerminado / pesoTotal) * 100) : 0
      await Promise.all([
        supabase.from('proyecto_productos').update({ progreso: progresoInicial }).in('id', productos.map(x => x.id)),
        supabase.from('proyectos').update({ progreso: progresoInicial }).eq('id', proyecto.id),
      ])
    }
  }

  /* ── 4. Partidas (despiece / BOM) ── */
  const { error: errPartidas } = await supabase.from('partidas').insert(partidas.map((x, i) => ({
    proyecto_id: proyecto.id,
    clave: x.clave || `P${i + 1}`,
    descripcion: x.descripcion,
    cantidad: x.cantidad,
    precio_unitario: x.precio,
    importe: x.precio * x.cantidad,
    orden: i + 1,
    progreso: 0,
  })))
  if (errPartidas) avisos.push(`No se guardaron las partidas del despiece: ${errPartidas.message}`)

  /* ── 5. Explosión de material pendiente (aparece en /admin/bom) ── */
  const usuario = await obtenerUsuarioDeSesion()
  const { error: errBom } = await supabase.from('bom_explosiones').insert({
    proyecto_id: proyecto.id, estado: 'pendiente', usuario_id: usuario.id || null, usuario_nombre: usuario.nombre,
  })
  if (errBom && errBom.code !== '23505') avisos.push(`No se creó la explosión de material: ${errBom.message}`)

  /* ── 6. Historial ── */
  await registrarActividad({
    tipo: 'pedido_creado',
    usuarioId: usuario.id,
    usuarioNombre: usuario.nombre,
    referenciaId: proyecto.id,
    referenciaTipo: 'proyecto',
    detalle: { codigo, nombre, cliente, partidas: partidas.length, origen: 'arrastre de PDF' },
  })

  return NextResponse.json({ proyecto, partidas: partidas.length, avisos })
}
