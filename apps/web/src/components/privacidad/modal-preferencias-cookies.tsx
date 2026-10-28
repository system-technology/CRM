'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Sliders, Check, X, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useFocoModal } from '../../lib/use-foco-modal';
import {
  obtenerConsentimientoGuardado,
  guardarConsentimiento,
  aceptarTodasLasCookies,
  aceptarSoloCookiesNecesarias,
  type PreferenciasConsentimiento,
} from '../../lib/privacidad-cookies';

interface ModalPreferenciasCookiesProps {
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alGuardar?: (preferencias: PreferenciasConsentimiento) => void;
}

export function ModalPreferenciasCookies({
  abierto,
  alCerrar,
  alGuardar,
}: ModalPreferenciasCookiesProps) {
  const [preferencias, setPreferencias] = useState<boolean>(false);
  const [analitica, setAnalitica] = useState<boolean>(false);
  const [confirmacionVisible, setConfirmacionVisible] = useState<boolean>(false);

  // Cargar estado inicial desde almacenamiento guardado
  useEffect(() => {
    if (abierto) {
      const actual = obtenerConsentimientoGuardado();
      setPreferencias(actual ? actual.preferencias : false);
      setAnalitica(actual ? actual.analitica : false);
      setConfirmacionVisible(false);
    }
  }, [abierto]);

  const modalRef = useFocoModal({ abierto, alCerrar });

  if (!abierto) return null;

  const manejarGuardarPersonalizado = () => {
    const res = guardarConsentimiento({
      preferencias,
      analitica,
      decision: 'PERSONALIZADO',
    });
    setConfirmacionVisible(true);
    if (alGuardar) alGuardar(res);
    setTimeout(() => {
      alCerrar();
    }, 300);
  };

  const manejarAceptarTodas = () => {
    const res = aceptarTodasLasCookies();
    setPreferencias(true);
    setAnalitica(true);
    setConfirmacionVisible(true);
    if (alGuardar) alGuardar(res);
    setTimeout(() => {
      alCerrar();
    }, 300);
  };

  const manejarSoloNecesarias = () => {
    const res = aceptarSoloCookiesNecesarias();
    setPreferencias(false);
    setAnalitica(false);
    setConfirmacionVisible(true);
    if (alGuardar) alGuardar(res);
    setTimeout(() => {
      alCerrar();
    }, 300);
  };

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-cookies"
    >
      <div
        ref={modalRef}
        data-testid="modal-preferencias-cookies"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between border-b border-neutral-100 p-5 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-800">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="titulo-modal-cookies"
                  className="text-base font-bold text-neutral-900 dark:text-neutral-100"
                >
                  Preferencias de Privacidad y Cookies
                </h2>
                <span className="hidden rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800 sm:inline-flex dark:bg-teal-950 dark:text-teal-300">
                  Ley 1581 / SIC
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Personaliza qué tecnologías de almacenamiento autorizas en tu navegador para
                ViajaPro.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            data-testid="btn-cerrar-modal-cookies"
            aria-label="Cerrar modal de preferencias"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido con categorías */}
        <div className="space-y-4 overflow-y-auto p-5 text-left">
          {/* Banner de confirmación rápida */}
          {confirmacionVisible && (
            <div
              data-testid="alerta-preferencias-guardadas"
              className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-800"
            >
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Tus preferencias de cookies han sido guardadas y aplicadas.</span>
            </div>
          )}

          {/* Categoría 1: Estrictamente Necesarias */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Cookies Estrictamente Necesarias
                </h3>
              </div>
              <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                Siempre activas
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Imprescindibles para autenticar tu sesión de asesor, garantizar el aislamiento de
              datos entre agencias (R1, R2) y proteger contra ataques CSRF. No almacenan información
              personal identificable no autorizada.
            </p>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-500">
              Incluye:{' '}
              <code className="text-neutral-700 dark:text-neutral-300">viajapro.session_token</code>{' '}
              (HttpOnly) y{' '}
              <code className="text-neutral-700 dark:text-neutral-300">viajapro.csrf_token</code>.
            </p>
          </div>

          {/* Categoría 2: Preferencias y Ergonomía */}
          <div className="rounded-xl border border-neutral-200 p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Preferencias y Ergonomía
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Personalización visual y comodidad en el trabajo diario.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferencias}
                aria-label="Permitir cookies de preferencias"
                data-testid="switch-cookies-preferencias"
                onClick={() => setPreferencias((prev) => !prev)}
                className={
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ' +
                  (preferencias ? 'bg-teal-600' : 'bg-neutral-300 dark:bg-neutral-700')
                }
              >
                <span
                  className={
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ' +
                    (preferencias ? 'translate-x-5' : 'translate-x-0')
                  }
                />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Permite que ViajaPro recuerde tu modo oscuro/claro preferido para turnos prolongados y
              el estado del modo demostración de paquetes turísticos.
            </p>
          </div>

          {/* Categoría 3: Analítica y Rendimiento */}
          <div className="rounded-xl border border-neutral-200 p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Analítica y Rendimiento Operacional
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Métricas anónimas para acelerar el cotizador y la búsqueda de excursiones.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analitica}
                aria-label="Permitir cookies de analítica"
                data-testid="switch-cookies-analitica"
                onClick={() => setAnalitica((prev) => !prev)}
                className={
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ' +
                  (analitica ? 'bg-teal-600' : 'bg-neutral-300 dark:bg-neutral-700')
                }
              >
                <span
                  className={
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ' +
                    (analitica ? 'translate-x-5' : 'translate-x-0')
                  }
                />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
              Mide la latencia de respuesta al cotizar paquetes. Jamás captura números telefónicos,
              documentos de identidad ni conversaciones de WhatsApp de tus clientes.
            </p>
          </div>

          {/* Enlace a Política Completa */}
          <div className="pt-1">
            <Link
              href="/politica-cookies"
              onClick={alCerrar}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <span>Consultar inventario técnico y política completa de cookies</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Acciones del pie del modal */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          <button
            type="button"
            onClick={manejarSoloNecesarias}
            data-testid="btn-modal-solo-necesarias"
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Solo necesarias
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={manejarGuardarPersonalizado}
              data-testid="btn-guardar-preferencias-cookies"
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-teal-600 bg-teal-50 px-4 py-2 text-xs font-bold text-teal-800 transition hover:bg-teal-100 focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-teal-700 dark:bg-teal-950/60 dark:text-teal-200 dark:hover:bg-teal-900/60"
            >
              Guardar preferencias
            </button>
            <button
              type="button"
              onClick={manejarAceptarTodas}
              data-testid="btn-modal-aceptar-todas"
              className="flex min-h-[44px] items-center justify-center rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              Aceptar todas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
