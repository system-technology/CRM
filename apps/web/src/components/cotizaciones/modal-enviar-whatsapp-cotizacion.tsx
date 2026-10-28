'use client';

import React, { useState, useMemo } from 'react';
import {
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Clock,
  X,
  Send,
  User,
  Phone,
} from 'lucide-react';
import type { CotizacionGuardada, Contacto } from '@viajapro/contracts';
import {
  generarMensajeWhatsAppCotizacion,
  generarEnlaceWhatsApp,
  obtenerUltimaVersion,
} from '../../lib/cotizaciones-logica';
import { cambiarEstadoCotizacionApi } from '../../lib/cotizaciones-api';
import { formatearDinero } from '../../lib/formato';

export interface ModalEnviarWhatsAppCotizacionProps {
  cotizacion: CotizacionGuardada;
  contacto?: Contacto | null | undefined;
  versionInicial?: number | undefined;
  abierto: boolean;
  alCerrar: () => void;
  alEnviarExitoso?: ((cotizacionActualizada: CotizacionGuardada) => void) | undefined;
}

export function ModalEnviarWhatsAppCotizacion({
  cotizacion,
  contacto,
  versionInicial,
  abierto,
  alCerrar,
  alEnviarExitoso,
}: ModalEnviarWhatsAppCotizacionProps) {
  const ultima = obtenerUltimaVersion(cotizacion.versiones);
  const [versionSeleccionada, setVersionSeleccionada] = useState<number>(
    versionInicial ?? ultima?.numero ?? 1,
  );
  const [telefono, setTelefono] = useState<string>(contacto?.telefono ?? '');
  const [copiado, setCopiado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviadoExito, setEnviadoExito] = useState(false);

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

  const handleMarcarEnviada = async () => {
    setEnviando(true);
    try {
      const actualizada = await cambiarEstadoCotizacionApi(cotizacion.id, 'ENVIADA');
      setEnviadoExito(true);
      alEnviarExitoso?.(actualizada);
      setTimeout(() => {
        alCerrar();
        setEnviadoExito(false);
      }, 1500);
    } catch {
      // Si falla la API, mantenemos el modal abierto
    } finally {
      setEnviando(false);
    }
  };

  const handleAbrirWhatsApp = async () => {
    const telefonoLimpio = telefono.trim() || '573000000000';
    const enlace = generarEnlaceWhatsApp(telefonoLimpio, mensajeWhatsApp);
    window.open(enlace, '_blank', 'noopener,noreferrer');
    await handleMarcarEnviada();
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
                  Enviar Cotización por WhatsApp
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  T-107
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Canal oficial de turismo Meta Cloud API — Propuesta comercial sin filtración de
                netos (R10)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            data-testid="btn-cerrar-modal-whatsapp"
            aria-label="Cerrar modal"
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo del Modal */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6 text-xs">
          {/* Mensaje de éxito al marcar como enviada */}
          {enviadoExito && (
            <div
              data-testid="alerta-envio-exitoso"
              className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            >
              <Check className="h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-bold">¡Cotización marcada como Enviada con éxito!</p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  El estado del viaje y la versión {versionActual.numero} quedaron registrados en el
                  historial de la agencia.
                </p>
              </div>
            </div>
          )}

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
                      className={`flex min-h-[44px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
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
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 uppercase">
                <User className="h-3.5 w-3.5 text-neutral-400" />
                Viajero Destinatario
              </span>
              <p className="mt-1 font-bold text-neutral-900 dark:text-white">
                {contacto?.nombre || 'Contacto no registrado'}
              </p>
              <span className="text-[10px] text-neutral-400">
                {contacto?.correo || 'Sin correo asociado'}
              </span>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <label
                htmlFor="input-telefono-whatsapp"
                className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500 uppercase"
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
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 font-mono text-xs text-neutral-900 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
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
                className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
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
              className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-line text-neutral-800 select-all dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-neutral-200"
            >
              {mensajeWhatsApp}
            </div>
          </div>

          {/* 4. Aviso de Ventana de 24 horas y Regla R6 */}
          <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4 text-[11px] text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong>Recordatorio de Ventana de Atención (Meta):</strong> Si el viajero te escribió
              en las últimas 24 horas, puedes enviar esta cotización directamente con texto libre.
              Si han pasado más de 24 horas, WhatsApp requerirá una plantilla oficial HSM de
              seguimiento.
            </div>
          </div>
        </div>

        {/* Pie de Acciones del Modal */}
        <div className="flex flex-col-reverse gap-3 border-t border-neutral-100 bg-neutral-50/50 p-5 sm:flex-row sm:items-center sm:justify-end dark:border-neutral-800 dark:bg-neutral-900/50">
          <button
            type="button"
            onClick={alCerrar}
            className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() => {
              void handleMarcarEnviada();
            }}
            disabled={enviando}
            data-testid="btn-solo-marcar-enviada"
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <Check className="h-4 w-4" />
            <span>{enviando ? 'Guardando...' : 'Marcar como Enviada'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              void handleAbrirWhatsApp();
            }}
            disabled={enviando}
            data-testid="btn-abrir-whatsapp-directo"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
            <span>Abrir y Enviar por WhatsApp</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-75" />
          </button>
        </div>
      </div>
    </div>
  );
}
