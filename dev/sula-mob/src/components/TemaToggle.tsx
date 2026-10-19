'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Palette } from 'lucide-react';

export type Tema = 'oscuro' | 'azul';

const CLAVE = 'sula_theme';
const EVENTO = 'sula-tema';
const ORDEN: Tema[] = ['oscuro', 'azul'];
const DATOS: Record<Tema, { icono: typeof Moon; nombre: string }> = {
  oscuro: { icono: Moon, nombre: 'Oscuro' },
  azul: { icono: Palette, nombre: 'Azul' },
};

/**
 * Script que va en el <head>: aplica el tema guardado antes de pintar la página,
 * para que no se vea un parpadeo del tema oscuro al cargar.
 */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CLAVE}');if(t==='azul')document.documentElement.dataset.theme=t}catch(e){}`;

const leer = (): Tema => (document.documentElement.dataset.theme === 'azul' ? 'azul' : 'oscuro');
const suscribir = (aviso: () => void) => {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
};

export function aplicarTema(tema: Tema) {
  if (tema === 'oscuro') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = tema;
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento el tema dura hasta recargar
  }
  window.dispatchEvent(new Event(EVENTO));
}

/** Tema activo; se actualiza al cambiarlo con el botón */
export function useTema(): Tema {
  return useSyncExternalStore(suscribir, leer, () => 'oscuro' as Tema);
}

/** Botón que alterna entre los temas; el elegido se recuerda en este navegador */
export function TemaToggle({ className = '' }: { className?: string }) {
  const tema = useTema();
  const siguiente = ORDEN[(ORDEN.indexOf(tema) + 1) % ORDEN.length];
  const { icono: Icono, nombre } = DATOS[tema];

  return (
    <button
      type="button"
      onClick={() => aplicarTema(siguiente)}
      title={`Tema: ${nombre}. Cambiar a ${DATOS[siguiente].nombre.toLowerCase()}`}
      aria-label={`Tema ${nombre}. Cambiar a ${DATOS[siguiente].nombre.toLowerCase()}`}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] transition-all duration-300 hover:border-white/20 hover:bg-white/[0.12] active:scale-90 ${className}`}
    >
      <Icono key={tema} className="h-4 w-4 text-blue-400 animate-in spin-in-180 duration-300" />
    </button>
  );
}
