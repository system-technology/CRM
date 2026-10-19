'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  X,
  Send,
  FileText,
  MapPin,
  Calendar,
  Users,
  DollarSign,
  ShieldCheck,
  Check,
} from 'lucide-react';
import {
  extraerDatosViajeDeMensajes,
  generarResumenConversacion,
  sugerirRespuestaComercial,
  calificarLead,
} from '../../lib/sugerencias-logica';

export interface PanelSugerenciasProps {
  mensajes: Array<{ texto: string; direccion: 'ENTRANTE' | 'SALIENTE' }>;
  contactoNombre: string;
  onInsertarRespuesta: (texto: string) => void;
  onCerrar: () => void;
}

export function PanelSugerencias({
  mensajes,
  contactoNombre,
  onInsertarRespuesta,
  onCerrar,
}: PanelSugerenciasProps) {
  const [copiado, setCopiado] = useState(false);

  // Extraer textos para análisis
  const textos = useMemo(() => mensajes.map((m) => m.texto), [mensajes]);

  // Ejecución de lógica heurística de sugerencias
  const datosViaje = useMemo(() => extraerDatosViajeDeMensajes(textos), [textos]);
  const resumen = useMemo(
    () => generarResumenConversacion(textos, contactoNombre),
    [textos, contactoNombre],
  );
  const respuestaSugerida = useMemo(
    () => sugerirRespuestaComercial(datosViaje, contactoNombre),
    [datosViaje, contactoNombre],
  );
  const leadScore = useMemo(() => calificarLead(datosViaje), [datosViaje]);

  const manejarInsertar = () => {
    onInsertarRespuesta(respuestaSugerida);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  const cotizadorHref = useMemo(() => {
    const params = new URLSearchParams();
    if (datosViaje.destino) params.set('destino', datosViaje.destino);
    if (datosViaje.adultos) params.set('adultos', String(datosViaje.adultos));
    if (datosViaje.ninos) params.set('ninos', String(datosViaje.ninos));
    return `/cotizador?${params.toString()}`;
  }, [datosViaje]);

  return (
    <div
      className="mb-3 overflow-hidden rounded-xl border border-purple-200 bg-purple-50/40 p-3.5 shadow-xs transition-all dark:border-purple-900/50 dark:bg-purple-950/20"
      role="region"
      aria-label="Asistente de Sugerencias Heurísticas"
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-purple-200/60 pb-2.5 dark:border-purple-900/40">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-600 text-white shadow-xs">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-bold text-purple-950 dark:text-purple-200">
            Sugerencias Automáticas — Reglas Heurísticas
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              leadScore.nivel === 'ALTO'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : leadScore.nivel === 'MEDIO'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                  : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            Lead {leadScore.nivel} ({leadScore.puntuacion} pts)
          </span>
        </div>

        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md p-1 text-neutral-400 hover:bg-purple-100 hover:text-neutral-600 dark:hover:bg-purple-900/40 dark:hover:text-neutral-200"
          title="Cerrar sugerencias"
          aria-label="Cerrar sugerencias"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Columna Izquierda: Variables Extraídas y Resumen */}
        <div className="space-y-2.5">
          {/* Variables de Viaje */}
          <div className="rounded-lg border border-purple-100 bg-white/80 p-2.5 text-[11px] dark:border-neutral-800 dark:bg-neutral-900/80">
            <span className="font-bold text-neutral-700 dark:text-neutral-300">
              Datos Detectados en el Chat:
            </span>
            <div className="mt-2 grid grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-400">
              <div className="flex items-center gap-1.5 truncate">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                <span className="truncate">
                  {datosViaje.destino ? (
                    <strong className="text-neutral-800 dark:text-neutral-200">
                      {datosViaje.destino}
                    </strong>
                  ) : (
                    'Por definir'
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <Users className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                <span>
                  {datosViaje.adultos} adt{datosViaje.ninos > 0 ? `, ${datosViaje.ninos} chd` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                <span className="truncate">{datosViaje.fechasTentativas || 'Flexible'}</span>
              </div>
              <div className="flex items-center gap-1.5 truncate">
                <DollarSign className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                <span className="truncate">
                  {datosViaje.presupuestoEstimadoCop ? (
                    <strong className="text-emerald-600 dark:text-emerald-400">
                      ${datosViaje.presupuestoEstimadoCop.toLocaleString('es-CO')}
                    </strong>
                  ) : (
                    'No indicado'
                  )}
                </span>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
              <span className="text-[10px] text-neutral-400">
                Justificación: {leadScore.justificacion}
              </span>
              <Link
                href={cotizadorHref}
                className="flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300"
              >
                <FileText className="h-3 w-3" />
                <span>Precargar Cotizador</span>
              </Link>
            </div>
          </div>

          {/* Resumen del Hilo */}
          <div className="rounded-lg border border-purple-100 bg-white/80 p-2.5 text-[11px] dark:border-neutral-800 dark:bg-neutral-900/80">
            <span className="font-bold text-neutral-700 dark:text-neutral-300">
              Resumen Ejecutivo de la Consulta:
            </span>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-neutral-600 dark:text-neutral-400">
              {resumen.puntosClave.map((punto, i) => (
                <li key={i} className="leading-tight">
                  {punto}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Columna Derecha: Respuesta Sugerida con Aprobación Humana */}
        <div className="flex flex-col justify-between rounded-lg border border-purple-100 bg-white/80 p-3 dark:border-neutral-800 dark:bg-neutral-900/80">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-300">
                Respuesta Comercial Sugerida:
              </span>
              <div
                title="Regla de Negocio: Ninguna sugerencia se envía al cliente sin previa revisión y aprobación humana."
                className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400"
              >
                <ShieldCheck className="h-3 w-3" />
                <span className="font-semibold">Revisión humana</span>
              </div>
            </div>

            <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5 font-sans text-xs leading-relaxed text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200">
              &ldquo;{respuestaSugerida}&rdquo;
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
            <p className="text-[10px] text-neutral-400">
              {copiado
                ? '✅ Insertada en el editor. Modifícala antes de enviar.'
                : 'Inserta el texto en el compositor para editarlo.'}
            </p>

            <button
              type="button"
              onClick={manejarInsertar}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-all ${
                copiado ? 'bg-emerald-600' : 'bg-purple-600 hover:bg-purple-700 active:scale-95'
              }`}
            >
              {copiado ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              <span>{copiado ? 'Insertada' : 'Insertar en borrador'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
