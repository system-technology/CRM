'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Plane,
  Compass,
  Sparkles,
  ShieldCheck,
  MessageSquare,
} from 'lucide-react';
import * as authApi from '../../lib/auth-api';
import type { AuthApiError } from '../../lib/auth-api';
import type { SesionActual, AgenciaDeAcceso } from '@viajapro/contracts';
import { BotonTurismo } from '../comun/boton-turismo';

type PasoIngreso = 'credenciales' | 'selector-agencia' | 'codigo';

export function FormularioIngreso() {
  const router = useRouter();
  const [paso, setPaso] = useState<PasoIngreso>('credenciales');
  // Sin valores reales de relleno preestablecidos (T-033)
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [mostrarClave, setMostrarClave] = useState(false);
  const [codigoOtp, setCodigoOtp] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [sesion, setSesion] = useState<SesionActual | null>(null);

  const esReal = authApi.usaAuthReal();

  const manejarEnvioCredenciales = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);

    try {
      const resSesion = await authApi.iniciarSesionApi({
        correo: correo.trim(),
        contrasena,
      });
      setSesion(resSesion);

      // Si el usuario pertenece a más de una agencia y aún no tiene tenant activo fijado
      if (resSesion.agencias.length > 1 && !resSesion.tenantActivoId) {
        setPaso('selector-agencia');
      } else {
        // Agencia fijada o agencia única
        setExito(true);
        setTimeout(() => {
          router.push('/bandeja');
        }, 500);
      }
    } catch (err) {
      const errorObj = err as AuthApiError;
      setError(
        errorObj.message ||
          'Credenciales no reconocidas. Verifica tu correo y contraseña o contacta al administrador.',
      );
    } finally {
      setCargando(false);
    }
  };

  const seleccionarAgencia = async (agenciaId: string) => {
    setError(null);
    setCargando(true);

    try {
      const resSesion = await authApi.cambiarAgenciaActivaApi(agenciaId);
      setSesion(resSesion);
      setExito(true);
      setTimeout(() => {
        router.push('/bandeja');
      }, 500);
    } catch (err) {
      const errorObj = err as AuthApiError;
      setError(
        errorObj.message ||
          'No se pudo seleccionar la agencia. Verifica tus permisos o contacta al administrador.',
      );
    } finally {
      setCargando(false);
    }
  };

  const manejarEnvioCodigoOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigoOtp)) {
      setError('El código debe contener exactamente 6 dígitos numéricos.');
      return;
    }
    setError(
      'El servicio de código por correo transaccional se activará con la Rebanada 4 de identidad. Por favor ingresa con tu contraseña.',
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-neutral-50 font-sans lg:flex-row dark:bg-neutral-950">
      {/* 1. Panel Hero Oceánico y de Viaje (Izquierda en desktop, >= lg) */}
      <section
        className="degradado-caribe relative hidden flex-col justify-between overflow-hidden p-10 text-white select-none lg:flex lg:w-1/2 xl:w-7/12 xl:p-14"
        aria-label="Identidad turística de ViajaPro"
      >
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
              <span className="block text-[11px] font-medium text-cyan-200/80">CRM Turístico</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#C9A24B]/70 bg-black/25 px-3 py-1 text-[11px] font-semibold text-[#FDE68A] shadow-xs backdrop-blur-md">
            <Sparkles className="h-3 w-3 text-[#FACC15]" aria-hidden="true" />
            Operación Colombia
          </span>
        </div>

        {/* Centro: Titular y Promesa Central */}
        <div className="relative z-10 my-auto max-w-xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3.5 py-1 text-xs font-semibold text-cyan-200 backdrop-blur-sm">
            <Compass className="h-3.5 w-3.5 animate-spin text-cyan-400 motion-reduce:animate-none" />
            Especializado en Turismo & Excursiones
          </div>

          <h2 className="text-3xl leading-tight font-extrabold tracking-tight text-white xl:text-4xl 2xl:text-5xl">
            Convierte conversaciones en{' '}
            <span className="text-[#FACC15] drop-shadow-[0_2px_12px_rgba(250,204,21,0.35)]">
              viajes reales
            </span>
          </h2>

          <p className="mt-4 text-base leading-relaxed font-normal text-cyan-100/90 xl:text-lg">
            El CRM omnicanal para agencias de viajes. WhatsApp Cloud API nativo, cotizador express
            en COP, control de cupos y seguimiento comercial sin salir de la conversación.
          </p>

          {/* Insignias de confianza con aro dorado */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#C9A24B]/50 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>Uptime 99.9% en vivo</span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
              <MessageSquare className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
              <span>WhatsApp Cloud API</span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-white/10 px-3.5 py-2 text-xs font-medium text-white shadow-xs backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-[#FDE68A]" aria-hidden="true" />
              <span>Aislamiento RLS Multi-tenant</span>
            </div>
          </div>
        </div>

        {/* Bottom: Cita / Garantía */}
        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-cyan-200/80">
          <span>Diseñado para agencias mayoristas y receptivas en Colombia</span>
          <span className="font-semibold text-white/90">San Andrés · Cartagena · Santa Marta</span>
        </div>
      </section>

      {/* 2. Panel Derecho: Formulario de Acceso Profesional */}
      <main className="flex w-full flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Encabezado y Marca */}
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
                  CRM para Agencias de Turismo
                </p>
              </div>
            </div>

            <h2 className="mt-6 text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {paso === 'selector-agencia' ? 'Selecciona una agencia' : 'Bienvenido de nuevo'}
            </h2>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {paso === 'selector-agencia'
                ? 'Tu usuario tiene acceso a múltiples agencias. Elige con cuál deseas operar hoy:'
                : paso === 'codigo'
                  ? 'Ingresa el código temporal enviado a tu correo corporativo.'
                  : 'Ingresa tus credenciales de asesor para iniciar tu turno comercial.'}
            </p>
          </div>

          {/* Tarjeta Principal del Formulario */}
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs transition-all duration-300 sm:p-7 dark:border-neutral-800 dark:bg-neutral-900">
            {/* Indicador de modo API Real / Simulado */}
            <div
              className={`mb-5 flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${
                esReal
                  ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                  : 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {esReal ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
              </div>
              <div>
                <p className="font-bold">
                  {esReal ? 'Modo de Producción (API Real)' : 'Modo Demostración'}
                </p>
                <p className="mt-0.5 text-[11px] opacity-90">
                  {esReal
                    ? 'Conectado a la API y PostgreSQL en vivo.'
                    : 'Usa credenciales de prueba para explorar la plataforma.'}
                </p>
              </div>
            </div>

            {/* Alerta de Error Accesible */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900 shadow-2xs dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div>
                  <p className="font-bold">Error de autenticación</p>
                  <p className="mt-0.5 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Mensaje de Éxito */}
            {exito && (
              <div
                role="status"
                className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Ingreso exitoso. Redirigiendo a tu bandeja...</span>
              </div>
            )}

            {/* PASO 1: Formulario con Correo y Contraseña */}
            {paso === 'credenciales' && (
              <form
                onSubmit={(e) => void manejarEnvioCredenciales(e)}
                noValidate
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="campo-correo"
                    className="mb-1 block text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                  >
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Mail className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                    </div>
                    <input
                      id="campo-correo"
                      name="correo"
                      type="email"
                      required
                      autoComplete="email"
                      value={correo}
                      onChange={(e) => setCorreo(e.target.value)}
                      placeholder="asesor@tuagencia.com"
                      className="block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs text-neutral-900 transition-all placeholder:text-neutral-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="campo-contrasena"
                      className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                    >
                      Contraseña
                    </label>
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                    </div>
                    <input
                      id="campo-contrasena"
                      name="contrasena"
                      type={mostrarClave ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={contrasena}
                      onChange={(e) => setContrasena(e.target.value)}
                      placeholder="••••••••"
                      className="block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-10 pl-9 text-xs text-neutral-900 transition-all placeholder:text-neutral-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarClave(!mostrarClave)}
                      aria-label={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      {mostrarClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <BotonTurismo
                    type="submit"
                    variante="mar"
                    cargando={cargando}
                    textoCarga="Iniciando sesión..."
                    anchoCompleto={true}
                    iconoDerecha={<ArrowRight className="h-4 w-4" />}
                  >
                    Ingresar a ViajaPro
                  </BotonTurismo>
                </div>

                {/* Alternativa con Código de 6 dígitos */}
                <div className="mt-4 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPaso('codigo');
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-800 hover:underline dark:text-cyan-400 dark:hover:text-cyan-300"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Ingresar con código de 6 dígitos por correo</span>
                  </button>
                </div>
              </form>
            )}

            {/* PASO 2: Selector de Agencia (Multi-tenant) */}
            {paso === 'selector-agencia' && (
              <div className="space-y-3">
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Selecciona la agencia con la que vas a trabajar en esta sesión:
                </p>

                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {sesion?.agencias.map((agencia: AgenciaDeAcceso) => (
                    <button
                      key={agencia.id}
                      type="button"
                      disabled={cargando}
                      onClick={() => void seleccionarAgencia(agencia.id)}
                      className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50/40 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:bg-neutral-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-100 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                          {agencia.nombre.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                            {agencia.nombre}
                          </p>
                          <p className="text-[10px] text-neutral-500">
                            ID: {agencia.id.slice(0, 8)}...
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-neutral-400" />
                    </button>
                  ))}
                </div>

                <div className="border-t border-neutral-100 pt-3 text-center dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPaso('credenciales');
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  >
                    Volver al ingreso con contraseña
                  </button>
                </div>
              </div>
            )}

            {/* PASO 3: Código OTP */}
            {paso === 'codigo' && (
              <form onSubmit={manejarEnvioCodigoOtp} className="space-y-4">
                <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3 text-xs text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-200">
                  <span className="font-bold">Próximamente disponible:</span> Acceso con código OTP
                  temporal vía correo transaccional sin requerir contraseña fija.
                </div>

                <div>
                  <label
                    htmlFor="campo-otp"
                    className="mb-1 block text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                  >
                    Código de 6 dígitos
                  </label>
                  <input
                    id="campo-otp"
                    name="codigoOtp"
                    type="text"
                    maxLength={6}
                    value={codigoOtp}
                    onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 text-center font-mono text-base tracking-widest text-neutral-900 placeholder:text-neutral-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <BotonTurismo type="submit" variante="mar" anchoCompleto={true}>
                  Verificar código
                </BotonTurismo>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPaso('credenciales');
                    }}
                    className="inline-flex min-h-[44px] items-center justify-center text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  >
                    Volver al ingreso con contraseña
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Enlaces legales públicos (T-108) */}
          <footer
            data-testid="pie-formulario-ingreso"
            className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400"
          >
            <nav
              aria-label="Enlaces legales y de privacidad"
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
            >
              <Link
                href="/privacidad"
                data-testid="enlace-login-privacidad"
                className="inline-flex min-h-[44px] items-center text-neutral-600 hover:text-teal-700 hover:underline dark:text-neutral-400 dark:hover:text-teal-300"
              >
                Privacidad
              </Link>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <Link
                href="/terminos"
                data-testid="enlace-login-terminos"
                className="inline-flex min-h-[44px] items-center text-neutral-600 hover:text-teal-700 hover:underline dark:text-neutral-400 dark:hover:text-teal-300"
              >
                Términos
              </Link>
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
              <Link
                href="/cookies"
                data-testid="enlace-login-cookies"
                className="inline-flex min-h-[44px] items-center text-neutral-600 hover:text-teal-700 hover:underline dark:text-neutral-400 dark:hover:text-teal-300"
              >
                Cookies
              </Link>
            </nav>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
              ViajaPro CRM · Ley 1581 de 2012 y Ley 300 de Turismo (Colombia)
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
