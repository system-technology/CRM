import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Cookie, ShieldCheck, Lock } from 'lucide-react';
import { INVENTARIO_COOKIES } from '../../lib/privacidad-cookies';
import { BotonAbrirPreferencias } from '../politica-cookies/boton-abrir-preferencias';

export const metadata: Metadata = {
  title: 'Política de Cookies y Almacenamiento | ViajaPro CRM',
  description:
    'Inventario técnico de cookies y almacenamiento de navegador en ViajaPro CRM conforme a la Ley 1581 de 2012 de Colombia y guías de la SIC.',
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
      {/* Barra superior de navegación */}
      <header className="sticky top-0 z-20 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800/80 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl text-xs font-semibold text-neutral-600 transition hover:text-teal-700 dark:text-neutral-300 dark:hover:text-teal-400"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-2">
            <span
              data-testid="badge-borrador"
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-950/80 dark:text-amber-300"
            >
              Borrador en revisión jurídica (T-093 / T-108)
            </span>
            <span className="hidden rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 sm:inline dark:bg-teal-950 dark:text-teal-300">
              Ley 1581 / SIC
            </span>
            <BotonAbrirPreferencias />
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="space-y-8 text-left">
          {/* Encabezado */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 ring-1 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-800">
              <Cookie className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>Transparencia de Datos y Cookies (T-094, T-095 & T-108)</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              Política de Cookies y Almacenamiento Local
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Última actualización: 28 de octubre de 2026 · Versión 1.0 (Conforme a la Ley 1581 de
              2012 y la Guía de Cookies de la Superintendencia de Industria y Comercio de Colombia).
            </p>
          </div>

          {/* Resumen ejecutivo */}
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-5 dark:border-teal-900/60 dark:bg-teal-950/20">
            <h2 className="flex items-center gap-2 text-sm font-bold text-teal-900 dark:text-teal-200">
              <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Compromiso de Privacidad en ViajaPro
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-teal-800/90 dark:text-teal-300/90">
              ViajaPro no utiliza cookies para crear perfiles de publicidad comportamental ni vende
              información a corredores de datos. Las tecnologías de almacenamiento se emplean
              únicamente para mantener su sesión segura, recordar la configuración de la agencia y,
              con su consentimiento expreso, evaluar el rendimiento del cotizador.
            </p>
          </div>

          {/* Tabla de Inventario de Cookies */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
              Inventario Completo de Almacenamiento
            </h2>
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 font-semibold text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                  <tr>
                    <th className="px-4 py-3">Nombre técnico</th>
                    <th className="px-4 py-3">Categoría</th>
                    <th className="px-4 py-3">Tipo / Mecanismo</th>
                    <th className="px-4 py-3">Duración</th>
                    <th className="px-4 py-3">Finalidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {INVENTARIO_COOKIES.map((cookie) => (
                    <tr
                      key={cookie.nombre}
                      className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                        {cookie.nombre}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold ${
                            cookie.categoria === 'NECESARIAS'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : cookie.categoria === 'PREFERENCIAS'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {cookie.categoria === 'NECESARIAS'
                            ? 'Necesaria'
                            : cookie.categoria === 'PREFERENCIAS'
                              ? 'Preferencias'
                              : 'Analítica'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                        {cookie.tipo} ({cookie.origen})
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                        {cookie.duracion}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300">
                        {cookie.finalidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Cómo gestionar cookies */}
          <section className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900 dark:text-white">
              <Lock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              Gestión de sus Preferencias
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
              Usted puede modificar o revocar su consentimiento en cualquier momento pulsando el
              siguiente botón:
            </p>
            <div>
              <BotonAbrirPreferencias grande={true} />
            </div>
          </section>
        </article>
      </main>
    </div>
  );
}
