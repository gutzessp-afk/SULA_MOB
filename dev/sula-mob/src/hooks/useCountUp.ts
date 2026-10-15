import { useEffect, useRef, useState } from 'react';

/**
 * Anima un número hasta `objetivo` con ease-out (rápido al inicio, frena al final).
 * La primera vez cuenta desde 0; si el valor cambia después (al sincronizar), cuenta
 * desde el valor anterior. Con `activo` en false devuelve 0 (datos todavía cargando).
 * Devuelve también `llego`, que se vuelve true al terminar (para el latido final).
 */
export function useCountUp(objetivo: number, duracion = 900, activo = true) {
  const [valor, setValor] = useState(0);
  const [llego, setLlego] = useState(false);
  const desde = useRef(0);

  useEffect(() => {
    if (!activo) return;
    const inicio = desde.current;
    let comienzo: number | null = null;
    let cuadro = requestAnimationFrame(function paso(ahora) {
      comienzo ??= ahora;
      const avance = Math.min((ahora - comienzo) / duracion, 1);
      const suave = 1 - Math.pow(1 - avance, 3);
      setValor(Math.round(inicio + (objetivo - inicio) * suave));
      setLlego(avance === 1);
      if (avance < 1) cuadro = requestAnimationFrame(paso);
      else desde.current = objetivo;
    });
    return () => cancelAnimationFrame(cuadro);
  }, [objetivo, duracion, activo]);

  return { valor: activo ? valor : 0, llego: activo && llego };
}
