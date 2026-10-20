'use client';

import React, { useState, useEffect } from 'react';
import { EnviarPlantilla, PlantillaWhatsApp, PlantillasDisponibles } from '@viajapro/contracts';
import { X, Send, ShieldCheck, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { obtenerMockPlantillasDisponibles } from '../../lib/mock-plantillas';
import {
  generarClaveIdempotencia,
  interpolarPlantilla,
  validarEnvioPlantilla,
} from '../../lib/plantillas-logica';
import { useFocoModal } from '../../lib/use-foco-modal';

interface ModalPlantillasProps {
  abierto: boolean;
  conversacionId: string;
  borradorPrevio?: string;
  onCerrar: () => void;
  onEnviarPlantilla: (envio: EnviarPlantilla, textoInterpolado: string) => void;
}

export function ModalPlantillas({
  abierto,
  conversacionId,
  borradorPrevio,
  onCerrar,
  onEnviarPlantilla,
}: ModalPlantillasProps) {
  const [catalogo] = useState<PlantillasDisponibles>(() => obtenerMockPlantillasDisponibles());
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<PlantillaWhatsApp | null>(
    null,
  );
  const [valoresVariables, setValoresVariables] = useState<string[]>([]);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const contenedorRef = useFocoModal<HTMLDivElement>({
    abierto,
    alCerrar: onCerrar,
  });

  // Inicializar con la primera plantilla aprobada
  useEffect(() => {
    if (catalogo.plantillas.length > 0 && !plantillaSeleccionada) {
      const primeraAprobada =
        catalogo.plantillas.find((p) => p.estado === 'APROBADA') ?? catalogo.plantillas[0];
      if (primeraAprobada) {
        setPlantillaSeleccionada(primeraAprobada);
        setValoresVariables(new Array(primeraAprobada.variables.length).fill(''));
      }
    }
  }, [catalogo, plantillaSeleccionada]);

  if (!abierto || !plantillaSeleccionada) return null;

  const cambiarPlantilla = (p: PlantillaWhatsApp) => {
    if (p.estado !== 'APROBADA') return;
    setPlantillaSeleccionada(p);
    setValoresVariables(new Array(p.variables.length).fill(''));
    setErrorValidacion(null);
  };

  const actualizarVariable = (indice: number, valor: string) => {
    const nuevos = [...valoresVariables];
    nuevos[indice] = valor;
    setValoresVariables(nuevos);
    setErrorValidacion(null);
  };

  const cuerpoInterpolado = interpolarPlantilla(plantillaSeleccionada.cuerpo, valoresVariables);

  const manejarEnvio = (e: React.FormEvent) => {
    e.preventDefault();

    const claveIdempotencia = generarClaveIdempotencia();
    const datosEnvio = {
      conversacionId,
      plantillaId: plantillaSeleccionada.id,
      idioma: plantillaSeleccionada.idioma,
      valores: valoresVariables,
      claveIdempotencia,
    };

    const validacion = validarEnvioPlantilla(datosEnvio);
    if (!validacion.success) {
      const mensaje =
        validacion.error.issues[0]?.message ?? 'Error al validar las variables de la plantilla.';
      setErrorValidacion(mensaje);
      return;
    }

    onEnviarPlantilla(validacion.data, cuerpoInterpolado);
    onCerrar();
  };

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-plantillas"
    >
      <div
        ref={contenedorRef}
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-400 flex h-9 w-9 items-center justify-center rounded-xl">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-plantillas"
                className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
              >
                Plantillas de WhatsApp (Meta HSM)
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Reapertura obligatoria por ventana de 24 horas vencida ({catalogo.aprobadas}{' '}
                aprobadas disponibles)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Cerrar modal"
            aria-label="Cerrar modal de plantillas"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Borrador previo conservado */}
        {borradorPrevio && borradorPrevio.trim().length > 0 && (
          <div className="border-b border-neutral-100 bg-amber-50/70 px-6 py-2.5 text-xs text-amber-900 dark:border-neutral-800 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="flex items-start space-x-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">Borrador conservado: </span>
                <span className="italic">«{borradorPrevio}»</span>
              </div>
            </div>
          </div>
        )}

        {/* Contenido con scroll */}
        <form
          onSubmit={manejarEnvio}
          className="flex flex-1 flex-col space-y-5 overflow-y-auto p-6"
        >
          {/* 1. Selector de Plantillas */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              1. Selecciona la plantilla registrada ante Meta:
            </label>
            <div className="space-y-2">
              {catalogo.plantillas.map((p) => {
                const seleccionada = plantillaSeleccionada.id === p.id;
                const esAprobada = p.estado === 'APROBADA';

                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={esAprobada ? 0 : -1}
                    aria-pressed={seleccionada}
                    onClick={() => cambiarPlantilla(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        cambiarPlantilla(p);
                      }
                    }}
                    className={`focus-visible:ring-acento-600 rounded-xl border p-3.5 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                      !esAprobada
                        ? 'cursor-not-allowed border-neutral-200 bg-neutral-100/70 opacity-60 dark:border-neutral-800 dark:bg-neutral-800/40'
                        : seleccionada
                          ? 'border-acento-600 bg-acento-50/50 dark:border-acento-500 dark:bg-acento-950/30 cursor-pointer'
                          : 'cursor-pointer border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.encabezado || p.nombre}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            p.categoria === 'UTILIDAD'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                          }`}
                        >
                          {p.categoria}
                        </span>
                      </div>

                      {/* Estado en Meta */}
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                          p.estado === 'APROBADA'
                            ? 'border-ok-200 bg-ok-50 text-ok-800 dark:border-ok-900 dark:bg-ok-950/50 dark:text-ok-300 border'
                            : p.estado === 'PAUSADA'
                              ? 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
                              : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
                        }`}
                      >
                        {p.estado === 'APROBADA'
                          ? '✓ Aprobada'
                          : p.estado === 'PAUSADA'
                            ? 'Pausada'
                            : 'Rechazada'}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                      «{p.cuerpo}»
                    </p>

                    {/* Explicación si no está aprobada */}
                    {!esAprobada && p.motivoEstado && (
                      <div className="mt-2 flex items-start space-x-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{p.motivoEstado}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Relleno de variables de la plantilla */}
          {plantillaSeleccionada.variables.length > 0 && (
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <label className="mb-2 block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                2. Completa los valores de las variables requeridas:
              </label>
              <div className="space-y-3">
                {plantillaSeleccionada.variables.map((v, i) => (
                  <div key={v.indice}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        Variable {'{{' + v.indice + '}}'}: {v.descripcion || 'Valor'}
                      </span>
                      {v.ejemplo && (
                        <span className="text-[11px] text-neutral-400">Ejemplo: {v.ejemplo}</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={valoresVariables[i] || ''}
                      onChange={(e) => actualizarVariable(i, e.target.value)}
                      placeholder={v.ejemplo ? `Ej: ${v.ejemplo}` : 'Ingresa el valor...'}
                      className="focus:border-acento-500 w-full rounded-xl border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                      required
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Vista previa del mensaje final resultante */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              3. Vista previa del mensaje que recibirá el viajero en WhatsApp:
            </label>
            <div className="border-ok-200 bg-ok-50/40 dark:border-ok-900/40 rounded-2xl border p-4 text-xs text-neutral-900 shadow-2xs dark:bg-neutral-800/60 dark:text-neutral-100">
              {plantillaSeleccionada.encabezado && (
                <p className="mb-1 font-bold text-neutral-800 dark:text-neutral-200">
                  {plantillaSeleccionada.encabezado}
                </p>
              )}
              <p className="leading-relaxed whitespace-pre-wrap">{cuerpoInterpolado}</p>
              {plantillaSeleccionada.pie && (
                <p className="mt-2 text-[10px] text-neutral-400">{plantillaSeleccionada.pie}</p>
              )}
              {plantillaSeleccionada.botones.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-200/60 pt-2 dark:border-neutral-700/60">
                  {plantillaSeleccionada.botones.map((b) => (
                    <span
                      key={b.texto}
                      className="text-acento-700 dark:text-acento-300 inline-flex items-center space-x-1 rounded-lg border border-neutral-200 bg-white px-3 py-1 text-[11px] font-medium shadow-2xs dark:border-neutral-600 dark:bg-neutral-700"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      <span>{b.texto}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Error de validación Zod con aviso dinámico accesible */}
          {errorValidacion && (
            <div
              role="alert"
              aria-live="assertive"
              className="animate-in fade-in rounded-xl bg-red-50 p-3 text-xs text-red-700 duration-150 dark:bg-red-950/50 dark:text-red-300"
            >
              {errorValidacion}
            </div>
          )}

          {/* Footer del Formulario */}
          <div className="flex items-center justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Al enviar, Meta audita y factura el mensaje de servicio.
            </span>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-acento-600 hover:bg-acento-700 flex items-center space-x-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Enviar plantilla</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
