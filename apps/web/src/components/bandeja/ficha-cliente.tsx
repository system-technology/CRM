'use client';

import React from 'react';
import Link from 'next/link';
import { FichaDeContacto } from '@viajapro/contracts';
import { Plane, PlusCircle, ExternalLink, StickyNote, X, Clock } from 'lucide-react';
import { generarColorAvatar, obtenerIniciales } from '../../lib/bandeja-logica';

interface FichaClienteProps {
  ficha: FichaDeContacto;
  onCerrar?: () => void;
}

export function FichaCliente({ ficha, onCerrar }: FichaClienteProps) {
  const { contacto, oportunidadActual, cotizaciones, archivosDeViajeIds, notasInternas } = ficha;
  const avatarColores = generarColorAvatar(contacto.id);
  const iniciales = obtenerIniciales(contacto.nombre, contacto.telefono);

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-white text-xs dark:bg-neutral-900">
      {/* Contenido con scroll independiente */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Cabecera del panel */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <div>
            <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Ficha del Viajero
            </h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Contexto CRM y Archivos de Viaje
            </p>
          </div>
          {onCerrar && (
            <button
              onClick={onCerrar}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Ocultar ficha"
              aria-label="Cerrar ficha de cliente"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sección 1: Identidad del Contacto */}
        <section className="space-y-2.5 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/30">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarColores.bg} ${avatarColores.text}`}
            >
              {iniciales}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {contacto.nombre || contacto.telefono}
              </h3>
              <p className="cifra text-xs text-neutral-500">{contacto.telefono}</p>
            </div>
          </div>

          {contacto.correo && (
            <p className="truncate text-neutral-600 dark:text-neutral-400">📧 {contacto.correo}</p>
          )}

          {contacto.etiquetas.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {contacto.etiquetas.map((t) => (
                <span
                  key={t}
                  className="border-acento-600/30 bg-acento-50 py-0.2 text-acento-800 dark:border-acento-800 dark:bg-acento-950/60 dark:text-acento-300 rounded-xs border px-1.5 text-[10px] font-semibold"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {contacto.preferencias && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="font-bold">💡 Preferencias:</span> {contacto.preferencias}
            </div>
          )}

          <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
            {contacto.consentimientos.map((c) => (
              <span
                key={c}
                className="border-ok-300 bg-ok-50 text-ok-700 dark:border-ok-800 dark:bg-ok-950/40 dark:text-ok-400 rounded border px-1.5 py-0.5 font-medium"
              >
                ✓ {c}
              </span>
            ))}
          </div>
        </section>

        {/* Sección 2: Oportunidad Viva */}
        {oportunidadActual && (
          <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-800/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
                Oportunidad Viva
              </span>
              <span className="py-0.2 rounded-xs border border-neutral-300 bg-neutral-100 px-1.5 text-[10px] font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                {oportunidadActual.etapa.nombre}
              </span>
            </div>

            <h4 className="font-bold text-neutral-900 dark:text-neutral-100">
              {oportunidadActual.titulo}
            </h4>
            <p className="text-neutral-500">
              Destino: {oportunidadActual.destino || 'Sin especificar'}
            </p>

            {oportunidadActual.valorEstimado && (
              <p className="cifra text-acento-700 dark:text-acento-400 font-bold">
                Valor estimado:
                {(parseInt(oportunidadActual.valorEstimado.unidades, 10) / 100).toLocaleString(
                  'es-CO',
                )}{' '}
                {oportunidadActual.valorEstimado.moneda}
              </p>
            )}

            {oportunidadActual.proximaTarea && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-900">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p className="font-medium text-neutral-800 dark:text-neutral-200">
                  {oportunidadActual.proximaTarea.descripcion}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Sección 3: Archivos de Viaje Confirmados (TravelFile - Lenguaje Ubicuo) */}
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
            Archivos de Viaje (TravelFile)
          </h4>
          {archivosDeViajeIds.length === 0 ? (
            <p className="text-neutral-500 italic">No hay TravelFiles asociados.</p>
          ) : (
            <div className="space-y-1.5">
              {archivosDeViajeIds.map((tfId) => (
                <div
                  key={tfId}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2.5 font-mono shadow-2xs dark:border-neutral-800 dark:bg-neutral-800"
                >
                  <div className="flex items-center gap-2">
                    <Plane className="text-acento-600 h-4 w-4" />
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">
                      TravelFile #{tfId}
                    </span>
                  </div>
                  <span className="bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-400 rounded px-1.5 py-0.5 font-sans text-[10px] font-bold">
                    Confirmado
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sección 4: Cotizaciones Recientes */}
        <section className="space-y-1.5">
          <h4 className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
            Cotizaciones Recientes
          </h4>
          {cotizaciones.length === 0 ? (
            <p className="text-neutral-500 italic">Sin cotizaciones enviadas.</p>
          ) : (
            <div className="space-y-2">
              {cotizaciones.map((cot) => (
                <div
                  key={cot.id}
                  className="rounded-xl border border-neutral-200 bg-white p-3 shadow-2xs dark:border-neutral-800 dark:bg-neutral-800/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900 dark:text-neutral-100">
                      {cot.titulo}
                    </span>
                    <span className="py-0.2 rounded bg-neutral-100 px-1.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                      v{cot.version}
                    </span>
                  </div>
                  <p className="cifra mt-1.5 font-bold text-neutral-900 dark:text-neutral-100">
                    $ {(parseInt(cot.precioVenta.unidades, 10) / 100).toLocaleString('es-CO')}{' '}
                    {cot.precioVenta.moneda}
                  </p>
                  {cot.vigenteHasta && (
                    <p className="mt-0.5 text-[10px] text-neutral-400">
                      Vigente hasta: {cot.vigenteHasta}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sección 5: Notas Internas */}
        {notasInternas.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase">
              Notas de CRM
            </h4>
            {notasInternas.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-[11px] text-amber-950 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300"
              >
                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="font-bold">{n.autorNombre || 'Asesor'}:</p>
                  <p className="whitespace-pre-wrap">{n.texto}</p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      {/* Acciones de Cierre fijas al pie (Tarea 0b.8) */}
      <div className="sticky bottom-0 space-y-2 border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Link
          href={`/cotizador?contactoId=${contacto.id}`}
          className="bg-acento-700 hover:bg-acento-800 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold text-white shadow-sm transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          <span>Crear cotización</span>
        </Link>
        <button
          type="button"
          disabled
          title="Ver archivo completo del viaje"
          className="flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-lg border border-neutral-300 py-2 text-xs font-semibold text-neutral-500 opacity-70 dark:border-neutral-700 dark:text-neutral-400"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>Ver archivo completo</span>
        </button>
      </div>
    </div>
  );
}
