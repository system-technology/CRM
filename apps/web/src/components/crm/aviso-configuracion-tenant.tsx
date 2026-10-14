'use client';

import React from 'react';
import { AlertCircle, Terminal, RefreshCw, Eye } from 'lucide-react';

interface AvisoConfiguracionTenantProps {
  mensajeError?: string;
  onContinuarConDemo?: () => void;
}

/**
 * Componente amigable de error de configuración de tenant (Tarea 0c.14.2).
 *
 * Se presenta cuando NEXT_PUBLIC_USE_REAL_CRM=true pero falta NEXT_PUBLIC_DEV_TENANT_ID
 * o la API responde 401 por falta de sesión/tenant.
 * Informa qué falta y cómo se soluciona ejecutando `pnpm db:seed`.
 */
export function AvisoConfiguracionTenant({
  mensajeError,
  onContinuarConDemo,
}: AvisoConfiguracionTenantProps) {
  return (
    <div
      data-testid="aviso-configuracion-tenant"
      className="mx-auto my-auto max-w-xl p-6"
      role="alert"
    >
      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900/50 dark:bg-neutral-900">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Configuración requerida para la API real
              </h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                401 · Tenant no especificado
              </span>
            </div>
            <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300">
              El interruptor{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                NEXT_PUBLIC_USE_REAL_CRM=true
              </code>{' '}
              está encendido, pero falta configurar{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                NEXT_PUBLIC_DEV_TENANT_ID
              </code>
              . Por regla de aislamiento multi-tenant (R1/R2), la API rechaza peticiones sin
              contexto de agencia.
            </p>

            {mensajeError && (
              <div className="mt-3 rounded-xl border border-neutral-100 bg-neutral-50 p-2.5 font-mono text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-400">
                Detalle: {mensajeError}
              </div>
            )}

            {/* Pasos de resolución */}
            <div className="mt-4 space-y-2 rounded-2xl border border-neutral-200/70 bg-neutral-50 p-3.5 text-xs dark:border-neutral-800 dark:bg-neutral-950/60">
              <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                <Terminal className="text-acento-600 dark:text-acento-400 h-3.5 w-3.5" />
                <span>Cómo configurarlo en 3 pasos:</span>
              </div>
              <ol className="list-decimal space-y-1.5 pl-4 text-[11px] text-neutral-600 dark:text-neutral-400">
                <li>
                  Ejecuta el sembrado de base de datos en la consola:
                  <pre className="text-ok-400 mt-0.5 rounded bg-neutral-900 p-1 font-mono text-[10px] select-all">
                    pnpm db:seed
                  </pre>
                  <span className="text-[10px] text-neutral-500">
                    (Al terminar, imprimirá el ID generado para la agencia demo André&apos;s Tours).
                  </span>
                </li>
                <li>
                  Agrega ese ID al archivo{' '}
                  <code className="font-mono text-neutral-800 dark:text-neutral-200">.env</code> de
                  la raíz:
                  <pre className="mt-0.5 rounded bg-neutral-900 p-1 font-mono text-[10px] text-neutral-200 select-all">
                    NEXT_PUBLIC_DEV_TENANT_ID=00000000-0000-4000-a000-000000000001
                  </pre>
                </li>
                <li>
                  Reinicia el servidor de desarrollo (<code className="font-mono">pnpm dev</code>)
                  para cargar la variable.
                </li>
              </ol>
            </div>

            {/* Acciones */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Reintentar conexión</span>
              </button>

              {onContinuarConDemo && (
                <button
                  type="button"
                  onClick={onContinuarConDemo}
                  className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Eye className="h-3.5 w-3.5 text-neutral-400" />
                  <span>Ver con datos de demostración</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
