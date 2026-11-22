'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Compass, MessageSquare, Plane, ShieldCheck, Sparkles } from 'lucide-react';
import {
  PANEL_INGRESO_POR_OMISION,
  destinosDelPie,
  type ConfiguracionPanelIngreso,
} from '../../lib/panel-ingreso';

/** Cada cuánto cambia la foto. */
const MS_ENTRE_FOTOS = 7000;
/** Espera tras pintar la primera foto antes de pedir las demás: la primera no compite con ellas. */
const MS_ANTES_DE_PEDIR_EL_RESTO = 1200;
/** Mismo punto del CSS (`lg`) en que el panel deja de estar oculto. */
const CONSULTA_ESCRITORIO = '(min-width: 1024px)';
/** GIF transparente de 1×1: lo que carga el `<img>` cuando ninguna `<source>` aplica (móvil). */
const PIXEL_VACIO =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

interface Props {
  /** Contenido del panel. Sin él, el paquete estándar de ViajaPro. */
  configuracion?: ConfiguracionPanelIngreso;
}

/**
 * Panel de bienvenida del ingreso (solo escritorio). Fotografía + velo + identidad de marca.
 *
 * Por qué cabe aquí una foto cuando `diseno-web` las reserva al viajero: el ingreso no es la
 * herramienta de trabajo sino el umbral, lo único que ve alguien antes de entrar, y desaparece en
 * cuanto hay sesión. La bandeja, el pipeline y las fichas siguen sin fotos.
 */
