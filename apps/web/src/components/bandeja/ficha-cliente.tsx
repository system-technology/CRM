'use client';

import React from 'react';
import Link from 'next/link';
import { FichaDeContacto } from '@viajapro/contracts';
import { StickyNote, X, Clock, Edit3, ChevronRight } from 'lucide-react';
import { formatearDinero } from '../../lib/formato';
import { generarColorAvatar, obtenerIniciales } from '../../lib/bandeja-logica';
import { SeccionCamposPersonalizados } from '../contactos/seccion-campos-personalizados';
import { SolicitudDeViaje } from './solicitud-de-viaje';
import { componerViaje, type ViajeDeContacto } from '../../lib/viaje-solicitado-logica';

interface FichaClienteProps {
  ficha: FichaDeContacto;
  onCerrar?: () => void;
  onEditarContacto?: () => void;
  onCrearOportunidad?: () => void;
  /**
   * El viaje ya compuesto con todas las fuentes que tiene la página (oportunidad, archivo,
   * cotización vigente con sus pasajeros). Sin él, la ficha compone lo que ella misma trae.
   */
  viaje?: ViajeDeContacto;
  /** Para que el cotizador sepa de qué conversación viene. */
  conversacionId?: string;
}

export function FichaCliente({
  ficha,
  onCerrar,
  onEditarContacto,
  onCrearOportunidad,
  viaje: viajeExterno,
  conversacionId,
}: FichaClienteProps) {
  const { contacto, oportunidadActual, cotizaciones, notasInternas } = ficha;
  const cotizacionReciente = cotizaciones[0];
  const viaje =
    viajeExterno ??
    componerViaje({
      oportunidad: oportunidadActual,
      cotizacion: cotizacionReciente
        ? {
            id: cotizacionReciente.id,
            titulo: cotizacionReciente.titulo,
            version: cotizacionReciente.version,
            venta: cotizacionReciente.precioVenta,
            vigenteHasta: cotizacionReciente.vigenteHasta,
            estado: null,
          }
        : null,
    });
  const avatarColores = generarColorAvatar(contacto.id);
  const iniciales = obtenerIniciales(contacto.nombre, contacto.telefono);

  return (
    <div className="flex h-full flex-col justify-between overflow-hidden bg-white text-sm dark:bg-neutral-900">
      {/* Contenido con scroll independiente */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Cabecera del panel */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
            Ficha del Viajero
          </h2>
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

        {/* Solicitud de viaje: lo primero, visible sin desplazarse, con el único botón «Cotizar» */}
        <SolicitudDeViaje
          viaje={viaje}
          contactoId={contacto.id}
          conversacionId={conversacionId}
          oportunidad={oportunidadActual}
          onCrearOportunidad={onCrearOportunidad}
        />

        {oportunidadActual?.proximaTarea && (
          <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-900">
            <Clock className="text-aviso-700 mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                Próximo paso
              </p>
              <p className="font-medium text-neutral-800 dark:text-neutral-200">
                {oportunidadActual.proximaTarea.descripcion}
              </p>
            </div>
          </div>
        )}

        {/* Sección 1: Identidad del Contacto */}
        <section className="space-y-2.5 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/30">
          <div className="flex items-center justify-between">
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
                <p className="cifra text-sm text-neutral-500">{contacto.telefono}</p>
              </div>
            </div>
            {onEditarContacto && (
              <button
                type="button"
                data-testid="btn-editar-contacto"
                onClick={onEditarContacto}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
                title="Editar contacto"
                aria-label="Editar contacto"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>

          {contacto.correo && (
            <p className="truncate text-neutral-600 dark:text-neutral-400">📧 {contacto.correo}</p>
          )}

          {contacto.etiquetas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-1">
              {/* Atributos duraderos del contacto: no son las etiquetas de la conversación (T-326) */}
              <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                Del contacto:
              </span>
              {contacto.etiquetas.map((t) => (
                <span
                  key={t}
                  className="border-acento-600/30 bg-acento-50 py-0.2 text-acento-800 dark:border-acento-800 dark:bg-acento-950/60 dark:text-acento-300 rounded-xs border px-1.5 text-sm font-semibold"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {contacto.preferencias && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              <span className="font-bold">💡 Preferencias:</span> {contacto.preferencias}
            </div>
          )}

          <div className="flex flex-wrap gap-1 pt-1 text-sm">
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

        {/* Campos personalizados: bajan y van plegados (la solicitud de viaje manda arriba) */}
        <details className="group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-800/30">
          <summary className="focus-visible:ring-acento-600 flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-neutral-700 select-none focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px] dark:text-neutral-300">
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
            <span>Datos del viajero y del viaje</span>
          </summary>
          <div className="space-y-3 px-3.5 pb-3.5">
            <SeccionCamposPersonalizados entidad="contacto" entidadId={contacto.id} />
            {oportunidadActual && (
              <SeccionCamposPersonalizados entidad="oportunidad" entidadId={oportunidadActual.id} />
            )}
          </div>
        </details>

        {/* Cotizaciones anteriores: la vigente ya está arriba */}
        {cotizaciones.length > 1 && (
          <details className="group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-800/30">
            <summary className="focus-visible:ring-acento-600 flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-neutral-700 select-none focus-visible:ring-2 focus-visible:outline-none md:min-h-[32px] dark:text-neutral-300">
              <ChevronRight
                className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              <span>Todas las cotizaciones ({cotizaciones.length})</span>
            </summary>
            <ul className="space-y-1.5 px-3.5 pb-3.5">
              {cotizaciones.map((cot) => (
                <li key={cot.id}>
                  <Link
                    href={`/cotizaciones/${cot.id}`}
                    className="hover:border-acento-600 block rounded-lg border border-neutral-200 p-2.5 dark:border-neutral-700"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {cot.titulo}
                      </span>
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                        v{cot.version}
                      </span>
                    </span>
                    <span className="cifra mt-1 block font-bold text-neutral-900 dark:text-neutral-100">
                      {formatearDinero(cot.precioVenta)} {cot.precioVenta.moneda}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Sección 5: Notas Internas */}
        {notasInternas.length > 0 && (
          <section className="space-y-1.5">
            <h4 className="text-sm font-bold text-neutral-400">Notas del contacto</h4>
            {notasInternas.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-sm text-amber-950 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300"
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
    </div>
  );
}
