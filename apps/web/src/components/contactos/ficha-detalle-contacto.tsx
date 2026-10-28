'use client';

import React from 'react';
import Link from 'next/link';
import { type Contacto } from '@viajapro/contracts';
import { SeccionCamposPersonalizados } from './seccion-campos-personalizados';
import {
  X,
  Phone,
  Tag,
  Heart,
  ShieldCheck,
  Calendar,
  MessageSquare,
  FileText,
  Kanban,
  CheckCircle2,
} from 'lucide-react';
import { generarColorAvatar, obtenerIniciales } from '../../lib/bandeja-logica';
import { formatearTelefonoVisual } from '../../lib/contactos-logica';

interface FichaDetalleContactoProps {
  contacto: Contacto;
  onCerrar: () => void;
}

export function FichaDetalleContacto({ contacto, onCerrar }: FichaDetalleContactoProps) {
  const {
    id,
    nombre,
    telefono,
    correo,
    etiquetas,
    preferencias,
    consentimientos,
    creadoEn,
    ultimoContactoEn,
  } = contacto;

  const avatarColores = generarColorAvatar(id);
  const iniciales = obtenerIniciales(nombre, telefono);
  const tienePromocional = consentimientos.includes('PROMOCIONAL');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ficha-contacto"
      className="animate-in slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-2xl transition-transform duration-200 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <h2
          id="titulo-ficha-contacto"
          className="text-sm font-bold text-neutral-900 dark:text-neutral-100"
        >
          Ficha del Contacto
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          aria-label="Cerrar panel de detalle"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Contenido con Scroll */}
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {/* Identidad Principal */}
        <div className="flex items-center space-x-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold shadow-2xs select-none"
            style={{ backgroundColor: avatarColores.bg, color: avatarColores.text }}
          >
            {iniciales}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-neutral-900 dark:text-neutral-100">
              {nombre || 'Sin nombre registrado'}
            </h3>
            <p className="cifra text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {formatearTelefonoVisual(telefono)}
            </p>
            {correo && (
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{correo}</p>
            )}
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/bandeja"
            className="hover:bg-acento-50 hover:text-acento-700 dark:hover:bg-acento-950/40 dark:hover:text-acento-300 flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50/80 p-2.5 text-center text-xs font-semibold text-neutral-700 transition-colors dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300"
          >
            <MessageSquare className="text-acento-600 dark:text-acento-400 mb-1 h-4 w-4" />
            <span>Chat</span>
          </Link>

          <Link
            href="/cotizador"
            className="hover:bg-acento-50 hover:text-acento-700 dark:hover:bg-acento-950/40 dark:hover:text-acento-300 flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50/80 p-2.5 text-center text-xs font-semibold text-neutral-700 transition-colors dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300"
          >
            <FileText className="text-acento-600 dark:text-acento-400 mb-1 h-4 w-4" />
            <span>Cotizar</span>
          </Link>

          <Link
            href="/pipeline"
            className="hover:bg-acento-50 hover:text-acento-700 dark:hover:bg-acento-950/40 dark:hover:text-acento-300 flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50/80 p-2.5 text-center text-xs font-semibold text-neutral-700 transition-colors dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300"
          >
            <Kanban className="text-acento-600 dark:text-acento-400 mb-1 h-4 w-4" />
            <span>Pipeline</span>
          </Link>
        </div>

        {/* Etiquetas de Negocio */}
        <div>
          <div className="mb-2 flex items-center space-x-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
            <Tag className="h-3.5 w-3.5 text-neutral-400" />
            <span>Etiquetas y Segmentos:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {etiquetas.length === 0 ? (
              <span className="text-xs text-neutral-400">Sin etiquetas asignadas</span>
            ) : (
              etiquetas.map((e) => (
                <span
                  key={e}
                  className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  {e}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Preferencias de Viaje */}
        <div>
          <div className="mb-2 flex items-center space-x-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
            <Heart className="h-3.5 w-3.5 text-neutral-400" />
            <span>Preferencias de Viaje y Recompra:</span>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 text-xs leading-relaxed text-neutral-700 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300">
            {preferencias || 'Sin preferencias registradas aún.'}
          </div>
        </div>

        {/* Campos Personalizados por Agencia (T-026) */}
        <SeccionCamposPersonalizados entidad="contacto" entidadId={id} />

        {/* Consentimientos Legales (Ley 1581 / Meta) */}
        <div>
          <div className="mb-2 flex items-center space-x-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
            <ShieldCheck className="text-ok-600 dark:text-ok-400 h-3.5 w-3.5" />
            <span>Consentimientos y Protección de Datos:</span>
          </div>
          <div className="space-y-2">
            {/* Transaccional */}
            <div className="flex items-start justify-between rounded-xl border border-neutral-200 p-3 text-xs dark:border-neutral-800">
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Consentimiento Transaccional
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Respuestas a cotizaciones, confirmaciones de reserva y pagos.
                </p>
              </div>
              <span className="text-ok-600 dark:text-ok-400 flex items-center space-x-1 text-xs font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Activo</span>
              </span>
            </div>

            {/* Promocional */}
            <div
              className={`flex items-start justify-between rounded-xl border p-3 text-xs ${
                tienePromocional
                  ? 'border-ok-200 bg-ok-50/40 dark:border-ok-900/40 dark:bg-ok-950/20'
                  : 'border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-800/30'
              }`}
            >
              <div>
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Consentimiento Promocional (Marketing)
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Campañas segmentadas y ofertas comerciales (Ley 1581 / Meta Opt-In).
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  tienePromocional ? 'text-ok-600 dark:text-ok-400' : 'text-neutral-400'
                }`}
              >
                {tienePromocional ? '✓ Otorgado' : 'No otorgado'}
              </span>
            </div>
          </div>
        </div>

        {/* Metadatos y Auditoría */}
        <div className="space-y-1 border-t border-neutral-100 pt-4 text-[11px] text-neutral-400 dark:border-neutral-800">
          <div className="flex items-center space-x-1.5">
            <Calendar className="h-3 w-3" />
            <span>Registrado el: {new Date(creadoEn).toLocaleDateString('es-CO')}</span>
          </div>
          {ultimoContactoEn && (
            <div className="flex items-center space-x-1.5">
              <Phone className="h-3 w-3" />
              <span>Último contacto: {new Date(ultimoContactoEn).toLocaleDateString('es-CO')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
