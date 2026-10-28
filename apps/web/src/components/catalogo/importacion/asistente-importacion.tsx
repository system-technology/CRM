'use client';

import React, { useState, useEffect } from 'react';
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Check,
  ShieldCheck,
  Loader2,
  X,
  Key,
} from 'lucide-react';
import type {
  DescriptorDePlantilla,
  TablaDeImportacion,
  RespuestaDePrevisualizacion,
  RespuestaDeConfirmacion,
} from '@viajapro/contracts';
import { PLANTILLAS_DE_SISTEMA } from '@viajapro/contracts';
import {
  parsearCsvAImportacion,
  sugerirMapeoLocal,
  construirMapeoDeColumnas,
  clasificarInformeDeImportacion,
} from '../../../lib/importacion-logica';
import {
  sugerirMapeoApi,
  previsualizarImportacionApi,
  confirmarImportacionApi,
} from '../../../lib/importaciones-api';

interface AsistenteImportacionProps {
  abierto: boolean;
  alCerrar: () => void;
  alFinalizarImportacion?: () => void;
  formatoInicial?: string;
}

type Paso = 1 | 2 | 3 | 4;

export function AsistenteImportacion({
  abierto,
  alCerrar,
  alFinalizarImportacion,
  formatoInicial = 'excursion-un-dia',
}: AsistenteImportacionProps) {
  const [paso, setPaso] = useState<Paso>(1);
  const [cargando, setCargando] = useState(false);
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);

  // Paso 1: Archivo y configuración
  const [textoCsv, setTextoCsv] = useState('');
  const [formatoSeleccionado, setFormatoSeleccionado] = useState(formatoInicial);
  const [moneda, setMoneda] = useState<'COP' | 'USD' | 'EUR' | 'MXN'>('COP');
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [marcadorDetectado, setMarcadorDetectado] = useState<string | null>(null);

  // Paso 2: Tabla y Mapeo
  const [tablaParseada, setTablaParseada] = useState<TablaDeImportacion | null>(null);
  const [mapeoManual, setMapeoManual] = useState<Record<string, number>>({});
  const [confianzas, setConfianzas] = useState<Record<string, number>>({});
  const [formatoFecha, setFormatoFecha] = useState<'DD/MM/AAAA' | 'MM/DD/AAAA'>('DD/MM/AAAA');

  // Paso 3: Previsualización
  const [previsualizacion, setPrevisualizacion] = useState<RespuestaDePrevisualizacion | null>(
    null,
  );
  const [filtroFilas, setFiltroFilas] = useState<'TODOS' | 'VALIDOS' | 'ADVERTENCIAS' | 'ERRORES'>(
    'TODOS',
  );

  // Paso 4: Confirmación
  const [resultado, setResultado] = useState<RespuestaDeConfirmacion | null>(null);

  // Plantilla activa según formato
  const plantillaActiva: DescriptorDePlantilla =
    PLANTILLAS_DE_SISTEMA.find((p) => p.formato === formatoSeleccionado) ??
    PLANTILLAS_DE_SISTEMA[0]!;

  useEffect(() => {
    if (formatoInicial) {
      setFormatoSeleccionado(formatoInicial);
    }
  }, [formatoInicial]);

  if (!abierto) return null;

  // 1. Manejo de lectura de archivo
  const procesarTextoCsv = (contenido: string, nombre?: string) => {
    try {
      setErrorGlobal(null);
      setTextoCsv(contenido);
      if (nombre) setNombreArchivo(nombre);

      const parseado = parsearCsvAImportacion(contenido);
      setTablaParseada(parseado.tabla);

      if (parseado.marcador) {
        setMarcadorDetectado(
          parseado.marcadorCrudo ?? `#viajapro;plantilla=${parseado.marcador.formato}`,
        );
        setFormatoSeleccionado(parseado.marcador.formato);
      } else {
        setMarcadorDetectado(null);
      }
    } catch (err) {
      setErrorGlobal((err as Error).message);
    }
  };

  const handleArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      procesarTextoCsv(content, file.name);
    };
    reader.readAsText(file, 'utf-8');
  };

  // 2. Avanzar a Paso 2 (Mapeo)
  const avanzarAMapeo = async () => {
    if (!tablaParseada) {
      try {
        procesarTextoCsv(textoCsv, nombreArchivo ?? 'archivo.csv');
      } catch {
        setErrorGlobal('Por favor sube un archivo CSV o pega el contenido para continuar');
        return;
      }
    }

    if (!tablaParseada || tablaParseada.encabezados.length === 0) {
      setErrorGlobal('El archivo no contiene encabezados legibles');
      return;
    }

    setCargando(true);
    setErrorGlobal(null);

    try {
      // Solicita sugerencia al servidor o fallback local
      const sugerencia = await sugerirMapeoApi(
        {
          encabezados: tablaParseada.encabezados,
          marcador: marcadorDetectado ?? undefined,
          formato: formatoSeleccionado,
        },
        plantillaActiva,
      );

      const nuevoMapeo: Record<string, number> = {};
      const nuevasConfianzas: Record<string, number> = {};

      for (const [clave, match] of Object.entries(sugerencia.columnas)) {
        nuevoMapeo[clave] = match.indice;
        nuevasConfianzas[clave] = match.confianza;
      }

      setMapeoManual(nuevoMapeo);
      setConfianzas(nuevasConfianzas);
      setPaso(2);
    } catch {
      // Fallback local garantizado
      const local = sugerirMapeoLocal(tablaParseada.encabezados, plantillaActiva);
      const nuevoMapeo: Record<string, number> = {};
      const nuevasConfianzas: Record<string, number> = {};
      for (const [clave, match] of Object.entries(local.columnas)) {
        nuevoMapeo[clave] = match.indice;
        nuevasConfianzas[clave] = match.confianza;
      }
      setMapeoManual(nuevoMapeo);
      setConfianzas(nuevasConfianzas);
      setPaso(2);
    } finally {
      setCargando(false);
    }
  };

  // 3. Avanzar a Paso 3 (Previsualización)
  const avanzarAPrevisualizar = async () => {
    if (!tablaParseada) return;

    // Verificar que todas las columnas obligatorias tengan un índice asignado
    const obligatoriasFaltantes = plantillaActiva.columnas
      .filter((c) => c.obligatoria)
      .filter((c) => mapeoManual[c.clave] === undefined || mapeoManual[c.clave] === -1);

    if (obligatoriasFaltantes.length > 0) {
      setErrorGlobal(
        `Debes asignar las siguientes columnas obligatorias: ${obligatoriasFaltantes.map((c) => c.etiqueta).join(', ')}`,
      );
      return;
    }

    setCargando(true);
    setErrorGlobal(null);

    try {
      const mapeo = construirMapeoDeColumnas(
        formatoSeleccionado,
        mapeoManual,
        moneda,
        formatoFecha,
      );

      const res = await previsualizarImportacionApi({
        tabla: tablaParseada,
        mapeo,
      });

      setPrevisualizacion(res);
      setPaso(3);
    } catch (err) {
      setErrorGlobal((err as Error).message || 'Error al previsualizar la importación');
    } finally {
      setCargando(false);
    }
  };

  // 4. Confirmar en Paso 4
  const confirmarImportacion = async () => {
    if (!tablaParseada || !previsualizacion) return;

    setCargando(true);
    setErrorGlobal(null);

    try {
      const mapeo = construirMapeoDeColumnas(
        formatoSeleccionado,
        mapeoManual,
        moneda,
        formatoFecha,
      );

      const res = await confirmarImportacionApi({
        tabla: tablaParseada,
        mapeo,
        huella: previsualizacion.huella,
      });

      setResultado(res);
      setPaso(4);
    } catch (err) {
      setErrorGlobal(
        (err as Error).message || 'Error al confirmar la importación en la base de datos',
      );
    } finally {
      setCargando(false);
    }
  };

  // Clasificación para el paso 3
  const clasificacion = previsualizacion
    ? clasificarInformeDeImportacion(previsualizacion.informe)
    : null;

  const elementosFiltrados =
    previsualizacion?.informe.elementos.filter((el) => {
      if (filtroFilas === 'VALIDOS') return el.nivel === 'OK';
      if (filtroFilas === 'ADVERTENCIAS') return el.nivel === 'AVISO';
      if (filtroFilas === 'ERRORES') return el.nivel === 'ERROR';
      return true;
    }) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-asistente-importacion"
      data-testid="asistente-importacion-modal"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera del Asistente */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h2
                id="titulo-asistente-importacion"
                className="text-base font-bold text-neutral-900 dark:text-white"
              >
                Asistente de Importación de Catálogo (T-029)
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Paso {paso} de 4 —{' '}
                {paso === 1
                  ? 'Subir archivo y formato'
                  : paso === 2
                    ? 'Mapeo de columnas'
                    : paso === 3
                      ? 'Previsualización y validación por fila'
                      : 'Confirmación atómica'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={alCerrar}
            data-testid="boton-cerrar-asistente"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar asistente"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de progreso de 4 etapas */}
        <div className="border-b border-neutral-100 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between text-xs font-semibold">
            {[
              { num: 1, label: '1. Archivo' },
              { num: 2, label: '2. Mapeo' },
              { num: 3, label: '3. Previsualizar' },
              { num: 4, label: '4. Confirmar' },
            ].map((p) => {
              const activo = paso === p.num;
              const completado = paso > p.num;

              return (
                <div
                  key={p.num}
                  className={`flex items-center gap-2 ${
                    activo
                      ? 'text-teal-700 dark:text-teal-400'
                      : completado
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                      activo
                        ? 'bg-teal-600 text-white'
                        : completado
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}
                  >
                    {completado ? <Check className="h-3.5 w-3.5" /> : p.num}
                  </span>
                  <span className="hidden sm:inline">{p.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mensaje de Error Global */}
        {errorGlobal && (
          <div
            role="alert"
            data-testid="error-global-asistente"
            className="m-6 mb-0 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>{errorGlobal}</span>
          </div>
        )}

        {/* Cuerpo del Asistente según el Paso */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* PASO 1: SUBIR ARCHIVO */}
          {paso === 1 && (
            <div className="space-y-5" data-testid="paso-1-archivo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="select-formato-importacion"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    Formato de producto esperado *
                  </label>
                  <select
                    id="select-formato-importacion"
                    data-testid="select-formato-importacion"
                    value={formatoSeleccionado}
                    onChange={(e) => setFormatoSeleccionado(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs text-neutral-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    {PLANTILLAS_DE_SISTEMA.map((p) => (
                      <option key={p.formato} value={p.formato}>
                        {p.nombre} ({p.valoresPorDefecto.dias ?? 1}D /{' '}
                        {p.valoresPorDefecto.noches ?? 0}N)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="select-moneda-importacion"
                    className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                  >
                    Moneda base por defecto *
                  </label>
                  <select
                    id="select-moneda-importacion"
                    data-testid="select-moneda-importacion"
                    value={moneda}
                    onChange={(e) => setMoneda(e.target.value as 'COP' | 'USD' | 'EUR' | 'MXN')}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs text-neutral-900 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="COP">COP ($) — Pesos colombianos</option>
                    <option value="USD">USD ($) — Dólares estadounidenses</option>
                    <option value="EUR">EUR (€) — Euros</option>
                    <option value="MXN">MXN ($) — Pesos mexicanos</option>
                  </select>
                </div>
              </div>

              {/* Zona Drag & Drop / Input File */}
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50/30 p-8 text-center dark:border-teal-800 dark:bg-teal-950/10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300">
                  <Upload className="h-6 w-6" />
                </div>
                <h4 className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                  {nombreArchivo ? nombreArchivo : 'Selecciona o arrastra tu archivo CSV'}
                </h4>
                <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
                  Archivos delimitados por comas o punto y coma (.csv) con encabezados en la primera
                  o segunda fila.
                </p>

                <input
                  id="input-archivo-csv"
                  data-testid="input-archivo-csv"
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleArchivoSeleccionado}
                  className="mt-4 block text-xs text-neutral-600 file:mr-4 file:rounded-xl file:border-0 file:bg-teal-600 file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-white hover:file:bg-teal-700"
                />

                {marcadorDetectado && (
                  <div
                    data-testid="aviso-marcador-detectado"
                    className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>
                      Marcador oficial detectado: <code>{marcadorDetectado}</code>
                    </span>
                  </div>
                )}
              </div>

              {/* Pegar CSV directamente como alternativa */}
              <div>
                <label
                  htmlFor="textarea-contenido-csv"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  O pega el contenido CSV directamente:
                </label>
                <textarea
                  id="textarea-contenido-csv"
                  data-testid="textarea-contenido-csv"
                  rows={4}
                  value={textoCsv}
                  onChange={(e) => procesarTextoCsv(e.target.value)}
                  placeholder={`#viajapro;plantilla=excursion-un-dia;version=1\nCódigo,Nombre del producto,Destino,Valor base COP\nSMR-001,Pasadía Tayrona,Santa Marta,220000`}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 font-mono text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* PASO 2: MAPEO DE COLUMNAS */}
          {paso === 2 && (
            <div className="space-y-5" data-testid="paso-2-mapeo">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <h4 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Correspondencia de Columnas
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Verifica cómo se mapean las columnas de tu archivo a los atributos de{' '}
                    {plantillaActiva.nombre}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="select-formato-fecha"
                    className="text-xs text-neutral-600 dark:text-neutral-400"
                  >
                    Formato de fechas:
                  </label>
                  <select
                    id="select-formato-fecha"
                    data-testid="select-formato-fecha"
                    value={formatoFecha}
                    onChange={(e) => setFormatoFecha(e.target.value as 'DD/MM/AAAA' | 'MM/DD/AAAA')}
                    className="min-h-[36px] rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    <option value="DD/MM/AAAA">DD/MM/AAAA (Colombia / LATAM)</option>
                    <option value="MM/DD/AAAA">MM/DD/AAAA (EE. UU.)</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 font-bold text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3">Campo requerido</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Columna en tu archivo</th>
                      <th className="px-4 py-3 text-center">Confianza</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {plantillaActiva.columnas.map((col) => {
                      const indiceAsignado = mapeoManual[col.clave] ?? -1;
                      const confianza = confianzas[col.clave] ?? 0;

                      return (
                        <tr
                          key={col.clave}
                          className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30"
                        >
                          <td className="px-4 py-3">
                            <span className="font-semibold text-neutral-900 dark:text-white">
                              {col.etiqueta}
                            </span>
                            {col.obligatoria && (
                              <span className="ml-1 font-bold text-red-500">*</span>
                            )}
                            <span className="block font-mono text-[10px] text-neutral-400">
                              {col.clave}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {col.tipo}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              data-testid={`select-mapeo-${col.clave}`}
                              value={indiceAsignado}
                              onChange={(e) => {
                                const nuevoIdx = parseInt(e.target.value, 10);
                                setMapeoManual((prev) => ({
                                  ...prev,
                                  [col.clave]: nuevoIdx,
                                }));
                              }}
                              className={`min-h-[36px] w-full max-w-xs rounded-xl border px-3 py-1.5 text-xs ${
                                indiceAsignado !== -1
                                  ? 'border-neutral-300 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white'
                                  : col.obligatoria
                                    ? 'border-amber-400 bg-amber-50/40 text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200'
                                    : 'border-neutral-200 bg-neutral-50 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/50'
                              }`}
                            >
                              <option value={-1}>-- No asignar (sin columna) --</option>
                              {tablaParseada?.encabezados.map((enc, idx) => (
                                <option key={idx} value={idx}>
                                  Columna {idx + 1}: {enc}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-4 py-3 text-center">
                            {indiceAsignado !== -1 ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  confianza >= 0.9
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {Math.round(confianza * 100)}%
                              </span>
                            ) : (
                              <span className="text-[10px] text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PASO 3: PREVISUALIZACIÓN Y VALIDACIÓN POR FILA */}
          {paso === 3 && clasificacion && (
            <div className="space-y-5" data-testid="paso-3-previsualizar">
              {/* Resumen KPIs de impacto */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
                  <p className="text-[10px] font-bold text-neutral-400 uppercase">Total filas</p>
                  <p
                    className="cifra mt-1 text-xl font-bold text-neutral-900 dark:text-white"
                    data-testid="kpi-previs-total"
                  >
                    {clasificacion.total}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs dark:border-emerald-950 dark:bg-emerald-950/20">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-400">
                    A crear
                  </p>
                  <p
                    className="cifra mt-1 text-xl font-bold text-emerald-900 dark:text-emerald-200"
                    data-testid="kpi-previs-creados"
                  >
                    {clasificacion.creados}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3.5 shadow-2xs dark:border-sky-950 dark:bg-sky-950/20">
                  <p className="text-[10px] font-bold text-sky-700 uppercase dark:text-sky-400">
                    A actualizar
                  </p>
                  <p
                    className="cifra mt-1 text-xl font-bold text-sky-900 dark:text-sky-200"
                    data-testid="kpi-previs-actualizados"
                  >
                    {clasificacion.actualizados}
                  </p>
                </div>
                <div
                  className={`rounded-xl border p-3.5 shadow-2xs ${
                    clasificacion.tieneErroresBloqueantes
                      ? 'border-red-200 bg-red-50/60 dark:border-red-950 dark:bg-red-950/30'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <p
                    className={`text-[10px] font-bold uppercase ${
                      clasificacion.tieneErroresBloqueantes
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-neutral-400'
                    }`}
                  >
                    Errores fila
                  </p>
                  <p
                    className={`cifra mt-1 text-xl font-bold ${
                      clasificacion.tieneErroresBloqueantes
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-neutral-500 dark:text-neutral-400'
                    }`}
                    data-testid="kpi-previs-errores"
                  >
                    {clasificacion.errores.length}
                  </p>
                </div>
              </div>

              {/* Tarjeta de Huella Digital SHA-256 */}
              {previsualizacion && (
                <div
                  data-testid="tarjeta-huella-sha256"
                  className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-800/40"
                >
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-neutral-400" />
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      Huella digital de la propuesta (SHA-256):
                    </span>
                  </div>
                  <code className="font-mono text-[11px] text-teal-700 dark:text-teal-400">
                    {previsualizacion.huella.slice(0, 16)}...{previsualizacion.huella.slice(-16)}
                  </code>
                </div>
              )}

              {/* Advertencia si hay errores bloqueantes */}
              {clasificacion.tieneErroresBloqueantes && (
                <div
                  data-testid="aviso-errores-bloqueantes"
                  className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <strong className="font-semibold">
                      La propuesta contiene errores bloqueantes:
                    </strong>
                    <p className="mt-0.5 leading-relaxed">
                      El servidor aplica la política «todo o nada» (código HTTP 422). Corrige las
                      filas marcadas en rojo antes de confirmar la importación.
                    </p>
                  </div>
                </div>
              )}

              {/* Filtros de la tabla de filas */}
              <div className="flex gap-1.5 border-b border-neutral-200 pb-2 dark:border-neutral-800">
                {[
                  { id: 'TODOS', label: `Todas (${clasificacion.total})` },
                  { id: 'VALIDOS', label: 'Válidas' },
                  {
                    id: 'ADVERTENCIAS',
                    label: `Advertencias (${clasificacion.advertencias.length})`,
                  },
                  { id: 'ERRORES', label: `Errores (${clasificacion.errores.length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltroFilas(f.id as typeof filtroFilas)}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                      filtroFilas === f.id
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Tabla de filas */}
              <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 font-bold text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-2.5">Fila</th>
                      <th className="px-4 py-2.5">Severidad</th>
                      <th className="px-4 py-2.5">Mensaje del núcleo</th>
                      <th className="px-4 py-2.5">Campo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {elementosFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-neutral-400">
                          No hay elementos en este filtro.
                        </td>
                      </tr>
                    ) : (
                      elementosFiltrados.map((el, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/20"
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-neutral-600 dark:text-neutral-400">
                            {el.procedencia?.fila ? `#${el.procedencia.fila}` : '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                el.nivel === 'ERROR'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                  : el.nivel === 'AVISO'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {el.nivel === 'ERROR' ? (
                                <AlertCircle className="h-3 w-3" />
                              ) : el.nivel === 'AVISO' ? (
                                <AlertTriangle className="h-3 w-3" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              <span>{el.nivel}</span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-neutral-800 dark:text-neutral-200">
                            {el.mensaje}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-400">
                            {el.procedencia?.columna ?? el.ruta ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PASO 4: RESULTADO Y CONFIRMACIÓN EXITOSA */}
          {paso === 4 && resultado && (
            <div
              data-testid="paso-4-resultado"
              className="flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base font-bold text-neutral-900 dark:text-white">
                ¡Catálogo Importado Exitosamente!
              </h3>
              <p className="mt-1 max-w-md text-xs text-neutral-600 dark:text-neutral-300">
                La propuesta fue procesada y consolidada de forma atómica bajo la política del
                ADR-0017.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                  <p className="text-xs text-neutral-500">Paquetes procesados</p>
                  <p className="cifra mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                    {resultado.paquetes.length}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                  <p className="text-xs text-neutral-500">Nuevos creados</p>
                  <p className="cifra mt-1 text-2xl font-black text-teal-700 dark:text-teal-400">
                    {resultado.informe.resumen['creados'] ?? resultado.paquetes.length}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Barra Inferior con Botones de Navegación */}
        <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div>
            {paso > 1 && paso < 4 && (
              <button
                type="button"
                onClick={() => setPaso((p) => (p - 1) as Paso)}
                disabled={cargando}
                data-testid="boton-volver-paso"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Volver</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {paso === 1 && (
              <button
                type="button"
                onClick={() => {
                  void avanzarAMapeo();
                }}
                disabled={cargando || (!textoCsv && !tablaParseada)}
                data-testid="boton-avanzar-a-mapeo"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                {cargando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Continuar al Mapeo</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}

            {paso === 2 && (
              <button
                type="button"
                onClick={() => {
                  void avanzarAPrevisualizar();
                }}
                disabled={cargando}
                data-testid="boton-avanzar-a-previsualizar"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50"
              >
                {cargando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Previsualizar Catálogo</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            )}

            {paso === 3 && (
              <button
                type="button"
                onClick={() => {
                  void confirmarImportacion();
                }}
                disabled={cargando || (clasificacion?.tieneErroresBloqueantes ?? false)}
                data-testid="boton-confirmar-importacion"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {cargando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Confirmar y Aplicar (Todo o Nada)</span>
                  </>
                )}
              </button>
            )}

            {paso === 4 && (
              <button
                type="button"
                onClick={() => {
                  alFinalizarImportacion?.();
                  alCerrar();
                }}
                data-testid="boton-cerrar-finalizado"
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
              >
                <span>Cerrar y Ver Catálogo</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
