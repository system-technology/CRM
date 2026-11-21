'use client';

/**
 * Contadores del menú lateral (T-317): «Hoy» y «Seguimientos». Usa la MISMA fuente que la pantalla de
 * Inicio (`obtenerPendientesDelDiaApi`) y las mismas reglas (`calcularContadoresDeMenu`); no hay
 * llamadas nuevas a la API. Se refresca al cambiar de pantalla (así baja tras resolver un seguimiento)
 * y cada `INTERVALO_REFRESCO_CONTADORES_MS` con la pestaña visible.
 *
 * Si la carga falla no se muestra cifra alguna (un 0 inventado diría «no tienes nada»); el error
 * visible ya lo da la propia pantalla de Hoy.
 */
import { useEffect, useRef, useState } from 'react';
import { obtenerPendientesDelDiaApi } from './crm-api';
import { calcularContadoresDeMenu, type ContadoresDeMenu } from './inicio-logica';

export const INTERVALO_REFRESCO_CONTADORES_MS = 120_000;

export function useContadoresDeMenu(pathname: string | null): ContadoresDeMenu | null {
  const [contadores, setContadores] = useState<ContadoresDeMenu | null>(null);
  const enVuelo = useRef(false);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      if (enVuelo.current) return;
      enVuelo.current = true;
      try {
        const pendientes = await obtenerPendientesDelDiaApi();
        if (vivo) setContadores(calcularContadoresDeMenu(pendientes));
      } catch {
        // Se conserva la última cifra buena; sin ninguna, no se pinta contador (ver cabecera).
      } finally {
        enVuelo.current = false;
      }
    };
    void cargar();
    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible') void cargar();
    }, INTERVALO_REFRESCO_CONTADORES_MS);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
    // `pathname` fuerza el refresco al cambiar de pantalla.
  }, [pathname]);

  return contadores;
}
