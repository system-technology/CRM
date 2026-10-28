'use client';

import React, { useState } from 'react';
import type { CotizacionResumen, Mensaje } from '@viajapro/contracts';
import { FileText, X, Send, AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { inboxApi } from '../../lib/inbox-api';

export interface ModalEnviarCotizacionProps {
  conversacionId: string;
  contactoNombre: string | null;
  contactoTelefono: string;
  ventanaAbierta: boolean;
  cotizaciones: CotizacionResumen[];
  onCerrar: () => void;
  onCotizacionEnviada: (mensaje: Mensaje) => void;
}

export type EstadoEnvioCotizacion = 'inactivo' | 'enviando' | 'enviado' | 'fallido';

export function generarTextoWhatsAppCotizacion(
  cotizacion: CotizacionResumen,
  contactoNombre: string | null,
  contactoTelefono: string,
): string {
  const nombreDestinatario = contactoNombre?.trim() || contactoTelefono;
  const precioEntero = parseInt(cotizacion.precioVenta.unidades, 10);
  const precioFormateado = (precioEntero / 100).toLocaleString('es-CO', {
    maximumFractionDigits: 0,
  });

  const validezTexto = cotizacion.vigenteHasta
    ? `Hasta ${cotizacion.vigenteHasta}`
    : 'Tarifa sujeta a disponibilidad y cambios sin previo aviso';

  return `✈️ *Propuesta de Viaje: ${cotizacion.titulo} (v${cotizacion.version})*
👤 Para: ${nombreDestinatario}
💵 Inversión total: $ ${precioFormateado} ${cotizacion.precioVenta.moneda}
📅 Vigencia de tarifa: ${validezTexto}

📋 *Detalles de tu cotización:*
• Asesoría turística personalizada
• Itinerario coordinado según tus fechas
• Soporte y acompañamiento ViajaPro

_Responde a este mensaje para resolver cualquier duda o proceder con tu reserva._`;
}

export function ModalEnviarCotizacion({
  conversacionId,
  contactoNombre,
  contactoTelefono,
  ventanaAbierta,
  cotizaciones,
  onCerrar,
  onCotizacionEnviada,
}: ModalEnviarCotizacionProps) {
  const [cotizacionSeleccionadaId, setCotizacionSeleccionadaId] = useState<string>(
    cotizaciones[0]?.id ?? '',
  );
  const [estadoEnvio, setEstadoEnvio] = useState<EstadoEnvioCotizacion>('inactivo');
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);

  const cotizacionActual =
    cotizaciones.find((c) => c.id === cotizacionSeleccionadaId) ?? cotizaciones[0] ?? null;

  const textoVistaPrevia = cotizacionActual
    ? generarTextoWhatsAppCotizacion(cotizacionActual, contactoNombre, contactoTelefono)
    : '';

  const manejarEnvio = async () => {
    if (!cotizacionActual) return;
    setEstadoEnvio('enviando');
    setErrorMensaje(null);

    try {
      const mensaje = await inboxApi.enviarCotizacion(conversacionId, {
        cotizacionId: cotizacionActual.id,
        version: cotizacionActual.version,
      });

      setEstadoEnvio('enviado');
      onCotizacionEnviada(mensaje);
      setTimeout(() => {
        onCerrar();
      }, 1200);
    } catch (err) {
      setEstadoEnvio('fallido');
      if (err instanceof Error) {
        if (err.message.includes('VENTANA_CERRADA')) {
          setErrorMensaje(
            'La ventana de servicio de 24 horas está cerrada. Envía una plantilla aprobada por Meta para reanudar el contacto.',
          );
        } else {
          setErrorMensaje(err.message);
        }
      } else {
        setErrorMensaje('Ocurrió un error al enviar la cotización por WhatsApp.');
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-enviar-cotizacion-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-6 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="modal-enviar-cotizacion-titulo"
                className="text-sm font-bold text-neutral-900 sm:text-base dark:text-neutral-100"
              >
                Enviar cotización por WhatsApp
              </h2>
              <p className="text-[11px] text-neutral-500 sm:text-xs dark:text-neutral-400">
                {contactoNombre ? `${contactoNombre} · ` : ''}
                {contactoTelefono}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={estadoEnvio === 'enviando'}
            aria-label="Cerrar modal de enviar cotización"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Alerta de ventana de servicio Meta de 24 horas */}
          {!ventanaAbierta && (
            <div
              data-testid="alerta-ventana-cerrada-cotizacion"
              className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Ventana de 24 horas cerrada</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                  El cliente no ha escrito recientemente. WhatsApp requiere una plantilla aprobada
                  (HSM) para reabrir la ventana antes de enviar texto libre o cotizaciones.
                </p>
              </div>
            </div>
          )}

          {/* Selector de cotización guardada */}
          <div>
            <label
              htmlFor="selector-cotizacion-conversacion"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Selecciona una cotización guardada
            </label>
            {cotizaciones.length === 0 ? (
              <div className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/40 dark:text-neutral-400">
                No hay cotizaciones guardadas para este contacto. Ve al Cotizador para generar una.
              </div>
            ) : (
              <select
                id="selector-cotizacion-conversacion"
                data-testid="selector-cotizacion-conversacion"
                value={cotizacionSeleccionadaId}
                onChange={(e) => setCotizacionSeleccionadaId(e.target.value)}
                disabled={estadoEnvio === 'enviando'}
                className="mt-1.5 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {cotizaciones.map((cot) => (
                  <option key={cot.id} value={cot.id}>
                    {cot.titulo} (v{cot.version}) — $
                    {(parseInt(cot.precioVenta.unidades, 10) / 100).toLocaleString('es-CO')}{' '}
                    {cot.precioVenta.moneda}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Vista previa del mensaje formateado para WhatsApp */}
          {cotizacionActual && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  Vista previa del formato en WhatsApp
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Texto estructurado
                </span>
              </div>
              <div
                data-testid="vista-previa-texto-cotizacion"
                className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 font-mono text-xs whitespace-pre-wrap text-neutral-800 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-neutral-200"
              >
                {textoVistaPrevia}
              </div>
            </div>
          )}

          {/* Mensajes de error en caso de fallo */}
          {errorMensaje && (
            <div
              data-testid="alerta-error-envio-cotizacion"
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Error al enviar</p>
                <p className="mt-0.5 text-[11px] leading-relaxed">{errorMensaje}</p>
              </div>
            </div>
          )}

          {/* Mensaje de confirmación en caso de éxito */}
          {estadoEnvio === 'enviado' && (
            <div
              data-testid="alerta-exito-envio-cotizacion"
              role="status"
              className="flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span>¡Cotización enviada con éxito por WhatsApp!</span>
            </div>
          )}
        </div>

        {/* Acciones al pie */}
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-neutral-800 dark:bg-neutral-900/60">
          <button
            type="button"
            onClick={onCerrar}
            disabled={estadoEnvio === 'enviando'}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="boton-confirmar-enviar-cotizacion"
            onClick={() => void manejarEnvio()}
            disabled={!cotizacionActual || estadoEnvio === 'enviando' || estadoEnvio === 'enviado'}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
          >
            {estadoEnvio === 'enviando' ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Enviando cotización...</span>
              </>
            ) : estadoEnvio === 'enviado' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>¡Enviada!</span>
              </>
            ) : estadoEnvio === 'fallido' ? (
              <>
                <Send className="h-4 w-4" />
                <span>Reintentar envío</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Enviar por WhatsApp</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
