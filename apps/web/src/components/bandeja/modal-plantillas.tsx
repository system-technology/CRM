'use client';

import React, { useState } from 'react';
import { X, Send, ShieldCheck } from 'lucide-react';

export interface PlantillaHSM {
  id: string;
  nombre: string;
  categoria: 'UTILIDAD' | 'MARKETING';
  texto: string;
}

const PLANTILLAS_PREDEFINIDAS: PlantillaHSM[] = [
  {
    id: 'seguimiento_cotizacion',
    nombre: 'Seguimiento de Cotización',
    categoria: 'UTILIDAD',
    texto:
      'Hola, quisiéramos saber si tuviste oportunidad de revisar la cotización enviada para tu viaje. Quedamos atentos para resolver cualquier duda.',
  },
  {
    id: 'confirmacion_disponibilidad',
    nombre: 'Confirmación de Disponibilidad',
    categoria: 'UTILIDAD',
    texto:
      'Hola, te informamos que los cupos y tarifas consultadas siguen disponibles por tiempo limitado. ¿Deseas proceder con la reserva?',
  },
  {
    id: 'reapertura_consulta',
    nombre: 'Reapertura de Asesoría',
    categoria: 'UTILIDAD',
    texto:
      'Hola, gracias por contactar a ViajaPro. Tu asesor de viajes está listo para continuar con tu consulta en cuanto nos confirmes.',
  },
];

interface ModalPlantillasProps {
  abierto: boolean;
  onCerrar: () => void;
  onSeleccionarPlantilla: (plantilla: PlantillaHSM) => void;
}

export function ModalPlantillas({
  abierto,
  onCerrar,
  onSeleccionarPlantilla,
}: ModalPlantillasProps) {
  const [seleccionada, setSeleccionada] = useState<PlantillaHSM>(PLANTILLAS_PREDEFINIDAS[0]!);

  if (!abierto) return null;

  const manejarEnvio = () => {
    onSeleccionarPlantilla(seleccionada);
    onCerrar();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-plantillas"
    >
      <div
        className="flex w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-400 rounded-md p-1.5">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-plantillas"
                className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
              >
                Plantillas de WhatsApp (Meta HSM)
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Reapertura de canal fuera de la ventana de servicio de 24 horas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Cerrar modal (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lista de plantillas */}
        <div className="space-y-3 py-4">
          <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            Selecciona una plantilla aprobada por Meta:
          </label>
          <div className="space-y-2">
            {PLANTILLAS_PREDEFINIDAS.map((p) => {
              const esActiva = seleccionada.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSeleccionada(p)}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    esActiva
                      ? 'border-acento-600 bg-acento-50/50 dark:border-acento-500 dark:bg-acento-950/30'
                      : 'border-neutral-200 bg-neutral-50/50 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:bg-neutral-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                      {p.nombre}
                    </span>
                    <span className="border-ok-200 bg-ok-50 py-0.2 text-ok-700 dark:border-ok-800 dark:bg-ok-950/40 dark:text-ok-400 rounded-xs border px-1.5 text-[9px] font-semibold">
                      ✓ Aprobada
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                    «{p.texto}»
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <p className="text-[11px] text-neutral-400">
            Al enviar, se reinicia la ventana de 24 h cuando el cliente responda.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCerrar}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={manejarEnvio}
              className="bg-acento-700 hover:bg-acento-800 flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Enviar plantilla</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
