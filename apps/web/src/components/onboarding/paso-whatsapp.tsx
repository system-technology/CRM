'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';
import { type DatosWhatsAppOnboarding, validarPasoWhatsApp } from '../../lib/onboarding-logica';

export interface PasoWhatsAppProps {
  datos: DatosWhatsAppOnboarding;
  alGuardar: (datos: DatosWhatsAppOnboarding) => void;
  alOmitir: () => void;
}

export function PasoWhatsApp({ datos, alGuardar, alOmitir }: PasoWhatsAppProps) {
  const [whatsapp, setWhatsapp] = useState<DatosWhatsAppOnboarding>(datos);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  const [copiadoWebhook, setCopiadoWebhook] = useState(false);

  const URL_WEBHOOK_OFICIAL = 'https://api.viajapro.com/v1/inbox/webhook/meta';

  const handleCopiarWebhook = () => {
    void navigator.clipboard?.writeText(URL_WEBHOOK_OFICIAL);
    setCopiadoWebhook(true);
    setTimeout(() => setCopiadoWebhook(false), 2500);
  };

  const handleToggleChecklist = (clave: keyof DatosWhatsAppOnboarding['checklist']) => {
    setWhatsapp((prev) => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [clave]: !prev.checklist[clave],
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validacion = validarPasoWhatsApp(whatsapp);
    if (!validacion.valido) {
      setErrorValidacion(validacion.error ?? 'Error en la configuración');
      return;
    }
    setErrorValidacion(null);
    alGuardar(whatsapp);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="paso-whatsapp-form" className="space-y-6">
      {/* Aviso de Regla R6: Cero Secretos en Frontend */}
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Lock className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <h4 className="font-bold">Regla R6: Máxima Seguridad y Privacidad Oficial</h4>
          <p className="mt-0.5 leading-relaxed">
            Nunca te pediremos tokens de acceso permanente ni contraseñas en formularios de
            pantalla. Las credenciales de Meta Cloud API se configuran cifradas en el backend con
            AES-256-GCM. Aquí solo indicas el número y tus identificadores públicos.
          </p>
        </div>
      </div>

      {errorValidacion && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorValidacion}</span>
        </div>
      )}

      {/* Modo de Conexión: Simulador vs Oficial */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div
          onClick={() => setWhatsapp({ ...whatsapp, modo: 'simulador' })}
          className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all ${
            whatsapp.modo === 'simulador'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-950/30 dark:ring-emerald-400'
              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                <Smartphone className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                Listo para probar
              </span>
            </div>
            <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
              Modo Simulador de WhatsApp
            </h4>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Prueba la bandeja de entrada, cotizaciones y respuestas rápidas inmediatamente con
              mensajes de simulación.
            </p>
          </div>
          <span className="mt-3 block text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
            Recomendado si aún tramitas la verificación con Meta.
          </span>
        </div>

        <div
          onClick={() => setWhatsapp({ ...whatsapp, modo: 'meta_cloud_oficial' })}
          className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all ${
            whatsapp.modo === 'meta_cloud_oficial'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-950/30 dark:ring-emerald-400'
              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                Oficial Meta
              </span>
            </div>
            <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
              Meta Cloud API Oficial (WABA)
            </h4>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Conexión directa a los servidores de WhatsApp Business sin apps no oficiales ni riesgo
              de baneo.
            </p>
          </div>
          <span className="mt-3 block text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
            Requiere verificación de empresa en Meta Business Suite.
          </span>
        </div>
      </div>

      {/* Requisitos y Checklist de Preparación */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
          Lista de Preparación para WhatsApp Cloud API
        </h3>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Marca los elementos que ya tienes listos para tu agencia turística:
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40">
            <input
              type="checkbox"
              checked={whatsapp.checklist.numeroDedicado}
              onChange={() => handleToggleChecklist('numeroDedicado')}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 dark:border-neutral-700"
            />
            <div>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">
                1. Línea telefónica exclusiva y limpia
              </span>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Un número móvil o fijo que no tenga una cuenta activa en la app estándar de WhatsApp
                o WhatsApp Business móvil.
              </p>
            </div>
          </label>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40">
            <input
              type="checkbox"
              checked={whatsapp.checklist.accesoMetaBusiness}
              onChange={() => handleToggleChecklist('accesoMetaBusiness')}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 dark:border-neutral-700"
            />
            <div>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">
                2. Cuenta en Meta Business Suite con RUT / NIT
              </span>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                La empresa debe estar registrada en el Administrador Comercial de Meta con
                documentación legal (RUT en Colombia).
              </p>
            </div>
          </label>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/60 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40">
            <input
              type="checkbox"
              checked={whatsapp.checklist.nombreAprobado}
              onChange={() => handleToggleChecklist('nombreAprobado')}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 dark:border-neutral-700"
            />
            <div>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">
                3. Nombre visible para WhatsApp (Display Name)
              </span>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                El nombre de la agencia que verán tus clientes debe guardar relación directa con la
                razón social o marca registrada.
              </p>
            </div>
          </label>
        </div>

        {/* URL del Webhook oficial para copiar */}
        <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            URL de Webhook oficial para Meta Developers:
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={URL_WEBHOOK_OFICIAL}
              className="min-h-[44px] flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            />
            <button
              type="button"
              onClick={handleCopiarWebhook}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            >
              {copiadoWebhook ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-neutral-500" />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Barra de Acciones del Paso */}
      <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-neutral-200 pt-5 sm:flex-row dark:border-neutral-800">
        <button
          type="button"
          onClick={alOmitir}
          data-testid="btn-omitir-paso-whatsapp"
          className="min-h-[44px] w-full rounded-xl px-5 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 sm:w-auto dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          Omitir y finalizar
        </button>

        <button
          type="submit"
          data-testid="btn-guardar-paso-whatsapp"
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-700 active:scale-98 sm:w-auto dark:bg-emerald-500 dark:hover:bg-emerald-600"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Finalizar y Comenzar a Vender</span>
        </button>
      </div>
    </form>
  );
}
