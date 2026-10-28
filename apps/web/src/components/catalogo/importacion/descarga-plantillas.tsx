'use client';

import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import type { FormatoConPlantilla } from '../../../lib/importaciones-api';
import { listarFormatosYPlantillasApi } from '../../../lib/importaciones-api';
import { generarCsvPlantilla } from '../../../lib/importacion-logica';

interface DescargaPlantillasProps {
  alElegirParaImportar?: (formato: FormatoConPlantilla) => void;
}

export function DescargaPlantillas({ alElegirParaImportar }: DescargaPlantillasProps) {
  const [formatos, setFormatos] = useState<FormatoConPlantilla[]>([]);
  const [cargando, setCargando] = useState(true);
  const [descargado, setDescargado] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    async function cargar() {
      try {
        const datos = await listarFormatosYPlantillasApi();
        if (activo) setFormatos(datos);
      } finally {
        if (activo) setCargando(false);
      }
    }
    void cargar();
    return () => {
      activo = false;
    };
  }, []);

  const handleDescargar = (fmt: FormatoConPlantilla) => {
    const csvContent = generarCsvPlantilla(fmt.plantilla);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `plantilla-${fmt.formato}-viajapro.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDescargado(fmt.formato);
    setTimeout(() => setDescargado(null), 3000);
  };

  if (cargando) {
    return (
      <div
        data-testid="cargando-plantillas"
        className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Consultando plantillas y formatos oficiales...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="seccion-descarga-plantillas">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
            Plantillas Oficiales de Importación Masiva (CSV / Excel)
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Descarga la estructura oficial para cargar o actualizar excursiones y paquetes en bloque
            con el marcador #viajapro.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {formatos.map((fmt) => {
          const dias = fmt.plantilla.valoresPorDefecto.dias ?? 1;
          const noches = fmt.plantilla.valoresPorDefecto.noches ?? 0;
          const esPasadia = noches === 0;
          const colsCount = fmt.plantilla.columnas.length;
          const obligatoriasCount = fmt.plantilla.columnas.filter((c) => c.obligatoria).length;

          return (
            <div
              key={fmt.formato}
              data-testid={`tarjeta-plantilla-${fmt.formato}`}
              className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs transition-all hover:border-teal-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-teal-700"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                      <FileSpreadsheet className="h-5 w-5" />
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                        {fmt.nombre}
                      </h4>
                      <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                        {fmt.formato} • v{fmt.plantilla.version}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      esPasadia
                        ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300'
                        : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                    }`}
                  >
                    {esPasadia ? 'Pasadía / 1D' : `${dias}D / ${noches}N`}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                  {fmt.descripcion ??
                    `Plantilla para ${fmt.nombre.toLowerCase()} con ${colsCount} columnas (${obligatoriasCount} requeridas).`}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                    <span>
                      {dias} día{dias > 1 ? 's' : ''} / {noches} noche{noches > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-neutral-400" />
                    <span>{colsCount} columnas</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span>Marcador #viajapro</span>
                  </span>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleDescargar(fmt)}
                  data-testid={`btn-descargar-plantilla-${fmt.formato}`}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  {descargado === fmt.formato ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-400 dark:text-emerald-600" />
                      <span>¡Descargada!</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      <span>Descargar CSV</span>
                    </>
                  )}
                </button>

                {alElegirParaImportar && (
                  <button
                    type="button"
                    onClick={() => alElegirParaImportar(fmt)}
                    data-testid={`btn-importar-con-plantilla-${fmt.formato}`}
                    className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    <span>Importar con este formato</span>
                    <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
