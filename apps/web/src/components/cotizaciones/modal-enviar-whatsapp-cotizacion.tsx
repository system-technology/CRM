'use client';

import React, { useState, useMemo } from 'react';
import { MessageSquare, Copy, Check, ExternalLink, Info, X, User, Phone } from 'lucide-react';
import type { CotizacionGuardada, ContactoDeLista } from '@viajapro/contracts';
import {
  generarMensajeWhatsAppCotizacion,
  generarEnlaceWhatsApp,
  obtenerUltimaVersion,
} from '../../lib/cotizaciones-logica';
import { formatearDinero } from '../../lib/formato';

export interface ModalEnviarWhatsAppCotizacionProps {
  cotizacion: CotizacionGuardada;
  contacto?: ContactoDeLista | null | undefined;
  versionInicial?: number | undefined;
  abierto: boolean;
  alCerrar: () => void;
}

/**
 * «Abrir en la app de WhatsApp» (T-347). Esta salida va FUERA del canal de la agencia: abre
 * wa.me con el texto, no deja rastro en el chat ni cambia el estado de la cotización. El estado
 * ENVIADA solo lo pone el envío por el canal («Enviar en esta conversación»).
 */

export function ModalEnviarWhatsAppCotizacion({
  cotizacion,
  contacto,
  versionInicial,
  abierto,
  alCerrar,
}: ModalEnviarWhatsAppCotizacionProps) {
  const ultima = obtenerUltimaVersion(cotizacion.versiones);
  const [versionSeleccionada, setVersionSeleccionada] = useState<number>(
    versionInicial ?? ultima?.numero ?? 1,
  );
  const [telefono, setTelefono] = useState<string>(contacto?.telefono ?? '');
  const [copiado, setCopiado] = useState(false);

  const versionActual = useMemo(() => {
    return (
      cotizacion.versiones.find((v) => v.numero === versionSeleccionada) ??
      ultima ??
      cotizacion.versiones[0]!
    );
  }, [cotizacion.versiones, versionSeleccionada, ultima]);

  const mensajeWhatsApp = useMemo(() => {
    return generarMensajeWhatsAppCotizacion(cotizacion, versionActual, {
      contactoNombre: contacto?.nombre ?? undefined,
    });
  }, [cotizacion, versionActual, contacto?.nombre]);

  if (!abierto) return null;

  const handleCopiarMensaje = () => {
    void navigator.clipboard?.writeText(mensajeWhatsApp);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const telefonoLimpio = telefono.trim();
  const telefonoValido = telefonoLimpio.replace(/\D/g, '').length >= 8;

  // Sin número no se inventa uno: el botón queda deshabilitado y el campo explica por qué.
  const handleAbrirWhatsApp = () => {
    if (!telefonoValido) return;
    const enlace = generarEnlaceWhatsApp(telefonoLimpio, mensajeWhatsApp);
    window.open(enlace, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-whatsapp"
      data-testid="modal-enviar-whatsapp-cotizacion"
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="titulo-modal-whatsapp"
                  className="text-base font-bold text-neutral-900 dark:text-white"
                >
                  Abrir en la app de WhatsApp
                </h2>
              </div>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Propuesta comercial sin neto ni margen. Sale por tu WhatsApp, fuera del canal de la
                agencia.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            data-testid="btn-cerrar-modal-whatsapp"
            aria-label="Cerrar modal"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-sm">
          {/* 1. Selector de Versión si hay más de una */}
          {cotizacion.versiones.length > 1 && (
            <div>
              <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                Selecciona la versión a enviar:
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {cotizacion.versiones.map((v) => {
                  const activa = v.numero === versionActual.numero;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVersionSeleccionada(v.numero)}
                      className={`flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                        activa
                          ? 'bg-neutral-900 text-white shadow-xs dark:bg-white dark:text-neutral-900'
                          : 'border border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                    >
                      <span>Versión {v.numero}</span>
                      <span className="font-mono opacity-80">{formatearDinero(v.venta)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Destinatario y Teléfono */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500">
                <User className="h-3.5 w-3.5 text-neutral-400" />
                Viajero Destinatario
              </span>
              <p className="mt-1 font-bold text-neutral-900 dark:text-white">
                {contacto?.nombre || 'Contacto no registrado'}
              </p>
              <span className="text-sm text-neutral-400">
                {contacto?.correo || 'Sin correo asociado'}
              </span>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <label
                htmlFor="input-telefono-whatsapp"
                className="flex items-center gap-1.5 text-sm font-semibold text-neutral-500"
              >
                <Phone className="h-3.5 w-3.5 text-neutral-400" />
                Número de WhatsApp (E.164)
              </label>
              <input
                id="input-telefono-whatsapp"
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+57 300 123 4567"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 font-mono text-sm text-neutral-900 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              {!telefonoValido && (
                <p role="status" className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                  Escribe el número de WhatsApp para abrir la app.
                </p>
              )}
            </div>
          </div>

          {/* 3. Vista Previa del Mensaje Oficial */}
          <div>
            <div className="flex items-center justify-between">
              <span className="font-bold text-neutral-800 dark:text-neutral-200">
                Vista previa del mensaje formateado:
              </span>
              <button
                type="button"
                onClick={handleCopiarMensaje}
                className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              >
                {copiado ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiado ? 'Copiado al portapapeles' : 'Copiar texto'}</span>
              </button>
            </div>

            <div
              data-testid="vista-previa-mensaje-whatsapp"
              className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 font-mono text-sm leading-relaxed whitespace-pre-line text-neutral-800 select-all dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-neutral-200"
            >
              {mensajeWhatsApp}
            </div>
          </div>

          {/* 4. Qué NO hace esta salida */}
          <div
            data-testid="aviso-fuera-del-canal"
            className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Esto no queda en el chat ni cambia el estado.</strong> La cotización solo pasa
              a Enviada cuando sale por el canal de la agencia: usa «Enviar en esta conversación».
            </div>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className="flex flex-col-reverse gap-3 border-t border-neutral-100 bg-neutral-50/50 p-5 sm:flex-row sm:items-center sm:justify-end dark:border-neutral-800 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={alCerrar}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            Cerrar
          </button>

          <button
            type="button"
            onClick={handleAbrirWhatsApp}
            disabled={!telefonoValido}
            data-testid="btn-abrir-whatsapp-directo"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-bold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <span>Abrir en la app de WhatsApp</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-75" />
          </button>
        </div>
      </div>
    </div>
  );
}
