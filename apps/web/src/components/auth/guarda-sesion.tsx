'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AuthApiError, obtenerSesionActualApi, usaAuthReal } from '../../lib/auth-api';
import { construirUrlSalidaAIngreso } from '../../lib/errores-sistema';
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
          El servidor no respondió. Revisa tu conexión y reintenta, o ve a ingresar de nuevo.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void verificar()}
            className="min-h-[44px] rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Reintentar
          </button>
          <Link
            href={construirUrlSalidaAIngreso(pathname)}
            data-testid="guarda-sesion-ir-a-ingresar"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Ir a ingresar
          </Link>
        </div>
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
