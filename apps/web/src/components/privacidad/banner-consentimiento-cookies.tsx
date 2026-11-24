'use client';

import React, { useState, useEffect, useRef } from 'react';
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

/**
 * Variable CSS con la altura que ocupa el banner mientras está visible. Las pantallas de altura
 * completa (la bandeja) la restan de su alto para que el banner no tape su parte inferior, p. ej.
 * el compositor. Sin banner vale 0 (usan `var(--altura-banner-cookies, 0px)`).
 */
export const VARIABLE_ALTURA_BANNER_COOKIES = '--altura-banner-cookies';

export function BannerConsentimientoCookies() {
  const bannerRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    const raiz = document.documentElement;
    const banner = bannerRef.current;
    if (!mostrarBanner || !banner) {
      raiz.style.removeProperty(VARIABLE_ALTURA_BANNER_COOKIES);
      return;
    }
    const publicar = () =>
      raiz.style.setProperty(VARIABLE_ALTURA_BANNER_COOKIES, `${banner.offsetHeight}px`);
    publicar();
    // Con el texto en varias líneas (móvil) o al girar la pantalla la altura cambia.
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publicar);
    observador?.observe(banner);
    window.addEventListener('resize', publicar);
    return () => {
      observador?.disconnect();
      window.removeEventListener('resize', publicar);
      raiz.style.removeProperty(VARIABLE_ALTURA_BANNER_COOKIES);
    };
  }, [mostrarBanner, montado]);

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
          ref={bannerRef}
          role="region"
          aria-label="Consentimiento de cookies y privacidad"
          data-testid="banner-consentimiento-cookies"
          className="animate-in slide-in-from-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 duration-300 sm:p-5 print:hidden"
        >
          <div className="pointer-events-auto mx-auto max-w-4xl rounded-2xl border border-neutral-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-md sm:p-5 dark:border-neutral-800/90 dark:bg-neutral-900/95">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              {/* Información y explicación */}
              <div className="flex items-start gap-3 text-left">
                {/* Decorativo: en el móvil se oculta para devolverle 52 px de ancho al texto,
                    que es lo que lo hacía envolver en más líneas (T-628). */}
                <div className="bg-acento-50 text-acento-700 ring-acento-200 dark:bg-acento-950 dark:text-acento-300 dark:ring-acento-800 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 sm:flex">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xs font-bold text-neutral-900 sm:text-sm dark:text-neutral-100">
                      Tu privacidad y seguridad en ViajaPro
                    </h2>
                    <span className="bg-acento-50 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                      Ley 1581 / SIC
                    </span>
                  </div>
                  {/* En el móvil el texto va al grano: con el párrafo completo el aviso medía ~380 px
                      de los 844 del viewport y partía por la mitad el botón «Ingresar a ViajaPro»
                      (T-628, comprobado a 390 px contra staging). El detalle vive en la política,
                      que está a un toque, y las cookies técnicas no necesitan consentimiento. */}
                  <p className="mt-1 text-xs leading-relaxed text-neutral-600 sm:hidden dark:text-neutral-400">
                    Solo cookies técnicas para iniciar sesión. Las opcionales las decides tú.
                  </p>
                  <p className="mt-1 hidden text-xs leading-relaxed text-neutral-600 sm:block dark:text-neutral-400">
                    Utilizamos cookies técnicas estrictamente necesarias para autenticar tu cuenta
                    de asesor y garantizar la seguridad CSRF. Puedes autorizar o rechazar cookies
                    opcionales de personalización y telemetría de rendimiento.
                  </p>
                  <div className="flex items-center gap-3 sm:mt-1.5">
                    <Link
                      href="/politica-cookies"
                      data-testid="enlace-politica-cookies"
                      className="text-acento-700 dark:text-acento-400 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold hover:underline sm:text-sm"
                    >
                      <span>Ver inventario y política de cookies</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Botones de acción accesibles (touch target >= 44px).
                  En el móvil van en tres columnas y no con `flex-wrap`: envolviendo, «Aceptar todas»
                  caía a una segunda fila y sumaba otros ~56 px de alto al aviso (T-628). */}
              <div className="grid grid-cols-3 items-center gap-2 sm:flex sm:shrink-0 sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModalAbierto(true)}
                  data-testid="btn-cookies-configurar"
                  className="focus-visible:ring-acento-600 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2 py-2 text-[11px] font-semibold text-neutral-700 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none sm:px-3.5 sm:text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Sliders className="hidden h-3.5 w-3.5 sm:block" />
                  <span>Configurar</span>
                </button>
                <button
                  type="button"
                  onClick={manejarSoloNecesarias}
                  data-testid="btn-cookies-solo-necesarias"
                  className="focus-visible:ring-acento-600 flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-2 py-2 text-[11px] font-bold text-neutral-800 transition hover:bg-neutral-50 focus-visible:ring-2 focus-visible:outline-none sm:px-4 sm:text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  {/* En 390 px «Solo necesarias» parte en dos líneas dentro de su columna. */}
                  <span className="sm:hidden">Necesarias</span>
                  <span className="hidden sm:inline">Solo necesarias</span>
                </button>
                <button
                  type="button"
                  onClick={manejarAceptarTodas}
                  data-testid="btn-cookies-aceptar-todas"
                  className="boton-primario flex min-h-[44px] items-center justify-center rounded-xl px-2 py-2 text-[11px] font-bold shadow-xs transition sm:px-5 sm:text-xs"
                >
                  <span className="sm:hidden">Aceptar</span>
                  <span className="hidden sm:inline">Aceptar todas</span>
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
