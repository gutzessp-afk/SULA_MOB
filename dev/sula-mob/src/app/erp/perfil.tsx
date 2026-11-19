'use client';

/**
 * perfil.tsx — perfil activo del panel ERP (/erp)
 * ────────────────────────────────────────────────
 *   · compras / finanzas / almacen: su propio rol (no se puede cambiar).
 *   · admin: elige en el menú cómo ver el panel (selector "Ver como"); solo cambia lo que se
 *     muestra: las API siguen respondiendo como administrador.
 * También trae las etiquetas y colores de cada perfil (grupos de la plantilla v2).
 *
 * RUTA: src/app/erp/perfil.tsx
 */

import { createContext, useContext } from 'react';

export type PerfilErp = 'compras' | 'finanzas' | 'almacen';

/** color = el de su grupo en la plantilla v2; claro = el mismo tono legible sobre el fondo oscuro */
export const PERFILES: Record<PerfilErp, { etiqueta: string; color: string; claro: string }> = {
  compras: { etiqueta: 'COMPRAS', color: '#1F6F43', claro: '#6ee7b7' },
  finanzas: { etiqueta: 'FINANZAS', color: '#1D4ED8', claro: '#93c5fd' },
  almacen: { etiqueta: 'ALMACÉN', color: '#B54708', claro: '#fcd34d' },
};

export const esPerfilErp = (v: unknown): v is PerfilErp => v === 'compras' || v === 'finanzas' || v === 'almacen';

export const PerfilContext = createContext<{ perfil: PerfilErp; esAdmin: boolean }>({ perfil: 'compras', esAdmin: false });

export const usePerfilErp = () => useContext(PerfilContext);

export const TARJETA = 'rounded-[20px] sm:rounded-[26px] border border-white/20 bg-white/[0.05] shadow-[0_32px_90px_-28px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/10 backdrop-blur-2xl backdrop-saturate-[1.7]';
