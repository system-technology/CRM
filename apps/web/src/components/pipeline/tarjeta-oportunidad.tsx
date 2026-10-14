'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { EtapaDefinida, Oportunidad } from '@viajapro/contracts';
import {
  MapPin,
  Clock,
  Calendar,
  AlertTriangle,
  MessageSquare,
  ArrowRightLeft,
  ChevronDown,
} from 'lucide-react';
import {
  esTareaAtrasada,
  formatearDineroCifra,
  formatearTiempoRelativo,
  formatearFechaTarea,
  NOMBRES_MOTIVOS_PERDIDA,
} from '../../lib/pipeline-logica';
import { generarColorAvatar, obtenerIniciales } from '../../lib/bandeja-logica';

interface TarjetaOportunidadProps {
  oportunidad: Oportunidad;
  /**
   * Las etapas de ESTA agencia, para el menú «mover a».
   *
   * Vienen del tablero y no de una lista fija: la agencia demo tiene siete etapas y las cinco
   * canónicas no las cubren. Construir el menú desde el vocabulario común dejaría dos destinos
   * fuera, y el asesor no podría mover una tarjeta a una columna que está viendo.
   */
  etapas: EtapaDefinida[];
  onSolicitarMover: (oportunidad: Oportunidad, nuevaEtapa: EtapaDefinida) => void;
}

export function TarjetaOportunidad({
  oportunidad,
  etapas,
  onSolicitarMover,
}: TarjetaOportunidadProps) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  const {
    id,
    titulo,
    destino,
    contactoNombre,
    contactoId,
    valorEstimado,
    probabilidad,
    ultimoContactoEn,
    proximaTarea,
    asesorNombre,
    etapa,
    motivoPerdida,
    notaPerdida,
  } = oportunidad;

  const atrasada = proximaTarea ? esTareaAtrasada(proximaTarea.venceEn) : false;
  const avatarColores = generarColorAvatar(contactoId);
  const iniciales = obtenerIniciales(contactoNombre, undefined);

  const etapasDisponibles = etapas.filter((e) => e.id !== etapa.id);

  const manejarDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={manejarDragStart}
      tabIndex={0}
      role="article"
      aria-label={`Oportunidad: ${titulo}, cliente ${contactoNombre || 'anónimo'}, etapa ${etapa.nombre}`}
      className="group relative cursor-grab rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs transition-all hover:border-neutral-300 hover:shadow-md active:cursor-grabbing dark:border-neutral-800 dark:bg-neutral-900/90 dark:hover:border-neutral-700"
    >
      {/* Fila superior: Destino + Probabilidad */}
      <div className="mb-2 flex items-center justify-between text-[11px]">
        {destino ? (
          <span className="flex items-center space-x-1 font-medium text-neutral-600 dark:text-neutral-400">
            <MapPin className="h-3 w-3 text-neutral-400 dark:text-neutral-500" />
            <span className="max-w-[140px] truncate">{destino}</span>
          </span>
        ) : (
          <span className="text-neutral-400">Destino por definir</span>
        )}

        {probabilidad !== null && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              probabilidad >= 75
                ? 'bg-ok-100 text-ok-800 dark:bg-ok-950 dark:text-ok-300'
                : probabilidad >= 40
                  ? 'bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300'
                  : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
            }`}
          >
            {probabilidad}%
          </span>
        )}
      </div>

      {/* Título de la oportunidad */}
      <h3 className="line-clamp-2 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
        {titulo}
      </h3>

      {/* Contacto / Viajero */}
      <div className="mt-2.5 flex items-center space-x-2">
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold select-none"
          style={{ backgroundColor: avatarColores.bg, color: avatarColores.text }}
        >
          {iniciales}
        </div>
        <span className="truncate text-xs text-neutral-700 dark:text-neutral-300">
          {contactoNombre || 'Viajero no identificado'}
        </span>
      </div>

      {/* Valor monetario .cifra */}
      <div className="mt-3 flex items-baseline justify-between border-t border-neutral-100 pt-2.5 dark:border-neutral-800/80">
        <span className="cifra text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {formatearDineroCifra(valorEstimado)}
        </span>
        <span className="flex items-center space-x-1 text-[10px] text-neutral-500 dark:text-neutral-400">
          <Clock className="h-2.5 w-2.5" />
          <span suppressHydrationWarning>{formatearTiempoRelativo(ultimoContactoEn)}</span>
        </span>
      </div>

      {/* Próxima Tarea (con alerta si está atrasada) */}
      {proximaTarea && (
        <div
          className={`mt-2.5 flex items-start space-x-2 rounded-xl p-2 text-[11px] ${
            atrasada
              ? 'border border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border border-neutral-100 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300'
          }`}
        >
          {atrasada ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
          ) : (
            <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{proximaTarea.descripcion}</p>
            <p className="text-[10px] opacity-80" suppressHydrationWarning>
              {atrasada ? 'Atrasada · ' : 'Vence · '}
              {formatearFechaTarea(proximaTarea.venceEn)}
            </p>
          </div>
        </div>
      )}

      {/* Motivo de pérdida si está en PERDIDA */}
      {etapa.esPerdida && motivoPerdida && (
        <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-semibold">{NOMBRES_MOTIVOS_PERDIDA[motivoPerdida]}</p>
          {notaPerdida && <p className="mt-0.5 text-[10px] opacity-90">{notaPerdida}</p>}
        </div>
      )}

      {/* Pie de tarjeta: Asesor asignado y Alternativa accesible por teclado */}
      <div className="mt-3 flex items-center justify-between pt-1">
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {asesorNombre || 'Sin asignar'}
        </span>

        <div className="flex items-center space-x-1.5">
          {/* Enlace rápido a chat */}
          <Link
            href="/bandeja"
            title="Abrir conversación en bandeja"
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Link>

          {/* Menú de accesibilidad por teclado para mover etapa */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuAbierto(!menuAbierto)}
              title="Mover de etapa con teclado"
              aria-haspopup="true"
              aria-expanded={menuAbierto}
              className="flex items-center space-x-0.5 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-[10px] text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <ArrowRightLeft className="h-2.5 w-2.5" />
              <ChevronDown className="h-2.5 w-2.5" />
            </button>

            {menuAbierto && (
              <div
                role="menu"
                className="absolute right-0 bottom-full z-20 mb-1 w-44 rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
              >
                <div className="border-b border-neutral-100 px-2 py-1 text-[9px] font-semibold text-neutral-400 uppercase dark:border-neutral-700">
                  Mover a etapa:
                </div>
                {etapasDisponibles.map((etapaDestino) => (
                  <button
                    key={etapaDestino.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuAbierto(false);
                      onSolicitarMover(oportunidad, etapaDestino);
                    }}
                    className="flex w-full items-center px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    {etapaDestino.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
