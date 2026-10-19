'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

// Evento de Chrome/Edge cuando la app se puede instalar (no viene en los tipos de TypeScript)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLAVE_DESCARTADO = 'sula-pwa-dismissed';
const DIAS_SIN_MOSTRAR = 7;

function descartadoHacePoco(): boolean {
  try {
    const cuando = Number(localStorage.getItem(CLAVE_DESCARTADO));
    return !!cuando && Date.now() - cuando < DIAS_SIN_MOSTRAR * 86_400_000;
  } catch {
    return false;
  }
}

/** Registra el service worker en producción. En desarrollo no: guardaría archivos que cambian a cada rato */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((err) => {
      console.error('No se pudo registrar el service worker:', err);
    });
  }, []);
  return null;
}

/**
 * Aviso de "Instalar SULA MOB". En Chrome y Edge abre el diálogo de instalación del navegador;
 * en iPhone y iPad, que no lo tienen, explica cómo añadirla a la pantalla de inicio.
 */
export default function InstallPWA() {
  const [instalador, setInstalador] = useState<BeforeInstallPromptEvent | null>(null);
  const [mostrarIOS, setMostrarIOS] = useState(false);

  useEffect(() => {
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (yaInstalada || descartadoHacePoco()) return;

    const alPoderInstalar = (e: Event) => {
      // Evita el aviso propio del navegador: se abre con nuestro botón
      e.preventDefault();
      setInstalador(e as BeforeInstallPromptEvent);
    };
    const alInstalar = () => {
      setInstalador(null);
      setMostrarIOS(false);
    };
    window.addEventListener('beforeinstallprompt', alPoderInstalar);
    window.addEventListener('appinstalled', alInstalar);

    // iPadOS se presenta como Mac: se distingue por la pantalla táctil
    const esIOS =
      /iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const timer = esIOS ? setTimeout(() => setMostrarIOS(true), 3000) : undefined;

    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', alPoderInstalar);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);

  function cerrar() {
    setInstalador(null);
    setMostrarIOS(false);
    try {
      localStorage.setItem(CLAVE_DESCARTADO, String(Date.now()));
    } catch {
      // Sin almacenamiento el aviso volverá a salir en la siguiente visita
    }
  }

  async function instalar() {
    if (!instalador) return;
    const { outcome } = await instalador.prompt();
    // El evento solo sirve una vez; si lo rechazó, no se insiste por unos días
    if (outcome === 'accepted') setInstalador(null);
    else cerrar();
  }

  if (!instalador && !mostrarIOS) return null;

  // Arriba a la derecha para no tapar a Mobi, que vive abajo
  return (
    <div className="fixed left-4 right-4 top-20 z-[60] animate-in fade-in slide-in-from-top-4 duration-300 sm:left-auto sm:right-6 sm:w-[360px]">
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0e1a]/95 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Download className="h-5 w-5" /> Instalar SULA MOB
          </span>
          <button
            onClick={cerrar}
            className="rounded-lg p-1 text-white/60 transition-all hover:bg-white/10 hover:text-white"
            aria-label="Cerrar aviso de instalación"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {instalador ? (
            <>
              <p className="text-[13px] leading-relaxed text-white/80">
                Ábrela desde tu pantalla de inicio, a pantalla completa y sin pasar por el navegador.
              </p>
              <button
                onClick={instalar}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-blue-500 to-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition-all hover:shadow-blue-500/40 active:scale-[0.98]"
              >
                Instalar app
              </button>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-white/80">Para instalarla en tu iPhone o iPad:</p>
              <ol className="mt-2 space-y-1.5 text-[12px] text-white/60">
                {[
                  <>Toca <strong className="text-white/80">Compartir</strong> <Share className="inline h-3.5 w-3.5 align-text-bottom" /></>,
                  <>Elige <strong className="text-white/80">Añadir a pantalla de inicio</strong></>,
                  <>Toca <strong className="text-white/80">Añadir</strong></>,
                ].map((paso, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400">
                      {i + 1}
                    </span>
                    <span>{paso}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
