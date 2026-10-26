'use client';

import React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Compass,
  MapPin,
  Sparkles,
  Users,
  Ship,
  Trees,
  Landmark,
  CheckCircle2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type {
  ProductoCatalogoAgrupado,
  SalidaChipInfo,
  TipoTurismo,
} from '../../lib/catalogo-logica';

interface TarjetaExcursionCatalogoProps {
  producto: ProductoCatalogoAgrupado;
  alSeleccionar?: (producto: ProductoCatalogoAgrupado) => void;
  salidaSeleccionadaId?: string;
  onSeleccionarSalida?: (salida: SalidaChipInfo) => void;
}

function obtenerEstiloDegradado(tipo: TipoTurismo) {
  switch (tipo) {
    case 'PLAYA_NAUTICO':
      return {
        gradiente: 'from-cyan-600 via-teal-700 to-blue-800',
        icono: Ship,
        etiqueta: 'Tour náutico & playa',
      };
    case 'NATURALEZA':
      return {
        gradiente: 'from-emerald-600 via-teal-700 to-green-800',
        icono: Trees,
        etiqueta: 'Naturaleza & Ecoturismo',
      };
    case 'AVENTURA':
      return {
        gradiente: 'from-amber-600 via-orange-700 to-yellow-800',
        icono: Compass,
        etiqueta: 'Aventura & Expedición',
      };
    case 'CULTURAL_CIUDAD':
    default:
      return {
        gradiente: 'from-indigo-600 via-purple-700 to-blue-800',
        icono: Landmark,
        etiqueta: 'Cultura & Ciudad',
      };
  }
}

export function TarjetaExcursionCatalogo({
  producto,
  alSeleccionar,
  salidaSeleccionadaId,
  onSeleccionarSalida,
}: TarjetaExcursionCatalogoProps) {
  const estilo = obtenerEstiloDegradado(producto.tipoTurismo);
  const IconoTipo = estilo.icono;

  // Primera salida disponible o próxima
  const proximaSalida = producto.salidas[0];
  const urlCotizar = proximaSalida
    ? `/cotizador?paqueteId=${encodeURIComponent(producto.paqueteId)}&fecha=${encodeURIComponent(proximaSalida.fecha)}`
    : `/cotizador?paqueteId=${encodeURIComponent(producto.paqueteId)}`;

  return (
    <article
      data-testid={`tarjeta-excursion-${producto.paqueteId}`}
      className="flex w-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div>
        {/* 1. Cabecera visual con degradado representativo y badges */}
        <div
          className={`relative overflow-hidden bg-gradient-to-r ${estilo.gradiente} p-4 text-white sm:p-5`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur-xs">
              <IconoTipo className="h-3.5 w-3.5" />
              <span>{estilo.etiqueta}</span>
            </span>

            <span className="rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-white backdrop-blur-xs">
              {producto.noches === 0
                ? '1 día (Pasadía)'
                : `${producto.dias}D / ${producto.noches}N`}
            </span>
          </div>

          <h3 className="mt-3 text-base font-extrabold tracking-tight text-white sm:text-lg">
            {producto.nombre}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/90">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-80" />
              {producto.destino}
            </span>

            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0 opacity-80" />
              <span>Horario: {producto.horario}</span>
            </span>
          </div>

          {/* Badges de promociones */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {producto.tienePromo && (
              <span
                data-testid="badge-promo-catalogo"
                className="flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-neutral-950 shadow-xs"
              >
                <Sparkles className="h-3 w-3" />
                Promo vigente
              </span>
            )}
            {producto.desdeEsDeGrupo && (
              <span className="flex items-center gap-1 rounded-full bg-purple-200/90 px-2 py-0.5 text-[11px] font-semibold text-purple-950">
                <Users className="h-3 w-3" />
                Tarifa grupal
              </span>
            )}
          </div>
        </div>

        {/* 2. Aviso de impuesto de muelle / tasa portuaria */}
        {producto.requiereImpuestoMuelle && (
          <div
            data-testid="aviso-impuesto-muelle-catalogo"
            className="flex items-start gap-2 border-b border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="leading-snug">
              <strong className="font-semibold">Impuesto de muelle no incluido:</strong> Tasa
              portuaria requerida al abordar en taquilla del muelle (aprox. $26.500 COP p/p).
            </p>
          </div>
        )}

        {/* 3. Inclusiones destacadas */}
        <div className="p-4 sm:p-5">
          <div className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            ¿Qué incluye la excursión?
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            {producto.inclusiones.slice(0, 3).map((inc, i) => (
              <li key={i} className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <span className="truncate">{inc}</span>
              </li>
            ))}
          </ul>

          {/* 4. Próximas salidas con cupos por salida */}
          <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
                Próximas salidas ({producto.salidas.length})
              </span>
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Cupos en vivo
              </span>
            </div>

            {producto.salidas.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {producto.salidas.slice(0, 4).map((salida) => {
                  const esSeleccionada = salidaSeleccionadaId === salida.vigenciaId;

                  let colorChip =
                    'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300';
                  if (salida.estadoCupo === 'ULTIMOS_CUPOS') {
                    colorChip =
                      'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300';
                  } else if (salida.estadoCupo === 'AGOTADO') {
                    colorChip =
                      'border-neutral-200 bg-neutral-100 text-neutral-500 opacity-70 line-through dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-400';
                  }

                  return (
                    <button
                      key={salida.vigenciaId}
                      type="button"
                      data-testid="chip-salida"
                      onClick={() => onSeleccionarSalida?.(salida)}
                      className={`flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${colorChip} ${
                        esSeleccionada ? 'ring-2 ring-teal-500 ring-offset-1' : ''
                      }`}
                      title={`Salida ${salida.fecha} · ${salida.etiquetaCupo}`}
                    >
                      <Calendar className="h-3 w-3 shrink-0" />
                      <span className="capitalize">{salida.etiquetaFecha}</span>
                      <span className="text-[10px] font-semibold opacity-90">
                        · {salida.etiquetaCupo}
                      </span>
                    </button>
                  );
                })}

                {producto.salidas.length > 4 && (
                  <button
                    type="button"
                    onClick={() => alSeleccionar?.(producto)}
                    className="flex min-h-[36px] items-center rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    +{producto.salidas.length - 4} más
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-neutral-400 italic">
                Sin salidas programadas abiertas
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 5. Pie de tarjeta con Tarifa Desde y Botones */}
      <div className="border-t border-neutral-100 bg-neutral-50/70 p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-800/30">
        <div className="mb-3 flex items-baseline justify-between gap-1">
          <span className="text-xs text-neutral-500 dark:text-neutral-400">Tarifa de salida:</span>
          <div className="text-right">
            <span
              data-testid="precio-producto-catalogo"
              className="cifra text-base font-extrabold text-neutral-900 sm:text-lg dark:text-white"
            >
              {producto.precioEtiqueta}
            </span>
            {producto.desdeEsDeGrupo && (
              <span className="block text-[10px] font-medium text-purple-700 dark:text-purple-300">
                Sujeto a compra en grupo o pareja
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {alSeleccionar && (
            <button
              type="button"
              onClick={() => alSeleccionar(producto)}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Eye className="h-4 w-4 shrink-0 text-neutral-500" />
              <span>Ver ficha</span>
            </button>
          )}

          <Link
            href={urlCotizar}
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 ${
              !alSeleccionar ? 'col-span-2' : ''
            }`}
          >
            <Compass className="h-4 w-4 shrink-0" />
            <span>Cotizar</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
