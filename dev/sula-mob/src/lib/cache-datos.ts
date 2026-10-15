/**
 * cache-datos.ts
 * ──────────────
 * Datos que se muestran al instante al volver a una pantalla: se guardan en memoria
 * (navegación dentro de la app) y en sessionStorage (al recargar la página), y se
 * vuelven a pedir a Supabase en segundo plano para que siempre queden al día.
 * Solo existe en el navegador: en el servidor nunca se guarda nada, así que no se
 * mezclan datos entre usuarios. Se borra al cerrar sesión o la pestaña.
 *
 * RUTA: src/lib/cache-datos.ts
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const PREFIJO = 'sula-cache:'
const memoria = new Map<string, unknown>()
const enNavegador = typeof window !== 'undefined'

function leerGuardado<T>(clave: string): T | undefined {
  if (memoria.has(clave)) return memoria.get(clave) as T
  try {
    const texto = sessionStorage.getItem(PREFIJO + clave)
    return texto ? (JSON.parse(texto) as T) : undefined
  } catch {
    return undefined
  }
}

function guardar(clave: string, datos: unknown) {
  memoria.set(clave, datos)
  try {
    sessionStorage.setItem(PREFIJO + clave, JSON.stringify(datos))
  } catch {
    // Sin espacio o en modo privado: queda solo en memoria
  }
}

/** Borra todo lo guardado (al cerrar sesión) */
export function limpiarCache() {
  memoria.clear()
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith(PREFIJO)) sessionStorage.removeItem(k)
  } catch {
    // Nada que borrar
  }
}

/**
 * Devuelve los datos guardados de inmediato (si los hay) y los actualiza desde la base.
 * `cargando` solo es true cuando todavía no hay nada que mostrar.
 */
export function useDatos<T>(clave: string, cargar: () => Promise<T>) {
  // En la navegación dentro de la app los datos en memoria se pintan desde el primer cuadro
  const [datos, setDatos] = useState<T | undefined>(() => (enNavegador ? (memoria.get(clave) as T | undefined) : undefined))
  const [actualizando, setActualizando] = useState(true)
  const [error, setError] = useState('')
  // Hora (ms) de la última vez que llegaron datos frescos de la base
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null)
  const cargador = useRef(cargar)
  useEffect(() => {
    cargador.current = cargar
  })

  const recargar = useCallback(async () => {
    setActualizando(true)
    try {
      const nuevos = await cargador.current()
      guardar(clave, nuevos)
      setDatos(nuevos)
      setActualizadoEn(Date.now())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los datos.')
    } finally {
      setActualizando(false)
    }
  }, [clave])

  useEffect(() => {
    let vigente = true
    void (async () => {
      // Al recargar la página: lo de sessionStorage se pinta mientras llega lo nuevo
      await null
      const guardado = leerGuardado<T>(clave)
      if (vigente && guardado !== undefined) setDatos((actual) => actual ?? guardado)
      if (vigente) await recargar()
    })()
    return () => { vigente = false }
  }, [clave, recargar])

  return { datos, cargando: datos === undefined && actualizando, actualizando, actualizadoEn, error, recargar }
}

/* ── Consultas compartidas entre pantallas: la misma clave se reutiliza ── */

/** Todos los proyectos, del más nuevo al más viejo (dashboard y lista de proyectos) */
export async function cargarProyectos<T>(): Promise<T[]> {
  const { data, error } = await supabase.from('proyectos').select('*').order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

/** Todas las filas de una tabla: Supabase entrega máximo 1000 por petición */
export async function cargarTodas<T>(tabla: string, columnas = '*'): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(columnas).order('id').range(desde, desde + 999)
    if (error) throw new Error(error.message)
    filas.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return filas
  }
}
