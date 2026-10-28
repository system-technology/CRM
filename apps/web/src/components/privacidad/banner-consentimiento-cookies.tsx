'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Sliders, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  obtenerConsentimientoGuardado,
  aceptarTodasLasCookies,
  aceptarSoloCookiesNecesarias,
  EVENTO_CONSENTIMIENTO_ACTUALIZADO,
  EVENTO_ABRIR_MODAL_COOKIES,
  type PreferenciasConsentimiento,
} from '../../lib/privacidad-cookies';
import { ModalPreferenciasCookies } from './modal-preferencias-cookies';

export function BannerConsentimientoCookies() {
  const [montado, setMontado] = useState<boolean>(false);
  const [mostrarBanner, setMostrarBanner] = useState<boolean>(false);
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);

  useEffect(() => {
    setMontado(true);

    const actual = obtenerConsentimientoGuardado();
    if (!actual) {
      setMostrarBanner(true);
    }

    const alActualizar = (evento: Event) => {
      const custom = evento as CustomEvent<PreferenciasConsentimiento>;
      if (custom.detail) {
        setMostrarBanner(false);
      }
    };

    const alAbrirModal = () => {
      setModalAbierto(true);
    };

    window.addEventListener(EVENTO_CONSENTIMIENTO_ACTUALIZADO, alActualizar);
    window.addEventListener(EVENTO_ABRIR_MODAL_COOKIES, alAbrirModal);

    return () => {
      window.removeEventListener(EVENTO_CONSENTIMIENTO_ACTUALIZADO, alActualizar);
      window.removeEventListener(EVENTO_ABRIR_MODAL_COOKIES, alAbrirModal);
    };
  }, []);

  if (!montado) return null;

  const manejarAceptarTodas = () => {
    aceptarTodasLasCookies();
    setMostrarBanner(false);
  };

  const manejarSoloNecesarias = () => {
    aceptarSoloCookiesNecesarias();
    setMostrarBanner(false);
  };

  return (
    <>
      {mostrarBanner && (
        <section
          role="region"
          aria-label="Consentimiento de cookies y privacidad"
          data-testid="banner-consentimiento-cookies"
          className="animate-in slide-in-from-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 duration-300 sm:p-5"
        >
          <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-neutral-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-md sm:p-5 dark:border-neutral-800/90 dark:bg-neutral-900/95">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              {/* Información y explicación */}
              <div className="flex items-start gap-3 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:ring-teal-800">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xs font-bold text-neutral-900 sm:text-sm dark:text-neutral-100">
                      Tu privacidad y seguridad en ViajaPro
                    </h2>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                      Ley 1581 / SIC
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    Utilizamos cookies técnicas estrictamente necesarias para autenticar tu cuenta
                    de asesor y garantizar la seguridad CSRF. Puedes autorizar o rechazar cookies
                    opcionales de personalización y telemetría de rendimiento.
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Link
                      href="/politica-cookies"
                      data-testid="enlace-politica-cookies"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
                    >
                      <span>Ver inventario y política de cookies</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Botones de acción accesibles (touch target >= 44px) */}
              <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
                <button
                  type="button"
                  onClick={() => setModalAbierto(true)}
                  data-testid="btn-cookies-configurar"
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Configurar</span>
                </button>
                <button
                  type="button"
                  onClick={manejarSoloNecesarias}
                  data-testid="btn-cookies-solo-necesarias"
                  className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-800 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  Solo necesarias
                </button>
                <button
                  type="button"
                  onClick={manejarAceptarTodas}
                  data-testid="btn-cookies-aceptar-todas"
                  className="flex min-h-[44px] items-center justify-center rounded-xl bg-teal-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  Aceptar todas
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Modal de preferencias granulares */}
      <ModalPreferenciasCookies
        abierto={modalAbierto}
        alCerrar={() => setModalAbierto(false)}
        alGuardar={() => {
          setMostrarBanner(false);
        }}
      />
    </>
  );
}
