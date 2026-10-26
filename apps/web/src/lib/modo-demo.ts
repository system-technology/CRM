/**
 * Gestión del modo demostración frente al modo real en ViajaPro (Bloque 1).
 *
 * Principio:
 * - Modo REAL es el COMPORTAMIENTO POR DEFECTO.
 *   Con sesión iniciada, todas las pantallas con endpoint conectan a la API real
 *   de NestJS con las credenciales/cookies de sesión HttpOnly de la agencia activa (ADR-0011).
 *   No se requieren variables de entorno de desarrollo (NEXT_PUBLIC_USE_REAL_CRM,
 *   NEXT_PUBLIC_USE_REAL_INBOX, NEXT_PUBLIC_DEV_TENANT_ID).
 *
 * - Modo DEMOSTRACIÓN es EXPLÍCITO, VISIBLE y OPCIONAL.
 *   - Explícito: Solo se activa si el usuario lo solicita explícitamente en el navegador
 *     (localStorage "viajapro_modo_demo" === "true", query param ?demo=1) o si el entorno
 *     de pruebas unitarias declara NEXT_PUBLIC_USE_REAL_CRM="false" / NEXT_PUBLIC_USE_MOCK_INBOX="true".
 *   - Visible: Muestra el indicador y distintivo de datos de demostración en toda la interfaz.
 *   - Opcional: El asesor puede alternar entre modo real y modo demo con un solo clic.
 */
import { useState, useEffect } from 'react';

export const CLAVE_LOCALSTORAGE_MODO_DEMO = 'viajapro_modo_demo';
export const EVENTO_CAMBIO_MODO_DEMO = 'viajapro:cambio-modo-demo';

/**
 * Evalúa si la aplicación debe operar en modo demostración (datos simulados).
 */
export function esModoDemo(): boolean {
  // 1. Preferencia explícita en el navegador
  if (typeof window !== 'undefined') {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const paramDemo = searchParams.get('demo');
      if (paramDemo === '1' || paramDemo === 'true') {
        return true;
      }
      if (paramDemo === '0' || paramDemo === 'false') {
        return false;
      }
      const valorLocal = window.localStorage.getItem(CLAVE_LOCALSTORAGE_MODO_DEMO);
      if (valorLocal === 'true') {
        return true;
      }
      if (valorLocal === 'false') {
        return false;
      }
    } catch {
      // Entorno sin acceso a window o localStorage bloqueado
    }
  }

  // 2. Variables de entorno explícitas para pruebas o forzar demo
  if (process.env['NEXT_PUBLIC_FORCE_DEMO'] === 'true') {
    return true;
  }
  if (process.env['NEXT_PUBLIC_USE_MOCK_INBOX'] === 'true') {
    return true;
  }
  if (process.env['NEXT_PUBLIC_USE_REAL_CRM'] === 'false') {
    return true;
  }

  // 3. POR DEFECTO: MODO REAL (con sesión activa en el servidor)
  return false;
}

/**
 * Fija explícitamente el modo demostración o real en el navegador.
 */
export function fijarModoDemo(activo: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CLAVE_LOCALSTORAGE_MODO_DEMO, activo ? 'true' : 'false');
      window.dispatchEvent(
        new CustomEvent(EVENTO_CAMBIO_MODO_DEMO, {
          detail: { activo },
        }),
      );
    } catch {
      // ignore
    }
  }
}

/**
 * Hook de React para reaccionar a cambios en el modo demostración en componentes cliente.
 */
export function useModoDemo(): {
  esDemo: boolean;
  activarDemo: () => void;
  desactivarDemo: () => void;
  alternarDemo: () => void;
} {
  const [esDemo, setEsDemo] = useState<boolean>(() => esModoDemo());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const alCambiar = (e: Event) => {
      const custom = e as CustomEvent<{ activo?: boolean }>;
      if (custom.detail && typeof custom.detail.activo === 'boolean') {
        setEsDemo(custom.detail.activo);
      } else {
        setEsDemo(esModoDemo());
      }
    };

    window.addEventListener(EVENTO_CAMBIO_MODO_DEMO, alCambiar);
    window.addEventListener('storage', alCambiar);

    return () => {
      window.removeEventListener(EVENTO_CAMBIO_MODO_DEMO, alCambiar);
      window.removeEventListener('storage', alCambiar);
    };
  }, []);

  return {
    esDemo,
    activarDemo: () => fijarModoDemo(true),
    desactivarDemo: () => fijarModoDemo(false),
    alternarDemo: () => fijarModoDemo(!esDemo),
  };
}
