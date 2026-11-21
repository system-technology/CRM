'use client';

import React from 'react';
import Link from 'next/link';
import { MoreHorizontal } from 'lucide-react';
import { nombreAccesibleConContador } from '../../lib/inicio-logica';
import {
  elementosDeBarraMovil,
  etiquetaDeBarra,
  type IdDeModulo,
  type ElementoDeBarraMovil,
} from '../../lib/navegacion';

export interface BarraInferiorMovilProps {
  /** Módulo activo según la ruta (`moduloActivo`). */
  idActivo: IdDeModulo | null;
  pathname: string | null;
  /** Pendientes de hoy (mismo dato que el menú lateral, T-317). `0` o `null`: sin cifra. */
  contadorHoy: number | null;
  masAbierta: boolean;
  alAbrirMas: () => void;
}

const CLASE_BASE =
  'focus-visible:ring-acento-600 relative flex h-full min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none';
const CLASE_ACTIVA =
  'bg-acento-50 text-acento-800 dark:bg-acento-950/60 dark:text-acento-300 font-semibold';
const CLASE_INACTIVA =
  'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800';
/** 11 px: el mínimo legible (era 9). Sin relleno lateral: «Conversaciones» (~75 px) cabe en el sitio de 78 px. */
const CLASE_ETIQUETA = 'text-[11px] leading-tight font-medium tracking-tight whitespace-nowrap';

function esRuta(pathname: string | null, ruta: string): boolean {
  if (!pathname) return false;
  const limpia = pathname.split(/[?#]/)[0] ?? pathname;
  return limpia === ruta || limpia.startsWith(`${ruta}/`);
}

/**
 * Barra inferior móvil (variante B de D4, T-320): Hoy · Conversaciones · Cotizar · Archivos · Más.
 * La composición sale de la tabla de navegación (`elementosDeBarraMovil`); «Más» la añade esta
 * barra. Objetivos de ~78 × 56 px; la búsqueda NO ocupa sitio (la lupa vive en la cabecera).
 */
export function BarraInferiorMovil({
  idActivo,
  pathname,
  contadorHoy,
  masAbierta,
  alAbrirMas,
}: BarraInferiorMovilProps) {
  const elementos: readonly ElementoDeBarraMovil[] = elementosDeBarraMovil();
  // «Más» se resalta cuando la pantalla actual es uno de los módulos que viven dentro de la hoja.
  const barraTieneElActivo = elementos.some(
    (e) =>
      (e.tipo === 'modulo' && e.entrada.id === idActivo) ||
      (e.tipo === 'accion' && esRuta(pathname, e.accion.ruta)),
  );
  const masResaltada = idActivo !== null && !barraTieneElActivo;

  return (
    <nav
      aria-label="Navegación móvil inferior"
      className="fixed right-0 bottom-0 left-0 z-40 flex h-14 items-stretch justify-around border-t border-neutral-200 bg-white/95 px-0 shadow-lg backdrop-blur-md md:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      {elementos.map((elemento) => {
        if (elemento.tipo === 'accion') {
          const { accion } = elemento;
          const Icono = accion.icono;
          const activa = esRuta(pathname, accion.ruta);
          return (
            <Link
              key={accion.id}
              href={accion.ruta}
              aria-label={accion.etiqueta}
              aria-current={activa ? 'page' : undefined}
              data-testid={`barra-accion-${accion.id}`}
              className={`${CLASE_BASE} ${activa ? CLASE_ACTIVA : CLASE_INACTIVA}`}
            >
              <Icono className="h-5 w-5" />
              <span className={CLASE_ETIQUETA}>{accion.etiqueta}</span>
            </Link>
          );
        }

        const { entrada } = elemento;
        const Icono = entrada.icono;
        const activo = entrada.id === idActivo;
        const cifra = entrada.id === 'hoy' ? (contadorHoy ?? 0) : 0;
        const nombre =
          entrada.id === 'hoy'
            ? nombreAccesibleConContador(entrada.etiqueta, cifra, 'pendiente', 'pendientes')
            : entrada.etiqueta;
        return (
          <Link
            key={entrada.id}
            href={entrada.ruta}
            aria-label={nombre}
            aria-current={activo ? 'page' : undefined}
            data-testid={`barra-modulo-${entrada.id}`}
            className={`${CLASE_BASE} ${activo ? CLASE_ACTIVA : CLASE_INACTIVA}`}
          >
            <span className="relative">
              <Icono className="h-5 w-5" />
              {cifra > 0 && (
                <span
                  aria-hidden="true"
                  data-testid={`contador-barra-${entrada.id}`}
                  className="absolute -top-1.5 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-none font-bold text-white"
                >
                  {cifra > 99 ? '99+' : cifra}
                </span>
              )}
            </span>
            <span className={CLASE_ETIQUETA}>{etiquetaDeBarra(entrada)}</span>
          </Link>
        );
      })}

      <button
        type="button"
        onClick={alAbrirMas}
        aria-label="Más"
        aria-haspopup="dialog"
        aria-expanded={masAbierta}
        data-testid="barra-boton-mas"
        data-resaltado={masResaltada ? 'true' : undefined}
        className={`${CLASE_BASE} ${masResaltada || masAbierta ? CLASE_ACTIVA : CLASE_INACTIVA}`}
      >
        <MoreHorizontal className="h-5 w-5" />
        <span className={CLASE_ETIQUETA}>Más</span>
      </button>
    </nav>
  );
}
