'use client';

import React, { useState } from 'react';
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
  Loader2,
  Lock,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import * as authApi from '../../lib/auth-api';
import type { AuthApiError } from '../../lib/auth-api';
import type { SesionActual, AgenciaDeAcceso } from '@viajapro/contracts';

type PasoIngreso = 'credenciales' | 'selector-agencia' | 'codigo';

export function FormularioIngreso() {
  const router = useRouter();
  const [paso, setPaso] = useState<PasoIngreso>('credenciales');
  const [correo, setCorreo] = useState('asesor@viajapro.com');
  const [contrasena, setContrasena] = useState('demo123');
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
    // Rebanada 4: UI preparada sin conectar todavía
    if (!/^\d{6}$/.test(codigoOtp)) {
      setError('El código debe contener exactamente 6 dígitos numéricos.');
      return;
    }
    setError(
      'El servicio de código por correo transaccional se activará con la Rebanada 4 de identidad. Por favor ingresa con tu contraseña.',
    );
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8 dark:bg-neutral-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Encabezado y Marca */}
        <div className="text-center">
          <div className="bg-acento-600 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-md">
            <span className="text-xl font-black tracking-tight">VP</span>
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
            ViajaPro
          </h1>
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            CRM vertical y canal nativo para agencias de viajes
          </p>
        </div>

        {/* Tarjeta Principal */}
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          {/* Indicador de modo API Real / Simulado */}
          <div
            className={`mb-6 flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs leading-relaxed ${
              esReal
                ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'
            }`}
            role="status"
          >
            {esReal ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div>
              <strong className="font-bold">
                {esReal ? 'Conexión a API Real (ADR-0011):' : 'Modo Demostración Offline:'}
              </strong>{' '}
              {esReal
                ? 'Autenticación real con Better Auth y sesión en cookie HttpOnly.'
                : 'Simulación de inicio de sesión para desarrollo sin backend.'}
            </div>
          </div>

          {/* Alerta de Error Accesible */}
          {error && (
            <div
              className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="text-xs leading-relaxed">
                <strong className="block font-bold">Error de acceso</strong>
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* Alerta de Éxito */}
          {exito && (
            <div
              className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="text-xs font-semibold">
                Ingreso exitoso. Redirigiendo a la bandeja...
              </div>
            </div>
          )}

          {/* PASO 1: Formulario de Correo y Contraseña */}
          {paso === 'credenciales' && (
            <form
              onSubmit={(e) => {
                void manejarEnvioCredenciales(e);
              }}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="correo"
                  className="block text-xs font-bold tracking-wider text-neutral-700 uppercase dark:text-neutral-300"
                >
                  Correo electrónico
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="correo"
                    name="correo"
                    type="email"
                    autoComplete="email"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    disabled={cargando || exito}
                    placeholder="asesor@agencia.com"
                    className="focus:border-acento-600 focus:ring-acento-600 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-sm text-neutral-900 transition placeholder:text-neutral-400 focus:ring-1 focus:outline-hidden disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="contrasena"
                  className="block text-xs font-bold tracking-wider text-neutral-700 uppercase dark:text-neutral-300"
                >
                  Contraseña
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="contrasena"
                    name="contrasena"
                    type={mostrarClave ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={contrasena}
                    onChange={(e) => setContrasena(e.target.value)}
                    disabled={cargando || exito}
                    placeholder="••••••••"
                    className="focus:border-acento-600 focus:ring-acento-600 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pr-12 pl-10 text-sm text-neutral-900 transition placeholder:text-neutral-400 focus:ring-1 focus:outline-hidden disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave(!mostrarClave)}
                    disabled={cargando || exito}
                    aria-label={mostrarClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center text-neutral-400 hover:text-neutral-600 focus:outline-hidden dark:hover:text-neutral-200"
                  >
                    {mostrarClave ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={cargando || exito}
                className="bg-acento-600 hover:bg-acento-700 focus:ring-acento-500 mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-xs transition focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verificando credenciales...</span>
                  </>
                ) : (
                  <>
                    <span>Ingresar a ViajaPro</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              <div className="mt-4 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setPaso('codigo');
                    setError(null);
                  }}
                  disabled={cargando || exito}
                  className="text-acento-600 hover:text-acento-700 dark:text-acento-400 inline-flex min-h-[44px] items-center text-xs font-semibold"
                >
                  <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                  Ingresar con código de 6 dígitos por correo
                </button>
              </div>
            </form>
          )}

          {/* PASO 2: Selector de Agencia (cuando hay >1 agencias) */}
          {paso === 'selector-agencia' && sesion && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Selecciona una agencia
                </h2>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Tu usuario está registrado en {sesion.agencias.length} agencias. Elige con cuál
                  deseas operar:
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                {sesion.agencias.map((agencia: AgenciaDeAcceso) => (
                  <button
                    key={agencia.id}
                    type="button"
                    onClick={() => {
                      void seleccionarAgencia(agencia.id);
                    }}
                    disabled={cargando || exito}
                    className="focus:ring-acento-500 group flex min-h-[48px] w-full items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50/80 p-3.5 text-left transition hover:border-neutral-300 hover:bg-neutral-100 focus:ring-2 focus:outline-hidden disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800/60 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-acento-100 text-acento-700 dark:bg-acento-950/50 dark:text-acento-300 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                          {agencia.nombre}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">
                          slug: {agencia.slug}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300" />
                  </button>
                ))}
              </div>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setPaso('credenciales');
                    setError(null);
                  }}
                  disabled={cargando || exito}
                  className="inline-flex min-h-[44px] items-center text-xs font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Volver al ingreso con otra cuenta
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Código de 6 dígitos por correo (Rebanada 4 preparada) */}
          {paso === 'codigo' && (
            <form onSubmit={manejarEnvioCodigoOtp} className="space-y-4">
              <div
                className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
                role="status"
              >
                <div className="font-bold">Próximamente (Rebanada 4):</div>
                <div className="mt-0.5 leading-relaxed">
                  El ingreso sin contraseña vía código de 6 dígitos se conectará con el servicio de
                  correo transaccional en la siguiente fase.
                </div>
              </div>

              <div>
                <label
                  htmlFor="otp-correo"
                  className="block text-xs font-bold tracking-wider text-neutral-700 uppercase dark:text-neutral-300"
                >
                  Correo electrónico
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="otp-correo"
                    type="email"
                    required
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="asesor@agencia.com"
                    className="focus:border-acento-600 focus:ring-acento-600 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 text-sm text-neutral-900 transition placeholder:text-neutral-400 focus:ring-1 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="codigo-otp"
                  className="block text-xs font-bold tracking-wider text-neutral-700 uppercase dark:text-neutral-300"
                >
                  Código de 6 dígitos
                </label>
                <div className="relative mt-1.5">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <input
                    id="codigo-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    value={codigoOtp}
                    onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="focus:border-acento-600 focus:ring-acento-600 block min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white pr-3 pl-10 font-mono text-base tracking-widest text-neutral-900 transition placeholder:text-neutral-400 focus:ring-1 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="bg-acento-600 hover:bg-acento-700 focus:ring-acento-500 mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-xs transition focus:ring-2 focus:ring-offset-2 focus:outline-hidden"
              >
                <span>Validar código</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="mt-4 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setPaso('credenciales');
                    setError(null);
                  }}
                  className="text-acento-600 hover:text-acento-700 dark:text-acento-400 inline-flex min-h-[44px] items-center text-xs font-semibold"
                >
                  Volver al ingreso con contraseña
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
