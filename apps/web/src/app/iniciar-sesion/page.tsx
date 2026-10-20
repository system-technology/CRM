'use client';

/**
 * Pantalla de Inicio de Sesión — Solo Maqueta (0c.23).
 *
 * Conforme a COLA.md:
 * - La API de autenticación no existe (llega con el ADR-0011).
 * - Esquema local mínimo: // TODO: sustituir por el contrato de identity cuando exista
 * - Detrás del interruptor NEXT_PUBLIC_AUTH_MAQUETA: apagado por defecto.
 *   Apagado = redirige automáticamente a /bandeja.
 * - Sin guardar sesión real ni tokens.
 * - Touch targets >= 44 px, responsive a 375 px, accesible con teclado.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  estaAuthMaquetaHabilitada,
  validarCredencialesLocales,
  simularInicioSesion,
  type IniciarSesionLocal,
} from '../../lib/auth-maqueta-logica';

export default function IniciarSesionPage() {
  const router = useRouter();
  const habilitada = estaAuthMaquetaHabilitada(process.env.NEXT_PUBLIC_AUTH_MAQUETA);

  // Redirección si la maqueta está apagada (comportamiento por defecto)
  useEffect(() => {
    if (!habilitada) {
      router.replace('/bandeja');
    }
  }, [habilitada, router]);

  const [formulario, setFormulario] = useState<IniciarSesionLocal>({
    correo: 'asesor@viajapro.com',
    contrasena: 'demo123',
  });
  const [mostrarContrasena, setMostrarContrasena] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});
  const [exito, setExito] = useState(false);

  // Si la maqueta está apagada, no renderizamos el formulario mientras se redirige
  if (!habilitada) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
        <div className="flex items-center gap-3 text-neutral-500">
          <Loader2 className="text-acento-600 h-5 w-5 animate-spin" />
          <span className="text-sm">Redirigiendo a la bandeja...</span>
        </div>
      </div>
    );
  }

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorGlobal(null);
    setErroresCampo({});

    // 1. Validación de esquema local mínimo
    const validacion = validarCredencialesLocales(formulario);
    if (!validacion.valido) {
      if (validacion.errores) setErroresCampo(validacion.errores);
      return;
    }

    // 2. Simulación de inicio de sesión
    setCargando(true);
    try {
      const resultado = await simularInicioSesion(formulario, 800);
      if (!resultado.exito) {
        setErrorGlobal(
          resultado.mensaje ||
            'Credenciales no reconocidas. Verifica tu correo y contraseña o contacta al administrador de la agencia.',
        );
      } else {
        setExito(true);
        setTimeout(() => {
          router.push('/bandeja');
        }, 600);
      }
    } catch {
      setErrorGlobal('Ocurrió un error inesperado al procesar la solicitud. Intenta nuevamente.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-neutral-50 px-4 py-8 sm:px-6 lg:px-8 dark:bg-neutral-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Marca y Encabezado */}
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

        {/* Tarjeta de la Maqueta */}
        <div className="mt-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          {/* Aviso de Maqueta */}
          <div
            className="mb-6 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
            role="status"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-xs leading-relaxed">
              <strong className="font-bold">Maqueta de interfaz (0c.23):</strong> La API de
              autenticación real llegará con el ADR-0011. No se almacenan tokens ni credenciales
              reales.
            </div>
          </div>

          {/* Alerta de Error Global */}
          {errorGlobal && (
            <div
              className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="text-xs leading-relaxed">
                <strong className="block font-bold">Error de acceso</strong>
                <span>{errorGlobal}</span>
              </div>
            </div>
          )}

          {/* Alerta de Éxito Simulado */}
          {exito && (
            <div
              className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-600" />
              <div className="text-xs font-semibold">
                Credenciales validadas. Entrando a la plataforma...
              </div>
            </div>
          )}

          {/* Formulario */}
          <form
            onSubmit={(e) => {
              void manejarEnvio(e);
            }}
            className="space-y-4"
            noValidate
          >
            {/* Campo: Correo */}
            <div>
              <label
                htmlFor="correo"
                className="block text-xs font-bold text-neutral-700 dark:text-neutral-300"
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
                  disabled={cargando || exito}
                  value={formulario.correo}
                  onChange={(e) => {
                    setFormulario((prev) => ({ ...prev, correo: e.target.value }));
                    if (erroresCampo['correo']) {
                      setErroresCampo((prev) => {
                        const copia = { ...prev };
                        delete copia['correo'];
                        return copia;
                      });
                    }
                  }}
                  placeholder="asesor@tuagencia.com"
                  className={`focus:ring-acento-500 block min-h-[44px] w-full rounded-xl border bg-white py-2.5 pr-3.5 pl-10 text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:outline-none dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500 ${
                    erroresCampo['correo']
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                  aria-invalid={!!erroresCampo['correo']}
                  aria-describedby={erroresCampo['correo'] ? 'correo-error' : undefined}
                />
              </div>
              {erroresCampo['correo'] && (
                <p id="correo-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {erroresCampo['correo']}
                </p>
              )}
            </div>

            {/* Campo: Contraseña */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="contrasena"
                  className="block text-xs font-bold text-neutral-700 dark:text-neutral-300"
                >
                  Contraseña
                </label>
              </div>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-neutral-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="contrasena"
                  name="contrasena"
                  type={mostrarContrasena ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  disabled={cargando || exito}
                  value={formulario.contrasena}
                  onChange={(e) => {
                    setFormulario((prev) => ({ ...prev, contrasena: e.target.value }));
                    if (erroresCampo['contrasena']) {
                      setErroresCampo((prev) => {
                        const copia = { ...prev };
                        delete copia['contrasena'];
                        return copia;
                      });
                    }
                  }}
                  placeholder="••••••••"
                  className={`focus:ring-acento-500 block min-h-[44px] w-full rounded-xl border bg-white py-2.5 pr-11 pl-10 text-xs text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:outline-none dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500 ${
                    erroresCampo['contrasena']
                      ? 'border-red-500 focus:ring-red-500'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                  aria-invalid={!!erroresCampo['contrasena']}
                  aria-describedby={erroresCampo['contrasena'] ? 'contrasena-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setMostrarContrasena((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex min-h-[44px] min-w-[44px] items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  aria-label={mostrarContrasena ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {mostrarContrasena ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {erroresCampo['contrasena'] && (
                <p id="contrasena-error" className="mt-1.5 text-xs font-medium text-red-600">
                  {erroresCampo['contrasena']}
                </p>
              )}
            </div>

            {/* Botón de Envío */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={cargando || exito}
                className="bg-acento-600 hover:bg-acento-700 focus:ring-acento-500 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-xs font-bold text-white shadow-xs transition-colors focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:opacity-60"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verificando credenciales...</span>
                  </>
                ) : (
                  <>
                    <span>Iniciar sesión</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Ayuda de la maqueta para pruebas */}
          <div className="mt-6 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
            <p className="text-[11px] text-neutral-400">
              Prueba: usa cualquier contraseña &ge; 6 caracteres. Para probar error, usa el correo{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                error@demo.com
              </code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
