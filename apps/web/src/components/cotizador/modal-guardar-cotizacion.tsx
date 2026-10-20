'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Contacto } from '@viajapro/contracts';
import { Bookmark, X, AlertCircle, Calendar, User, FileText, CheckCircle2 } from 'lucide-react';
import { useFocoModal } from '../../lib/use-foco-modal';

export interface ModalGuardarCotizacionProps {
  abierto: boolean;
  alCerrar: () => void;
  alConfirmar: (datos: {
    contactoId: string;
    titulo: string;
    vigenteHasta?: string | undefined;
  }) => Promise<void>;
  guardando: boolean;
  error: { codigo: string; mensaje: string; esErrorAgencia: boolean } | null;
  tituloSugerido: string;
  contactoIdInicial?: string | undefined;
  contactosDisponibles: Contacto[];
  paqueteNombre: string;
  fechaSalida: string;
  adultos: number;
  ninos: number;
  infantes: number;
  totalEstimadoFormateado: string;
}

export function ModalGuardarCotizacion({
  abierto,
  alCerrar,
  alConfirmar,
  guardando,
  error,
  tituloSugerido,
  contactoIdInicial,
  contactosDisponibles,
  paqueteNombre,
  fechaSalida,
  adultos,
  ninos,
  infantes,
  totalEstimadoFormateado,
}: ModalGuardarCotizacionProps) {
  const [titulo, setTitulo] = useState(tituloSugerido);
  const [contactoId, setContactoId] = useState(contactoIdInicial ?? '');
  const [vigenteHasta, setVigenteHasta] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const inputTituloRef = useRef<HTMLInputElement>(null);
  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar,
    elementoInicialRef: inputTituloRef,
  });

  // Sincronizar título sugerido y contacto inicial al abrir
  useEffect(() => {
    if (abierto) {
      setTitulo(tituloSugerido);
      if (contactoIdInicial) {
        setContactoId(contactoIdInicial);
      } else if (contactosDisponibles.length > 0 && !contactoId) {
        setContactoId(contactosDisponibles[0]!.id);
      }
      setErrorLocal(null);
    }
  }, [abierto, tituloSugerido, contactoIdInicial, contactosDisponibles, contactoId]);

  if (!abierto) return null;

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      setErrorLocal('El título de la cotización es obligatorio.');
      return;
    }
    if (!contactoId.trim()) {
      setErrorLocal('Debe seleccionar o asignar un contacto para la cotización.');
      return;
    }

    setErrorLocal(null);
    await alConfirmar({
      contactoId: contactoId.trim(),
      titulo: titulo.trim(),
      vigenteHasta: vigenteHasta ? vigenteHasta : undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-guardar-cotizacion"
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
      onClick={alCerrar}
    >
      <div
        ref={contenedorRef}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
              <Bookmark className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-guardar-cotizacion"
                className="text-base font-bold text-neutral-900 dark:text-white"
              >
                Guardar Cotización Oficial
              </h2>
              <p className="text-xs text-neutral-500">
                Registra la Versión 1 inmutable en el historial del cliente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            disabled={guardando}
            aria-label="Cerrar ventana modal"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form
          onSubmit={(e) => {
            void manejarEnvio(e);
          }}
          className="space-y-4 p-6 text-xs"
        >
          {/* Alertas de error con aria-live */}
          {(error || errorLocal) && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {errorLocal || error?.mensaje || 'Error al guardar la cotización.'}
                </p>
                {error?.esErrorAgencia && (
                  <p className="mt-1 text-[11px] opacity-90">
                    Asegúrese de contar con la configuración de tenant activa en .env.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Título de la cotización */}
          <div>
            <label
              htmlFor="input-titulo-cotizacion"
              className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300"
            >
              <FileText className="h-3.5 w-3.5 text-neutral-400" />
              Título descriptivo *
            </label>
            <input
              ref={inputTituloRef}
              id="input-titulo-cotizacion"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              disabled={guardando}
              placeholder="Ej: Cotización San Andrés — Pareja"
              className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              required
            />
          </div>

          {/* Contacto asignado */}
          <div>
            <label
              htmlFor="select-contacto-cotizacion"
              className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300"
            >
              <User className="h-3.5 w-3.5 text-neutral-400" />
              Contacto del viajero *
            </label>
            {contactosDisponibles.length > 0 ? (
              <select
                id="select-contacto-cotizacion"
                value={contactoId}
                onChange={(e) => setContactoId(e.target.value)}
                disabled={guardando}
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                required
              >
                <option value="">-- Seleccionar contacto registrado --</option>
                {contactosDisponibles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre || 'Sin nombre'} ({c.telefono})
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="select-contacto-cotizacion"
                type="text"
                value={contactoId}
                onChange={(e) => setContactoId(e.target.value)}
                disabled={guardando}
                placeholder="ID UUID del contacto (ej: 00000000-0002-4000-8000-000000000001)"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 font-mono text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                required
              />
            )}
          </div>

          {/* Vigencia opcional */}
          <div>
            <label
              htmlFor="input-vigencia-cotizacion"
              className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300"
            >
              <Calendar className="h-3.5 w-3.5 text-neutral-400" />
              Vigente hasta (opcional)
            </label>
            <input
              id="input-vigencia-cotizacion"
              type="date"
              value={vigenteHasta}
              onChange={(e) => setVigenteHasta(e.target.value)}
              disabled={guardando}
              className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <span className="mt-1 block text-[11px] text-neutral-500">
              Fecha límite hasta la cual se honra este precio al cliente.
            </span>
          </div>

          {/* Resumen Comercial de la Versión 1 */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
            <span className="text-[11px] font-bold text-neutral-500 uppercase">
              Composición registrada en Versión 1
            </span>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">Paquete:</span>
                <span className="max-w-[240px] truncate font-semibold text-neutral-900 dark:text-white">
                  {paqueteNombre}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">Fecha de salida:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {fechaSalida}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600 dark:text-neutral-400">Pasajeros:</span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {adultos} adulto(s){ninos > 0 ? `, ${ninos} niño(s)` : ''}
                  {infantes > 0 ? `, ${infantes} infante(s)` : ''}
                </span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-1.5 dark:border-neutral-700">
                <span className="font-bold text-neutral-700 dark:text-neutral-300">
                  Total Venta Estimado:
                </span>
                <span className="cifra font-extrabold text-neutral-900 dark:text-white">
                  {totalEstimadoFormateado}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-neutral-500">
              * El servidor recalculará el importe bajo transacción para garantizar inmutabilidad.
            </p>
          </div>

          {/* Acciones del pie */}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={alCerrar}
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Guardando versión 1...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Confirmar y Guardar Cotización</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