export function PanelIngreso({ configuracion = PANEL_INGRESO_POR_OMISION }: Props) {
  const { fotos } = configuracion;
  const [activa, setActiva] = useState(0);
  const [pedirResto, setPedirResto] = useState(false);
  const [cargadas, setCargadas] = useState<boolean[]>(() => fotos.map((_, i) => i === 0));
  const primera = useRef<HTMLImageElement>(null);

  const marcarCargada = (indice: number) =>
    setCargadas((previas) =>
      previas[indice] ? previas : previas.map((v, i) => v || i === indice),
    );

  // Las demás fotos se piden cuando la primera ya se pintó (o tras una espera corta si ya estaba).
  useEffect(() => {
    if (fotos.length < 2 || !window.matchMedia(CONSULTA_ESCRITORIO).matches) return;
    const imagen = primera.current;
    let temporizador: number | undefined;
    const programar = () => {
      temporizador = window.setTimeout(() => setPedirResto(true), MS_ANTES_DE_PEDIR_EL_RESTO);
    };
    if (!imagen || imagen.complete) programar();
    else imagen.addEventListener('load', programar, { once: true });
    return () => {
      window.clearTimeout(temporizador);
      imagen?.removeEventListener('load', programar);
    };
  }, [fotos.length]);

  // Rotación: solo en escritorio, nunca con movimiento reducido, y solo hacia una foto ya cargada.
  useEffect(() => {
    if (!pedirResto || fotos.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const intervalo = window.setInterval(() => {
      setActiva((actual) => {
        const siguiente = (actual + 1) % fotos.length;
        return cargadas[siguiente] ? siguiente : actual;
      });
    }, MS_ENTRE_FOTOS);
    return () => window.clearInterval(intervalo);
  }, [pedirResto, fotos.length, cargadas]);

  const destinos = destinosDelPie(configuracion);
  const destinoActivo = fotos[activa]?.destino;

  return (
    <section
      className="degradado-caribe relative hidden flex-col justify-between overflow-hidden p-10 text-white select-none lg:flex lg:w-1/2 xl:w-7/12 xl:p-14"
      aria-label="Identidad turística de ViajaPro"
    >
      {/* Fotografía: se apilan y se funden entre sí. Debajo queda el degradado de marca. */}
      {fotos.length > 0 && (
        <div className="pointer-events-none absolute inset-0" data-testid="fotos-del-panel">
          {fotos.map((foto, indice) => {
            if (indice > 0 && !pedirResto) return null;
            const visible = indice === activa && (indice === 0 || cargadas[indice]);
            return (
              <picture key={foto.avif}>
                <source media={CONSULTA_ESCRITORIO} type="image/avif" srcSet={foto.avif} />
                <source media={CONSULTA_ESCRITORIO} type="image/webp" srcSet={foto.webp} />
                <img
                  ref={indice === 0 ? primera : undefined}
                  src={PIXEL_VACIO}
                  alt={visible ? foto.alt : ''}
                  aria-hidden={visible ? undefined : true}
                  width={foto.ancho}
                  height={foto.alto}
                  // La primera es la imagen más grande de la pantalla: prioridad alta. Las otras
                  // están "sobre el pliegue" pero invisibles: prioridad baja.
                  {...(indice === 0
                    ? { fetchPriority: 'high' as const }
                    : { fetchPriority: 'low' as const })}
                  decoding="async"
                  onLoad={() => marcarCargada(indice)}
                  style={foto.posicion ? { objectPosition: foto.posicion } : undefined}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out motion-reduce:transition-none ${
                    visible ? 'opacity-100' : 'opacity-0'
                  }`}
                />
              </picture>
            );
          })}
        </div>
      )}

      {/* Velo: es lo que garantiza que el texto se lea con cualquier foto. Ver `.velo-panel-ingreso`. */}
      <div className="velo-panel-ingreso pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Decoración Náutica y Olas Marinas SVG */}
      <div className="pointer-events-none absolute inset-0 opacity-20">
        <svg
          className="anim-olas h-full w-full object-cover"
          viewBox="0 0 800 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M-50,320 C150,260 300,380 500,310 C700,240 850,340 950,290 L950,650 L-50,650 Z"
            fill="url(#ola-grad)"
            opacity="0.4"
          />
          <path
            d="M-20,400 C180,340 380,440 580,380 C780,320 880,410 980,370 L980,650 L-20,650 Z"
            fill="url(#ola-grad)"
            opacity="0.6"
          />
          <defs>
            <linearGradient id="ola-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#0B1F3A" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Top: Logo y Versión */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-md backdrop-blur-md">
            <Plane className="anim-flotar h-6 w-6 text-white" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white">ViajaPro</span>
            <span className="block text-[11px] font-medium text-cyan-100">CRM Turístico</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#C9A24B]/70 bg-black/25 px-3 py-1 text-[11px] font-semibold text-[#FDE68A] shadow-xs backdrop-blur-md">
          <Sparkles className="h-3 w-3 text-[#FACC15]" aria-hidden="true" />
          {configuracion.insignia}
        </span>
      </div>

      {/* Centro: Titular y Promesa Central */}
      <div className="relative z-10 my-auto max-w-xl py-12">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3.5 py-1 text-xs font-semibold text-cyan-200 backdrop-blur-sm">
          <Compass
            className="h-3.5 w-3.5 animate-spin text-cyan-400 motion-reduce:animate-none"
            aria-hidden="true"
          />
          {configuracion.etiqueta}
        </div>

        <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-white xl:text-4xl 2xl:text-5xl">
          {configuracion.titular.inicio}{' '}
          <span className="text-[#FACC15] drop-shadow-[0_2px_12px_rgba(250,204,21,0.35)]">
            {configuracion.titular.destacado}
          </span>
        </h2>

        <p className="mt-4 text-base leading-relaxed font-normal text-cyan-50 xl:text-lg">
          {configuracion.subtitulo}
        </p>

        {/* Insignias de confianza con aro dorado */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            <span>WhatsApp Cloud API</span>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
            <ShieldCheck className="h-3.5 w-3.5 text-[#FDE68A]" aria-hidden="true" />
            <span>Datos de tu agencia, separados de las demás</span>
          </div>
        </div>
      </div>

      {/* Bottom: pie. Los destinos salen de la misma estructura que las fotos; el de la foto visible se resalta. */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-white/15 pt-4 text-xs text-cyan-100">
        <span>{configuracion.pie}</span>
        <span className="font-semibold text-white/90">
          {destinos.map((destino, indice) => (
            <React.Fragment key={destino}>
              {indice > 0 && ' · '}
              <span
                className={
                  destino === destinoActivo ? 'text-[#FDE68A] transition-colors' : undefined
                }
              >
                {destino}
              </span>
            </React.Fragment>
          ))}
        </span>
      </div>
    </section>
  );
}
