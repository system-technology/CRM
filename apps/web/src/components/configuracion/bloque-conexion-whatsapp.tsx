'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import {
  etiquetaEstado,
  formatearInstante,
  obtenerEstadoCanalWhatsapp,
  ventanaDesdeUltimaRecepcion,
  type CanalWhatsappEstado,
  type EstadoCanalWhatsapp,
} from '../../lib/canal-whatsapp-api';

type Vista =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; datos: EstadoCanalWhatsapp };

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <dt className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
        {titulo}
      </dt>
      <dd className="mt-1 text-sm font-semibold break-words text-neutral-900 dark:text-white">
        {children}
      </dd>
    </div>
  );
}

function TarjetaCanal({ canal }: { canal: CanalWhatsappEstado }) {
  const ventana = ventanaDesdeUltimaRecepcion(canal.ultimaRecepcionEn);
  const fallo = canal.ultimoEnvioFallido;
  return (
    <section
      data-testid="canal-whatsapp"
      className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold break-words text-neutral-900 dark:text-white">
            {canal.numeroE164}
          </h2>
          {canal.nombreVisible && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{canal.nombreVisible}</p>
          )}
        </div>
        <span
          data-testid="canal-conectado"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            canal.conectado
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
          }`}
        >
          {canal.conectado ? 'Conectado' : 'No operativo'}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Dato titulo="Estado del número">{etiquetaEstado(canal.estado)}</Dato>
        <Dato titulo="Estado de la cuenta de WhatsApp Business">
          {etiquetaEstado(canal.estadoCuenta)}
        </Dato>
        <Dato titulo="Conectado desde">{formatearInstante(canal.conectadoDesde)}</Dato>
        <Dato titulo="Último mensaje recibido">
          {canal.ultimaRecepcionEn ? formatearInstante(canal.ultimaRecepcionEn) : 'Ninguno todavía'}
        </Dato>
      </dl>

      {!canal.conectado && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El número o su cuenta no están activos, así que no se puede operar por WhatsApp.
            Contacta a soporte para reactivarlo.
          </span>
        </p>
      )}

      <div
        data-testid="canal-ventana"
        className="mt-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
          <Clock className="h-4 w-4" />
          Ventana de 24 horas
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          Cuando un cliente te escribe, tienes 24 horas para responderle con texto libre. Pasado ese
          tiempo, WhatsApp solo deja enviarle plantillas aprobadas, hasta que vuelva a escribir.
        </p>
        <p
          className={`mt-2 text-xs font-semibold ${
            ventana.abierta
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-neutral-600 dark:text-neutral-300'
          }`}
        >
          {ventana.texto}
        </p>
      </div>

      <div data-testid="canal-ultimo-fallo" className="mt-4">
        <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Último envío fallido</h3>
        {fallo ? (
          <div className="mt-1 rounded-2xl bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            <p>
              {formatearInstante(fallo.ocurridoEn)}:{' '}
              {fallo.motivo ?? 'WhatsApp no indicó el motivo.'}
            </p>
            {fallo.codigoErrorMeta !== null && (
              <p className="mt-1 text-[11px] opacity-80">
                Código para soporte: {fallo.codigoErrorMeta}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Ningún envío ha fallado.
          </p>
        )}
      </div>
    </section>
  );
}

export function BloqueConexionWhatsapp() {
  const [vista, setVista] = useState<Vista>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    setVista({ tipo: 'cargando' });
    try {
      setVista({ tipo: 'listo', datos: await obtenerEstadoCanalWhatsapp() });
    } catch (e) {
      setVista({
        tipo: 'error',
        mensaje: e instanceof Error ? e.message : 'No se pudo cargar el estado del canal.',
      });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <div data-testid="bloque-conexion-whatsapp" className="max-w-3xl space-y-4">
      {vista.tipo === 'cargando' && (
        <div
          data-testid="whatsapp-cargando"
          role="status"
          aria-label="Cargando estado del canal"
          className="animate-pulse space-y-3 rounded-3xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="h-5 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700" />
          <div className="h-16 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-16 rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
      )}

      {vista.tipo === 'error' && (
        <div
          data-testid="whatsapp-error"
          role="alert"
          className="rounded-3xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30"
        >
          <p className="text-sm font-bold text-rose-900 dark:text-rose-200">
            No se pudo cargar el estado de WhatsApp
          </p>
          <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">{vista.mensaje}</p>
          <button
            type="button"
            data-testid="btn-reintentar-whatsapp"
            onClick={() => void cargar()}
            className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 text-xs font-semibold text-rose-900"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
        </div>
      )}

      {vista.tipo === 'listo' && vista.datos.canales.length === 0 && (
        <div
          data-testid="estado-whatsapp-no-conectado"
          className="rounded-3xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <div className="flex items-start gap-3">
            <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                Tu agencia aún no tiene un número de WhatsApp conectado
              </h2>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Mientras no haya un número conectado, la bandeja no recibe ni envía mensajes por
                WhatsApp. Pide a soporte que vincule el número de tu agencia.
              </p>
            </div>
          </div>
        </div>
      )}

      {vista.tipo === 'listo' &&
        vista.datos.canales.map((c) => <TarjetaCanal key={c.id} canal={c} />)}
    </div>
  );
}
