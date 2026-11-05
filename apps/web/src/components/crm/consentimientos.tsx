'use client';

import React, { useState } from 'react';
import { type Consentimiento, type Contacto } from '@viajapro/contracts';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw,
  AlertTriangle,
  X,
  Info,
} from 'lucide-react';
import {
  calcularEstadosConsentimiento,
  otorgarConsentimiento,
  revocarConsentimiento,
  type EstadoFinalidadConsentimiento,
  TEXTOS_LEGALES_CONSENTIMIENTO,
} from '../../lib/consentimientos-logica';
import { formatearFechaHora } from '../../lib/formato';
import { usePermisos, explicacionFaltaPermiso } from '../../lib/permisos';

export interface PanelConsentimientosContactoProps {
  contacto: Contacto;
  onContactoActualizado?: (contacto: Contacto) => void;
  modoCompacto?: boolean;
}

export function PanelConsentimientosContacto({
  contacto,
  onContactoActualizado,
  modoCompacto = false,
}: PanelConsentimientosContactoProps) {
  const { puedeEscribirCrm, cargando } = usePermisos();
  const deshabilitadoPorPermiso = !cargando && !puedeEscribirCrm;
  const [cargandoFinalidad, setCargandoFinalidad] = useState<Consentimiento | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [modalFinalidadTexto, setModalFinalidadTexto] =
    useState<EstadoFinalidadConsentimiento | null>(null);
  const [confirmarRevocar, setConfirmarRevocar] = useState<Consentimiento | null>(null);

  const estados = calcularEstadosConsentimiento(contacto);

  const manejarOtorgar = async (finalidad: Consentimiento) => {
    setCargandoFinalidad(finalidad);
    setErrorAccion(null);
    try {
      const actualizado = await otorgarConsentimiento(contacto.id, finalidad, {
        canal: 'formulario-web',
        prueba: 'interfaz-crm:asesor-web',
      });
      onContactoActualizado?.(actualizado);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'No fue posible registrar el consentimiento.';
      setErrorAccion(mensaje);
    } finally {
      setCargandoFinalidad(null);
    }
  };

  const manejarRevocar = async (finalidad: Consentimiento) => {
    setCargandoFinalidad(finalidad);
    setErrorAccion(null);
    setConfirmarRevocar(null);
    try {
      const actualizado = await revocarConsentimiento(contacto.id, finalidad);
      onContactoActualizado?.(actualizado);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'No fue posible revocar el consentimiento.';
      setErrorAccion(mensaje);
    } finally {
      setCargandoFinalidad(null);
    }
  };

  return (
    <section
      data-testid="seccion-consentimientos"
      aria-labelledby="titulo-seccion-consentimientos"
      className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Cabecera del Panel */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3
              id="titulo-seccion-consentimientos"
              className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
            >
              Consentimientos Ley 1581 (Habeas Data)
            </h3>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Autorización demostrable de tratamiento de datos por WhatsApp y canales de la agencia.
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          Versión legal: {TEXTOS_LEGALES_CONSENTIMIENTO.VERSION_AVISO_PENDIENTE_REVISION_LEGAL}
        </span>
      </div>

      {/* Alerta de Error si falló la API */}
      {errorAccion && (
        <div
          role="alert"
          data-testid="alerta-error-consentimiento"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="flex-1">{errorAccion}</span>
          <button
            type="button"
            onClick={() => setErrorAccion(null)}
            className="rounded p-1 hover:bg-rose-100 dark:hover:bg-rose-900"
            aria-label="Cerrar aviso de error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Lista de Finalidades */}
      <div
        className={`grid gap-3.5 ${modoCompacto ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}
      >
        {estados.map((item) => {
          const testIdSuffix = item.finalidad.toLowerCase();
          const enProceso = cargandoFinalidad === item.finalidad;

          return (
            <article
              key={item.finalidad}
              data-testid={`item-consentimiento-${testIdSuffix}`}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                item.vigente
                  ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                  : 'border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/20'
              }`}
            >
              <div>
                {/* Encabezado de la finalidad */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
                      Finalidad {item.finalidad}
                    </span>
                    <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {item.titulo}
                    </h4>
                  </div>

                  {item.vigente ? (
                    <span
                      data-testid={`badge-estado-${testIdSuffix}`}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      Vigente
                    </span>
                  ) : (
                    <span
                      data-testid={`badge-estado-${testIdSuffix}`}
                      className="inline-flex items-center gap-1 rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <XCircle className="h-3.5 w-3.5 text-neutral-500" />
                      Revocado / No otorgado
                    </span>
                  )}
                </div>

                {/* Descripción e impacto */}
                <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {item.descripcion}
                </p>

                {/* Metadatos de Trazabilidad */}
                <div className="dark:bg-neutral-850/60 mt-3 space-y-1.5 rounded-lg border border-neutral-200/60 bg-white/70 p-2.5 text-[11px] text-neutral-600 dark:border-neutral-700/60 dark:text-neutral-400">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Canal:</span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {item.canal}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">
                      {item.vigente ? 'Fecha otorgado:' : 'Fecha registro:'}
                    </span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">
                      {item.otorgadoEn ? formatearFechaHora(item.otorgadoEn) : 'No registrada'}
                    </span>
                  </div>

                  {item.revocadoEn && (
                    <div className="flex items-center justify-between text-rose-700 dark:text-rose-400">
                      <span>Revocado en:</span>
                      <span className="font-semibold">{formatearFechaHora(item.revocadoEn)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-500">Versión del aviso:</span>
                    <span className="font-mono text-[10px] text-neutral-700 dark:text-neutral-300">
                      {item.versionAviso}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botones de Acción */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200/60 pt-3 dark:border-neutral-700/60">
                <button
                  type="button"
                  data-testid={`btn-ver-texto-${testIdSuffix}`}
                  onClick={() => setModalFinalidadTexto(item)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-teal-300 dark:hover:bg-teal-950/60"
                >
                  <FileText className="h-4 w-4" />
                  <span>Ver texto mostrado</span>
                </button>

                {item.vigente ? (
                  confirmarRevocar === item.finalidad ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-rose-700 dark:text-rose-400">
                        ¿Confirmar?
                      </span>
                      <button
                        type="button"
                        data-testid={`btn-confirmar-revocar-${testIdSuffix}`}
                        onClick={() => void manejarRevocar(item.finalidad)}
                        disabled={enProceso}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-rose-700 disabled:opacity-50"
                      >
                        {enProceso ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Sí, revocar'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmarRevocar(null)}
                        disabled={enProceso}
                        className="min-h-[44px] rounded-lg px-2 text-xs text-neutral-500 hover:text-neutral-800"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      data-testid={`btn-revocar-${testIdSuffix}`}
                      onClick={() => setConfirmarRevocar(item.finalidad)}
                      disabled={enProceso || deshabilitadoPorPermiso}
                      title={
                        deshabilitadoPorPermiso
                          ? explicacionFaltaPermiso('crm.escribir')
                          : undefined
                      }
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:bg-neutral-800 dark:text-rose-300 dark:hover:bg-neutral-700"
                    >
                      <ShieldAlert className="h-4 w-4" />
                      <span>Revocar consentimiento</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    data-testid={`btn-otorgar-${testIdSuffix}`}
                    onClick={() => void manejarOtorgar(item.finalidad)}
                    disabled={enProceso || deshabilitadoPorPermiso}
                    title={
                      deshabilitadoPorPermiso ? explicacionFaltaPermiso('crm.escribir') : undefined
                    }
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enProceso ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-4 w-4" />
                    )}
                    <span>Otorgar consentimiento</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Modal / Drawer para Ver el Texto Mostrado al Titular */}
      {modalFinalidadTexto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-texto-mostrado"
          data-testid="modal-texto-mostrado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            {/* Cabecera del modal */}
            <div className="flex items-center justify-between border-b border-neutral-100 p-4 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h4
                  id="titulo-modal-texto-mostrado"
                  className="text-base font-bold text-neutral-900 dark:text-neutral-100"
                >
                  Texto legal mostrado — {modalFinalidadTexto.finalidad}
                </h4>
              </div>
              <button
                type="button"
                data-testid="btn-cerrar-modal-texto"
                onClick={() => setModalFinalidadTexto(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Cerrar modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cuerpo del modal */}
            <div className="flex-1 space-y-3.5 overflow-y-auto p-5 text-xs text-neutral-600 dark:text-neutral-300">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <Info className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  <strong>Versión legal:</strong> {modalFinalidadTexto.versionAviso}
                </span>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
                <h5 className="font-bold text-neutral-800 dark:text-neutral-100">
                  Texto exacto presentado al viajero:
                </h5>
                <blockquote
                  data-testid="bloque-texto-mostrado"
                  className="mt-2 text-xs leading-relaxed text-neutral-700 italic dark:text-neutral-200"
                >
                  «{modalFinalidadTexto.textoMostrado}»
                </blockquote>
              </div>

              <div className="space-y-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                <p>
                  <strong>Prueba de registro:</strong> {modalFinalidadTexto.prueba}
                </p>
                <p>
                  <strong>Canal documentado:</strong> {modalFinalidadTexto.canal}
                </p>
                <p>
                  <strong>Marco regulatorio:</strong> Ley Estatutaria 1581 de 2012 y Decreto 1377 de
                  2013 (Habeas Data Colombia).
                </p>
              </div>
            </div>

            {/* Pie del modal */}
            <div className="flex justify-end border-t border-neutral-100 p-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setModalFinalidadTexto(null)}
                className="min-h-[44px] rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
