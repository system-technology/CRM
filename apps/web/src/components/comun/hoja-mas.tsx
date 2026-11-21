'use client';

import React from 'react';
import Link from 'next/link';
import { Bell, ChevronRight, X } from 'lucide-react';
import { nombreAccesibleConContador } from '../../lib/inicio-logica';
import type { EntradaDeNavegacion, IdDeModulo } from '../../lib/navegacion';
import { useFocoModal } from '../../lib/use-foco-modal';

export interface HojaMasProps {
  abierta: boolean;
  alCerrar: () => void;
  /** Módulos `movil: 'mas'` ya filtrados por permiso (`entradasDeHojaMas` + `esVisiblePara`). */
  modulos: readonly EntradaDeNavegacion[];
  idActivo: IdDeModulo | null;
  /** Vencidos de «Seguimientos» (mismo dato que el menú lateral). `0` o `null`: sin cifra. */
  seguimientosVencidos: number | null;
  /** No leídas de la campana (la misma cifra del menú lateral). */
  noLeidas: number;
  nombreUsuario: string;
  iniciales: string;
  alAbrirNotificaciones: () => void;
  alAbrirPerfil: () => void;
}

const FILA =
  'focus-visible:ring-acento-600 flex min-h-[48px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none';
const FILA_NORMAL =
  'text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800';
const FILA_ACTIVA =
  'bg-acento-50 text-acento-800 dark:bg-acento-950/60 dark:text-acento-300 font-semibold';
const ENLACE_LEGAL =
  'focus-visible:ring-acento-600 inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-medium text-neutral-600 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-300 dark:hover:text-neutral-100';

/**
 * Hoja «Más» de la barra móvil (variante B de D4, T-320): el resto de los módulos según permiso, la
 * campana de notificaciones con su contador, el perfil (sesión y cambio de agencia, en el diálogo
 * que ya existe) y los enlaces legales (la bandeja no lleva pie, este es su camino). Todo objetivo
 * mide al menos 44 px de alto. Se cierra con Esc, con el telón, con la «X» o al navegar.
 */
export function HojaMas({
  abierta,
  alCerrar,
  modulos,
  idActivo,
  seguimientosVencidos,
  noLeidas,
  nombreUsuario,
  iniciales,
  alAbrirNotificaciones,
  alAbrirPerfil,
}: HojaMasProps) {
  const ref = useFocoModal({ abierto: abierta, alCerrar });
  if (!abierta) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 md:hidden"
        onClick={alCerrar}
        aria-hidden="true"
        data-testid="telon-hoja-mas"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Más opciones"
        data-testid="hoja-mas"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-200 bg-white px-3 pb-3 shadow-2xl md:hidden dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex h-12 items-center justify-between pl-3">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Más</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            data-testid="hoja-mas-cerrar"
            className="focus-visible:ring-acento-600 flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Módulos" className="grid grid-cols-2 gap-1">
          {modulos.map((m) => {
            const Icono = m.icono;
            const activo = m.id === idActivo;
            const cifra = m.id === 'seguimientos' ? (seguimientosVencidos ?? 0) : 0;
            const nombre =
              m.id === 'seguimientos'
                ? nombreAccesibleConContador(m.etiqueta, cifra, 'vencido', 'vencidos')
                : m.etiqueta;
            return (
              <Link
                key={m.id}
                href={m.ruta}
                aria-label={nombre}
                aria-current={activo ? 'page' : undefined}
                data-testid={`mas-modulo-${m.id}`}
                className={`${FILA} ${activo ? FILA_ACTIVA : FILA_NORMAL}`}
              >
                <Icono className="h-5 w-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{m.etiqueta}</span>
                {cifra > 0 && (
                  <span
                    aria-hidden="true"
                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-none font-bold text-white"
                  >
                    {cifra > 99 ? '99+' : cifra}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-2 space-y-1 border-t border-neutral-100 pt-2 dark:border-neutral-800">
          <button
            type="button"
            onClick={alAbrirNotificaciones}
            aria-label={nombreAccesibleConContador(
              'Notificaciones',
              noLeidas,
              'sin leer',
              'sin leer',
            )}
            data-testid="mas-notificaciones"
            className={`${FILA} ${FILA_NORMAL} w-full text-left`}
          >
            <Bell className="h-5 w-5 shrink-0" />
            <span className="flex-1">Notificaciones</span>
            {noLeidas > 0 && (
              <span
                aria-hidden="true"
                data-testid="contador-campana-mas"
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] leading-none font-bold text-white"
              >
                {noLeidas > 99 ? '99+' : noLeidas}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={alAbrirPerfil}
            aria-label={`Perfil y sesión (${nombreUsuario})`}
            aria-haspopup="dialog"
            data-testid="boton-perfil-movil"
            className={`${FILA} ${FILA_NORMAL} w-full text-left`}
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-bold text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
            >
              {iniciales}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{nombreUsuario}</span>
              <span className="block text-xs font-normal text-neutral-600 dark:text-neutral-300">
                Perfil, agencia y cerrar sesión
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label="Enlaces legales"
          className="mt-2 flex flex-wrap items-center justify-center border-t border-neutral-100 pt-1 dark:border-neutral-800"
        >
          <Link href="/privacidad" data-testid="mas-legal-privacidad" className={ENLACE_LEGAL}>
            Privacidad
          </Link>
          <Link href="/terminos" data-testid="mas-legal-terminos" className={ENLACE_LEGAL}>
            Términos
          </Link>
          <Link href="/cookies" data-testid="mas-legal-cookies" className={ENLACE_LEGAL}>
            Cookies
          </Link>
        </nav>
      </div>
    </>
  );
}
