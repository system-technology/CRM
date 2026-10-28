import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Cookie, Lock } from 'lucide-react';
import { INVENTARIO_COOKIES } from '../../lib/privacidad-cookies';
import { BotonAbrirPreferencias } from './boton-abrir-preferencias';

export const metadata: Metadata = {
  title: 'Política de Cookies e Inventario de Almacenamiento | ViajaPro CRM',
  description:
    'Inventario técnico completo de cookies y almacenamiento de navegador en ViajaPro CRM conforme a la Ley 1581 de 2012 de Colombia y las guías de la SIC.',
};

export default function PoliticaCookiesPage() {
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
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
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
              <span>Transparencia de Datos y Cookies (T-094 & T-095)</span>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
              Política de Cookies y Almacenamiento del Navegador
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
              En ViajaPro protegemos los datos de las agencias de turismo y de sus asesores. Solo
              empleamos cookies estrictamente técnicas indispensables para el funcionamiento y
              aislamiento de tu sesión (R1, R2). Las tecnologías de preferencias o telemetría
              operacional son opcionales y nunca recopilan pasaportes, números telefónicos ni
              conversaciones privadas de WhatsApp de tus viajeros.
            </p>
          </div>

          {/* Sección 1: Qué son las cookies y tecnologías similares */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              1. ¿Qué son las cookies y el almacenamiento local?
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Una cookie es un pequeño archivo de texto enviado por el servidor web y almacenado en
              el navegador del usuario. Asimismo, el almacenamiento local (
              <code className="rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
                localStorage
              </code>
              ) permite persistir preferencias en el dispositivo del cliente de forma rápida y
              segura.
            </p>
          </section>

          {/* Sección 2: Inventario completo de tecnologías */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                2. Inventario Técnico Completo de Cookies y Storage (T-094)
              </h2>
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                A continuación se desglosan todos los identificadores utilizados tanto en el backend
                (
                <code className="rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
                  apps/api
                </code>
                ) como en la aplicación web (
                <code className="rounded bg-neutral-200 px-1 py-0.5 dark:bg-neutral-800">
                  apps/web
                </code>
                ):
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-bold tracking-wider text-neutral-700 uppercase dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-300">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Nombre / Clave
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Tipo y Origen
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Categoría
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Duración
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Finalidad
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {INVENTARIO_COOKIES.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                        {item.nombre}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">
                          {item.tipo}
                        </span>{' '}
                        · {item.origen}
                      </td>
                      <td className="px-4 py-3">
                        {item.categoria === 'NECESARIAS' ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                            <Lock className="h-2.5 w-2.5" />
                            Necesaria
                          </span>
                        ) : item.categoria === 'PREFERENCIAS' ? (
                          <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                            Preferencia
                          </span>
                        ) : (
                          <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            Analítica
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                        {item.duracion}
                      </td>
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                        {item.finalidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sección 3: Categorías y Base Legal */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              3. Categorías de cookies y base legal
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  Exentas de consentimiento
                </span>
                <h3 className="mt-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  Estrictamente Necesarias
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Autenticación de sesión y mitigación de ataques CSRF. Son obligatorias para el uso
                  del CRM y no pueden desactivarse.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  Consentimiento previo
                </span>
                <h3 className="mt-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  Preferencias y Ergonomía
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Persiste la preferencia de tema visual (claro/oscuro) para reducir fatiga ocular
                  en turnos de 8 horas y el estado del modo demostración.
                </p>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  Bloqueada por defecto
                </span>
                <h3 className="mt-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  Analítica de Rendimiento
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Telemetría agregada anónima de velocidad al generar cotizaciones de paquetes. Solo
                  se activa tras consentimiento explícito.
                </p>
              </div>
            </div>
          </section>

          {/* Sección 4: Cómo modificar o revocar el consentimiento */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              4. ¿Cómo cambiar o revocar tu consentimiento en cualquier momento?
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Puedes actualizar tus elecciones en cualquier momento pulsando el botón a continuación
              o a través del enlace permanente <strong>«Preferencias de cookies»</strong> visible en
              el pie de página de ViajaPro:
            </p>
            <div className="pt-2">
              <BotonAbrirPreferencias grande />
            </div>
          </section>

          {/* Sección 5: Desactivación desde el navegador */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              5. Desactivación o bloqueo directo en tu navegador
            </h2>
            <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Todos los navegadores modernos permiten gestionar las cookies instaladas. Ten en
              cuenta que si bloqueas las cookies técnicas estrictamente necesarias, no podrás
              iniciar sesión en ViajaPro CRM.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-neutral-600 dark:text-neutral-400">
              <li>
                Google Chrome: Configuración › Privacidad y seguridad › Cookies y datos de sitios.
              </li>
              <li>
                Mozilla Firefox: Ajustes › Privacidad y seguridad › Cookies y datos del sitio.
              </li>
              <li>Apple Safari: Preferencias › Privacidad › Gestionar datos del sitio web.</li>
              <li>Microsoft Edge: Configuración › Cookies y permisos del sitio.</li>
            </ul>
          </section>
        </article>
      </main>
    </div>
  );
}
