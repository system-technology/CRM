'use client';

import React from 'react';
import Link from 'next/link';
import { Cookie, Shield } from 'lucide-react';
import { dispararAperturaModalCookies } from '../../lib/privacidad-cookies';

export function PieDePaginaPrivacidad() {
  return (
    <footer
      data-testid="pie-de-pagina-privacidad"
      className="border-t border-neutral-200/80 bg-neutral-50/70 py-6 text-xs text-neutral-500 dark:border-neutral-800/80 dark:bg-neutral-900/60 dark:text-neutral-400"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
          <p className="font-semibold text-neutral-700 dark:text-neutral-300">
            ViajaPro — CRM para agencias de turismo
          </p>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Tratamiento de datos personales conforme a la Ley 1581 de 2012 (Habeas Data / SIC).
          </p>
        </div>

        <nav
          aria-label="Enlaces legales y de privacidad"
          className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs"
        >
          <Link
            href="/privacidad"
            data-testid="enlace-pie-privacidad"
            className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-neutral-600 transition hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <span>Privacidad</span>
          </Link>

          <span className="hidden text-neutral-300 sm:inline dark:text-neutral-700">•</span>

          <Link
            href="/terminos"
            data-testid="enlace-pie-terminos"
            className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-neutral-600 transition hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <span>Términos del servicio</span>
          </Link>

          <span className="hidden text-neutral-300 sm:inline dark:text-neutral-700">•</span>

          <Link
            href="/cookies"
            data-testid="enlace-pie-cookies"
            className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-neutral-600 transition hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <Shield className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span>Cookies</span>
          </Link>

          <span className="hidden text-neutral-300 sm:inline dark:text-neutral-700">•</span>

          <button
            type="button"
            onClick={dispararAperturaModalCookies}
            data-testid="enlace-preferencias-cookies"
            className="inline-flex min-h-[44px] items-center gap-1.5 font-medium text-neutral-600 transition hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <Cookie className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
            <span>Preferencias de cookies</span>
          </button>
        </nav>
      </div>
    </footer>
  );
}
