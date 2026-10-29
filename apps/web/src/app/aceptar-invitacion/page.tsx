'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plane,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import {
  aceptarInvitacionApi,
  consumirTokenDeUrl,
  esFormatoTokenInvitacionValido,
  type EstadoAceptarInvitacion,
} from '../../lib/invitacion-token';

export default function AceptarInvitacionPage() {
  const [tokenEnMemoria, setTokenEnMemoria] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAceptarInvitacion>('formulario');
  const [inicializado, setInicializado] = useState(false);

  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [mensajeEstado, setMensajeEstado] = useState<string>('');
  const [queHacerEstado, setQueHacerEstado] = useState<string>('');

  useEffect(() => {
    const tokenExtraido = consumirTokenDeUrl();
    if (!tokenExtraido) {
      setEstado('token_ausente');
      setInicializado(true);
      return;
    }

    if (!esFormatoTokenInvitacionValido(tokenExtraido)) {
      setEstado('invalido_o_vencido');
      setMensajeEstado(
        'El enlace de invitación no tiene un formato válido, ya fue utilizado o ha caducado.',
      );
      setQueHacerEstado(
        'Solicita al dueño o administrador de la agencia que te envíe una nueva invitación desde Configuración → Equipo.',
      );
      setInicializado(true);
      return;
    }

    setTokenEnMemoria(tokenExtraido);
    setEstado('formulario');
    setInicializado(true);
  }, []);

  const enviarAceptacion = async () => {
    setErrorValidacion(null);

    if (!tokenEnMemoria) {
      setEstado('token_ausente');
      return;
    }

    const nombreLimpio = nombre.trim();
    if (nombreLimpio.length === 0) {
      setErrorValidacion('Ingresa tu nombre completo para identificarte en la agencia.');
      return;
    }

    if (contrasena.length < 12) {
      setErrorValidacion('La contraseña debe tener al menos 12 caracteres por seguridad.');
      return;
    }

    setEstado('enviando');

    const resultado = await aceptarInvitacionApi({
      token: tokenEnMemoria,
      nombre: nombreLimpio,
      contrasena,
    });

    if (resultado.estado === 'exito') {
      setTokenEnMemoria(null);
      setContrasena('');
      setEstado('exito');
      return;
    }

    if (resultado.estado === 'invalido_o_vencido') {
      setTokenEnMemoria(null);
      setMensajeEstado(resultado.mensaje);
      setQueHacerEstado(resultado.queHacer);
      setEstado('invalido_o_vencido');
      return;
    }

    setMensajeEstado(resultado.mensaje);
    setQueHacerEstado(resultado.queHacer);
    setEstado('error_red');
  };

  const manejarSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void enviarAceptacion();
  };

  const largoClave = contrasena.length;
  const nivelSeguridad = largoClave === 0 ? 0 : largoClave < 12 ? 1 : largoClave < 16 ? 2 : 3;

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-neutral-50 font-sans lg:flex-row dark:bg-neutral-950">
      {/* 1. Panel Hero Oceánico de Bienvenida al Equipo (Desktop >= lg) */}
      <section
        className="degradado-caribe relative hidden flex-col justify-between overflow-hidden p-10 text-white select-none lg:flex lg:w-1/2 xl:w-7/12 xl:p-14"
        aria-label="Bienvenida al equipo de la agencia en ViajaPro"
      >
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
              fill="url(#ola-inv-grad)"
              opacity="0.4"
            />
            <path
              d="M-20,400 C180,340 380,440 580,380 C780,320 880,410 980,370 L980,650 L-20,650 Z"
              fill="url(#ola-inv-grad)"
              opacity="0.6"
            />
            <defs>
              <linearGradient id="ola-inv-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0B1F3A" stopOpacity="0.2" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-md backdrop-blur-md">
              <Plane className="anim-flotar h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white">ViajaPro</span>
              <span className="block text-[11px] font-medium text-cyan-200/80">CRM Turístico</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#C9A24B]/70 bg-black/25 px-3 py-1 text-[11px] font-semibold text-[#FDE68A] shadow-xs backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-[#FACC15]" aria-hidden="true" />
            Invitación Segura
          </span>
        </div>

        <div className="relative z-10 my-auto max-w-xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3.5 py-1 text-xs font-semibold text-cyan-200 backdrop-blur-sm">
            <Compass className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
            Incorporación de Asesores y Operaciones
          </div>

          <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-white xl:text-4xl 2xl:text-5xl">
            Bienvenido a la tripulación de tu{' '}
            <span className="text-[#FACC15] drop-shadow-[0_2px_12px_rgba(250,204,21,0.35)]">
              agencia de viajes
            </span>
          </h2>

          <p className="mt-4 text-base leading-relaxed font-normal text-cyan-100/90 xl:text-lg">
            Activa tu acceso para atender viajeros en WhatsApp, armar cotizaciones en segundos y
            hacer seguimiento a cada salida con el catálogo oficial de tu agencia.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#C9A24B]/50 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FACC15]" aria-hidden="true" />
              <span>Enlace de un solo uso (72 h)</span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
              <Lock className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              <span>Token protegido fuera de logs y Referer</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-cyan-200/80">
          <span>Aislamiento multi-tenant por agencia (RLS)</span>
          <span className="font-semibold text-white/90">Colombia · Caribe · Internacional</span>
        </div>
      </section>

      {/* 2. Panel Derecho: Activación de Invitación */}
      <main className="flex w-full flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Encabezado de marca */}
          <div className="text-center sm:text-left">
            <div className="inline-flex items-center gap-2.5">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-800/40 bg-[#0B1F3A] text-white shadow-sm dark:bg-cyan-950">
                <Plane className="h-5 w-5 text-cyan-400" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
                  ViajaPro
                </h1>
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  Activación de Invitación de Equipo
                </p>
              </div>
            </div>

            <h2 className="mt-6 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Aceptar invitación a la agencia
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Configura tu perfil comercial para empezar a atender conversaciones y cotizar salidas.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs transition-all duration-300 sm:p-7 dark:border-neutral-800 dark:bg-neutral-900">
            {!inicializado ? (
              <div
                data-testid="estado-cargando-invitacion"
                className="space-y-4 py-6"
                aria-busy="true"
                aria-label="Verificando enlace de invitación"
              >
                <div className="h-4 w-2/3 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-11 w-full animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-800/70" />
              </div>
            ) : estado === 'token_ausente' ? (
              <div
                role="alert"
                data-testid="estado-token-ausente"
                className="space-y-4 text-center sm:text-left"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    Enlace de invitación incompleto
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    No encontramos el token de activación en este enlace. Es posible que se haya
                    recortado al copiarlo o que hayas recargado la página después de limpiar la
                    barra de direcciones.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <p className="font-semibold">¿Qué puedes hacer?</p>
                  <p className="mt-1 leading-relaxed">
                    Abre nuevamente el botón{' '}
                    <span className="font-semibold">«Aceptar invitación»</span> directamente desde
                    el correo que recibiste, o pide al administrador de tu agencia que te envíe una
                    nueva invitación.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/ingresar"
                    data-testid="enlace-ir-a-ingresar"
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                  >
                    <span>Ir a iniciar sesión</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : estado === 'invalido_o_vencido' ? (
              <div
                role="alert"
                data-testid="estado-invalido-o-vencido"
                className="space-y-4 text-center sm:text-left"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <ShieldAlert className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    Invitación inválida o vencida
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {mensajeEstado ||
                      'Esta invitación ya fue utilizada anteriormente, no existe o superó su vigencia de 72 horas.'}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                  <p className="font-semibold">¿Cómo resolverlo?</p>
                  <p className="mt-1 leading-relaxed">
                    {queHacerEstado ||
                      'Pide al dueño o administrador de tu agencia que genere una nueva invitación desde Configuración → Equipo.'}
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/ingresar"
                    data-testid="enlace-ir-a-ingresar"
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
                  >
                    <span>Ya tengo cuenta — Iniciar sesión</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : estado === 'exito' ? (
              <div
                role="status"
                aria-live="polite"
                data-testid="estado-exito-invitacion"
                className="space-y-4 text-center sm:text-left"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    ¡Invitación aceptada con éxito!
                  </h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    Tu membresía en la agencia ha quedado activada. Ya puedes ingresar con tu correo
                    corporativo y tu contraseña para atender conversaciones y cotizar viajes.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/ingresar"
                    data-testid="enlace-ir-a-ingresar"
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <span>Iniciar sesión ahora</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={manejarSubmit} className="space-y-4" noValidate>
                {/* Insignia de protección de fragmento */}
                <div className="flex items-start gap-2.5 rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-xs text-cyan-950 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-200">
                  <ShieldCheck
                    className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold">Enlace verificado en tu navegador</p>
                    <p className="mt-0.5 text-[11px] opacity-90">
                      El token de invitación fue retirado de la barra de direcciones para proteger
                      tu acceso.
                    </p>
                  </div>
                </div>

                {/* Estado de error de red con opción de reintentar */}
                {estado === 'error_red' && (
                  <div
                    role="alert"
                    data-testid="estado-error-red"
                    className="space-y-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <div className="flex items-start gap-2">
                      <WifiOff
                        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-bold">{mensajeEstado}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
                          {queHacerEstado}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid="btn-reintentar-invitacion"
                      onClick={() => {
                        void enviarAceptacion();
                      }}
                      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-neutral-900 dark:text-amber-200 dark:hover:bg-amber-950/60"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reintentar activación</span>
                    </button>
                  </div>
                )}

                {errorValidacion && (
                  <div
                    role="alert"
                    data-testid="alerta-validacion-invitacion"
                    className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    <span>{errorValidacion}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="nombre-asesor"
                    className="block text-xs font-bold text-neutral-800 dark:text-neutral-200"
                  >
                    Tu nombre completo
                  </label>
                  <div className="relative mt-1.5">
                    <UserCheck
                      className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400"
                      aria-hidden="true"
                    />
                    <input
                      id="nombre-asesor"
                      data-testid="input-nombre-invitacion"
                      type="text"
                      autoComplete="name"
                      required
                      maxLength={200}
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. Camila Restrepo"
                      disabled={estado === 'enviando'}
                      className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2.5 pr-3.5 pl-10 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="contrasena-asesor"
                    className="block text-xs font-bold text-neutral-800 dark:text-neutral-200"
                  >
                    Contraseña de acceso (mínimo 12 caracteres)
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound
                      className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-neutral-400"
                      aria-hidden="true"
                    />
                    <input
                      id="contrasena-asesor"
                      data-testid="input-contrasena-invitacion"
                      type={mostrarClave ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={contrasena}
                      onChange={(e) => setContrasena(e.target.value)}
                      placeholder="Mínimo 12 caracteres"
                      disabled={estado === 'enviando'}
                      className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2.5 pr-12 pl-10 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarClave((v) => !v)}
                      aria-label={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute top-1/2 right-1 flex min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                    >
                      {mostrarClave ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>

                  {/* Barra visual de fortaleza */}
                  <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
                    <span
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        nivelSeguridad >= 1
                          ? nivelSeguridad === 1
                            ? 'bg-amber-400'
                            : 'bg-emerald-500'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                    <span
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        nivelSeguridad >= 2
                          ? 'bg-emerald-500'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                    <span
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        nivelSeguridad >= 3
                          ? 'bg-emerald-600'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    Si ya perteneces a otra agencia en ViajaPro con este correo, conservaremos tu
                    contraseña actual sin modificarla.
                  </p>
                </div>

                <button
                  type="submit"
                  data-testid="btn-aceptar-invitacion"
                  disabled={estado === 'enviando'}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    {estado === 'enviando'
                      ? 'Activando tu membresía...'
                      : 'Activar mi cuenta y unirme a la agencia'}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
