'use client';

import React from 'react';
import Link from 'next/link';
import { type EventoLineaTiempo360 } from '../../lib/contacto-360-logica';
import {
  UserCheck,
  Kanban,
  FileText,
  Clock,
  CheckCircle2,
  MessageSquare,
  Plane,
  ChevronRight,
} from 'lucide-react';
import { formatearFecha } from '../../lib/formato';
import { AvisoVacio } from '../comun/esqueletos';

interface LineaTiempo360Props {
  eventos: readonly EventoLineaTiempo360[];
}

export function LineaTiempo360({ eventos }: LineaTiempo360Props) {
  if (eventos.length === 0) {
    return (
      <AvisoVacio
        titulo="Sin actividad registrada"
        descripcion="Este contacto aún no tiene eventos, cotizaciones ni seguimientos en su historial."
      />
    );
  }

  const renderIcono = (icono: EventoLineaTiempo360['icono'], estado?: string) => {
    switch (icono) {
      case 'contacto':
        return <UserCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />;
      case 'oportunidad':
        return <Kanban className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'cotizacion':
        return <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case 'seguimiento':
        return estado === 'completado' ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Clock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        );
      case 'nota':
        return <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      case 'viaje':
        return <Plane className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />;
      default:
        return <CheckCircle2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />;
    }
  };

  const badgeColorClass = (tipo: EventoLineaTiempo360['tipo'], estado?: string) => {
    if (estado === 'completado') {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
    }
    switch (tipo) {
      case 'CREACION_CONTACTO':
        return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800';
      case 'OPORTUNIDAD':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
      case 'COTIZACION':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
      case 'SEGUIMIENTO':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
      case 'NOTA_INTERNA':
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700';
      case 'VIAJE_CONFIRMADO':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800';
      default:
        return 'bg-neutral-100 text-neutral-700 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  return (
    <div className="relative space-y-6 pl-6 before:absolute before:top-3 before:bottom-3 before:left-[11px] before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
      {eventos.map((evento) => (
        <div key={evento.id} className="group relative">
          {/* Nodo / Hito */}
          <div className="absolute top-1 -left-[30px] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-neutral-100 shadow-2xs transition-transform group-hover:scale-110 dark:border-neutral-900 dark:bg-neutral-800">
            {renderIcono(evento.icono, evento.estado)}
          </div>

          {/* Tarjeta de Evento */}
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs transition-shadow hover:shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${badgeColorClass(
                    evento.tipo,
                    evento.estado,
                  )}`}
                >
                  {evento.etiquetaBadge}
                </span>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {evento.titulo}
                </h3>
              </div>
              <time
                dateTime={evento.fechaIso}
                className="cifra text-xs text-neutral-500 dark:text-neutral-400"
              >
                {formatearFecha(evento.fechaIso, { conHora: true })}
              </time>
            </div>

            {evento.descripcion && (
              <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                {evento.descripcion}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-400 dark:border-neutral-800/60 dark:text-neutral-500">
              <span>{evento.autor ? `Por ${evento.autor}` : 'Registro de sistema'}</span>
              {evento.enlace && (
                <Link
                  href={evento.enlace}
                  className="inline-flex items-center gap-1 font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                >
                  <span>Ver detalle</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
