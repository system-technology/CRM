'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthApiError, obtenerSesionActualApi, usaAuthReal } from '../../lib/auth-api';
import { destinoDeIngreso, esRutaPublica } from '../../lib/rutas-publicas';

type Estado = 'verificando' | 'autenticado' | 'redirigiendo' | 'error';

/**
 * Compuerta de sesión del dashboard (T-126). Con la autenticación real activa, ninguna ruta no
 * pública se pinta sin una sesión válida: sin ella se redirige a /ingresar. Mientras se verifica
 * muestra un esqueleto, nunca contenido de la app. El modo mock solo existe si la autenticación
 * real está apagada de forma explícita.
 */
export function GuardaSesion({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const exige = usaAuthReal() && !esRutaPublica(pathname);
  const [estado, setEstado] = useState<Estado>('verificando');

  const verificar = useCallback(async () => {
    setEstado('verificando');
    try {
      const sesion = await obtenerSesionActualApi();
      if (!sesion.tenantActivoId) {
        setEstado('redirigiendo');
        router.replace(destinoDeIngreso(pathname ?? '/'));
        return;
      }
      setEstado('autenticado');
    } catch (err) {
      if (err instanceof AuthApiError && (err.statusHttp === 401 || err.code === 'SIN_SESION')) {
        setEstado('redirigiendo');
        router.replace(destinoDeIngreso(pathname ?? '/'));
        return;
      }
      setEstado('error');
    }
  }, [pathname, router]);

  useEffect(() => {
    if (exige) void verificar();
  }, [exige, verificar]);

  if (!exige || estado === 'autenticado') return <>{children}</>;

  if (estado === 'error') {
    return (
      <div role="alert" data-testid="guarda-sesion-error" className="mx-auto max-w-md p-6">
        <p className="font-semibold">No pudimos verificar tu sesión</p>
        <p className="mt-1 text-sm text-neutral-600">
          El servidor no respondió. Revisa tu conexión e inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={() => void verificar()}
          className="mt-3 min-h-[44px] rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Verificando tu sesión"
      data-testid="guarda-sesion-verificando"
      className="flex h-screen w-full animate-pulse gap-4 bg-neutral-50 p-4 dark:bg-neutral-950"
    >
      <div className="hidden h-full w-14 rounded-xl bg-neutral-200 md:block dark:bg-neutral-800" />
      <div className="h-24 flex-1 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}
