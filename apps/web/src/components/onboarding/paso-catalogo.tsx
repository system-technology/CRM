'use client';

import React, { useState } from 'react';
import { Compass, CheckCircle2, Plus, FileSpreadsheet, Sparkles, MapPin, Tag } from 'lucide-react';
import {
  type DatosCatalogoOnboarding,
  EXCURSIONES_MUESTRA_COLOMBIA,
} from '../../lib/onboarding-logica';
import { formatearCOP } from '../../lib/formato';

export interface PasoCatalogoProps {
  datos: DatosCatalogoOnboarding;
  alGuardar: (datos: DatosCatalogoOnboarding) => void;
  alOmitir: () => void;
}

export function PasoCatalogo({ datos, alGuardar, alOmitir }: PasoCatalogoProps) {
  const [estrategia, setEstrategia] = useState<'semilla_demo' | 'importar_csv' | 'manual'>(
    datos.estrategia === 'omitido' ? 'semilla_demo' : datos.estrategia,
  );
  const [seleccionadas, setSeleccionadas] = useState<string[]>(
    datos.excursionesSeleccionadas.length > 0
      ? datos.excursionesSeleccionadas
      : ['exc-rosario-1', 'exc-ciudad-amurallada-2', 'exc-baru-3'],
  );

  // Formulario manual rápido
  const [manualTitulo, setManualTitulo] = useState('');
  const [manualDestino, setManualDestino] = useState('');
  const [manualPrecioCop, setManualPrecioCop] = useState('180000');
  const [manualDuracion, setManualDuracion] = useState('1 día');
  const [excursionesManuales, setExcursionesManuales] = useState<
    Array<{ id: string; titulo: string; destino: string; precio: number }>
  >([]);

  const toggleSeleccion = (id: string) => {
    setSeleccionadas((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleAgregarManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitulo.trim()) return;
    const precio = parseInt(manualPrecioCop.replace(/\D/g, ''), 10) || 100000;
    setExcursionesManuales((prev) => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        titulo: manualTitulo.trim(),
        destino: manualDestino.trim() || 'Cartagena',
        precio,
      },
    ]);
    setManualTitulo('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const total =
      estrategia === 'semilla_demo'
        ? seleccionadas.length
        : estrategia === 'manual'
          ? excursionesManuales.length
          : 5; // Importación prevista

    alGuardar({
      estrategia,
      excursionesSeleccionadas: seleccionadas,
      totalExcursiones: Math.max(total, 1),
    });
  };

  return (
    <form onSubmit={handleSubmit} data-testid="paso-catalogo-form" className="space-y-6">
      {/* Selector de Estrategia de Catálogo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setEstrategia('semilla_demo')}
          data-testid="opcion-catalogo-semilla"
          className={`flex min-h-[44px] flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            estrategia === 'semilla_demo'
              ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600 dark:border-teal-400 dark:bg-teal-950/30 dark:ring-teal-400'
              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-900 dark:text-teal-300">
              Recomendado
            </span>
          </div>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            Excursiones de Muestra
          </h4>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            Carga pasadías colombianos populares listos para cotizar en segundos.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setEstrategia('manual')}
          data-testid="opcion-catalogo-manual"
          className={`flex min-h-[44px] flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            estrategia === 'manual'
              ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600 dark:border-teal-400 dark:bg-teal-950/30 dark:ring-teal-400'
              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            <Plus className="h-4 w-4" />
          </span>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            Crear Producto Rápido
          </h4>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            Registra tu primera excursión o pasadía insignia manualmente.
          </p>
        </button>

        <button
          type="button"
          onClick={() => setEstrategia('importar_csv')}
          data-testid="opcion-catalogo-csv"
          className={`flex min-h-[44px] flex-col items-start rounded-2xl border p-4 text-left transition-all ${
            estrategia === 'importar_csv'
              ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600 dark:border-teal-400 dark:bg-teal-950/30 dark:ring-teal-400'
              : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            <FileSpreadsheet className="h-4 w-4" />
          </span>
          <h4 className="mt-3 text-xs font-bold text-neutral-900 dark:text-white">
            Importar con CSV/Excel
          </h4>
          <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            Usa el importador masivo en 4 pasos con validación estricta (T-029).
          </p>
        </button>
      </div>

      {/* Contenido según Estrategia */}
      {estrategia === 'semilla_demo' && (
        <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <div>
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                Selecciona las excursiones que deseas precargar
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Podrás editarlas, cambiar tarifas o agregar más en cualquier momento desde el
                Catálogo.
              </p>
            </div>
            <span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              {seleccionadas.length} seleccionadas
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EXCURSIONES_MUESTRA_COLOMBIA.map((exc) => {
              const activa = seleccionadas.includes(exc.id);
              return (
                <div
                  key={exc.id}
                  onClick={() => toggleSeleccion(exc.id)}
                  className={`flex cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition-all ${
                    activa
                      ? 'border-teal-500 bg-teal-50/40 dark:border-teal-500/60 dark:bg-teal-950/20'
                      : 'border-neutral-200 bg-white opacity-75 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        <Tag className="h-3 w-3" />
                        {exc.tipo}
                      </span>
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          activa
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-neutral-300 dark:border-neutral-700'
                        }`}
                      >
                        {activa && <CheckCircle2 className="h-4 w-4" />}
                      </div>
                    </div>

                    <h4 className="mt-2 text-xs font-bold text-neutral-900 dark:text-white">
                      {exc.titulo}
                    </h4>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      <MapPin className="h-3 w-3" />
                      {exc.destino} · {exc.duracion}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
                    <span className="text-[10px] text-neutral-400">Precio base:</span>
                    <span className="cifra text-xs font-black text-teal-700 dark:text-teal-400">
                      {formatearCOP(exc.precioBaseCop)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {estrategia === 'manual' && (
        <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
            Crear primera excursión personalizada
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Nombre de la excursión / pasadía *
              </label>
              <input
                type="text"
                value={manualTitulo}
                onChange={(e) => setManualTitulo(e.target.value)}
                placeholder="Ej. Tour Manglares & Ciénaga de la Virgen"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Destino principal
              </label>
              <input
                type="text"
                value={manualDestino}
                onChange={(e) => setManualDestino(e.target.value)}
                placeholder="Ej. Cartagena de Indias"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Precio base por persona (COP)
              </label>
              <input
                type="text"
                value={manualPrecioCop}
                onChange={(e) => setManualPrecioCop(e.target.value)}
                placeholder="180000"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Duración
              </label>
              <input
                type="text"
                value={manualDuracion}
                onChange={(e) => setManualDuracion(e.target.value)}
                placeholder="Ej. 1 día (6 horas)"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAgregarManual}
            className="flex min-h-[44px] items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-teal-700 dark:bg-teal-500"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar Excursión a la Lista</span>
          </button>

          {excursionesManuales.length > 0 && (
            <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Excursiones registradas ({excursionesManuales.length}):
              </span>
              {excursionesManuales.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg bg-neutral-50 p-2.5 text-xs dark:bg-neutral-800/60"
                >
                  <span className="font-semibold text-neutral-900 dark:text-white">{m.titulo}</span>
                  <span className="font-mono text-teal-600 dark:text-teal-400">
                    {formatearCOP(m.precio)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {estrategia === 'importar_csv' && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-400">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                Importación con Plantilla CSV oficial de ViajaPro (T-029)
              </h3>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                Puedes continuar ahora con el asistente y completar la carga de tu tarifario masivo
                en cualquier momento desde la sección Catálogo.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="/catalogo"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <Compass className="h-4 w-4" />
                  <span>Abrir Importador en nueva pestaña</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Acciones del Paso */}
      <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-neutral-200 pt-5 sm:flex-row dark:border-neutral-800">
        <button
          type="button"
          onClick={alOmitir}
          data-testid="btn-omitir-paso-catalogo"
          className="min-h-[44px] w-full rounded-xl px-5 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 sm:w-auto dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          Omitir por ahora
        </button>

        <button
          type="submit"
          data-testid="btn-guardar-paso-catalogo"
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-neutral-800 active:scale-98 sm:w-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          <span>Guardar y Continuar a Equipo</span>
        </button>
      </div>
    </form>
  );
}
