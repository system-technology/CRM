'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, Compass, MapPin, Sparkles, Users, Clock, CheckCircle, Eye } from 'lucide-react';
import type { SalidaPublicada } from '@viajapro/contracts';
import {
  formatearNochesLabel,
  formatearCondicionDesde,
  clasificarDisponibilidadCupos,
  formatearHorarioExcursion,
  interpretarPresentacionTarifa,
  inferirTipoProducto,
  type TipoProductoTurismo,
} from '../../lib/catalogo-logica';
import { formatearDinero, formatearFecha } from '../../lib/formato';
import { obtenerClaseEscalonada } from '../comun/animaciones';
import {
  ChipTipoProducto,
  CONFIGURACIONES_TIPO_TURISMO,
  InsigniaAroDorado,
  InsigniaPromo,
} from '../comun';

export type SalidaPublicadaConDetalles = SalidaPublicada & {
  horaSalida?: string | null;
  horaRegreso?: string | null;
  inclusiones?: string[];
  fotoUrl?: string | null;
  tipo?: TipoProductoTurismo | null;
};

export interface TarjetaSalidaPublicadaProps {
  salida: SalidaPublicadaConDetalles;
  indice?: number;
  className?: string;
  onVerFicha?: (salida: SalidaPublicadaConDetalles) => void;
  onCotizar?: (salida: SalidaPublicadaConDetalles) => void;
}

export function TarjetaSalidaPublicada({
  salida,
  indice,
  className = '',
  onVerFicha,
  onCotizar,
}: TarjetaSalidaPublicadaProps) {
  // Formatear fecha amigable para Colombia con helper único (T-022)
  const fechaTexto = formatearFecha(salida.fecha);
  const fechaTextoCorta = formatearFecha(salida.fecha, { estilo: 'dia-mes' });

  const nochesTxt = formatearNochesLabel(salida.noches);
  const condicionDesde = formatearCondicionDesde(salida);
  const infoCupos = clasificarDisponibilidadCupos(salida.cupoTotal);
  const horario = formatearHorarioExcursion(salida.horaSalida, salida.horaRegreso);
  const presentacionInfo = interpretarPresentacionTarifa(salida.presentacion);

  // Cupo chip texto exacto requerido por T-018 («sáb 3 oct · quedan 4»)
  const chipCuposTexto =
    salida.cupoTotal !== null
      ? salida.cupoTotal <= 0
        ? 'Agotado'
        : `${fechaTextoCorta} · quedan ${salida.cupoTotal}`
      : 'Salida programada';

  // Identidad visual por tipo de producto (T-036)
  const tipo = salida.tipo ?? inferirTipoProducto(salida.paqueteNombre, salida.inclusiones);
  const configTipo =
    CONFIGURACIONES_TIPO_TURISMO[tipo] ?? CONFIGURACIONES_TIPO_TURISMO.excursion_general;
  const IconoTipo = configTipo.icono;

  const esConsultar =
    presentacionInfo.esConsultar ||
    !salida.desde ||
    salida.desde.unidades === '0' ||
    salida.desde.unidades === '';

  const claseAnimacion = indice !== undefined ? obtenerClaseEscalonada(indice) : '';

  return (
    <article
      data-testid="tarjeta-salida-publicada"
      data-tipo-producto={tipo}
      className={`group tarjeta-turismo-hover flex w-full min-w-0 flex-col justify-between overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs hover:border-cyan-500/50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-cyan-500/40 ${claseAnimacion} ${className}`.trim()}
    >
      <div>
        {/* Cabecera visual con identidad por tipo o fotografía (T-036) */}
        {salida.fotoUrl ? (
          <div
            data-testid="cabecera-con-foto"
            className="relative flex h-32 flex-col justify-between overflow-hidden bg-neutral-900 bg-cover bg-center p-4 text-white"
            style={{ backgroundImage: `url(${salida.fotoUrl})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />
            <div className="relative flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white shadow-2xs backdrop-blur-md">
                <Calendar className="h-3.5 w-3.5" />
                <span className="capitalize">{fechaTexto}</span>
              </span>

              <InsigniaAroDorado
                data-testid="insignia-duracion-salida"
                variante="dorado"
                tamano="sm"
                className="border-[#c9a24b] bg-black/40 font-semibold text-amber-200 backdrop-blur-md"
              >
                {nochesTxt}
              </InsigniaAroDorado>
            </div>

            <div className="relative mt-auto flex items-center justify-between gap-2 pt-2">
              <span className="flex items-center gap-1 text-xs font-medium text-white/95">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-white/80" />
                <span className="max-w-[120px] truncate">{salida.destino}</span>
              </span>

              <ChipTipoProducto
                tipo={tipo}
                tamano="sm"
                data-testid="chip-tipo-producto-cabecera"
                className="border-white/30 bg-white/95 text-neutral-900 shadow-xs backdrop-blur-sm dark:bg-neutral-900/90 dark:text-white"
              />
            </div>
          </div>
        ) : (
          <div
            data-testid="cabecera-sin-foto"
            className={`relative flex h-32 flex-col justify-between overflow-hidden bg-gradient-to-br ${configTipo.degradadoSustituto} p-4 text-white`}
          >
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
            <div className="pointer-events-none absolute -top-6 -left-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
            {/* Marca de agua decorativa del icono del tipo de producto */}
            <IconoTipo
              data-testid="icono-marca-agua-tipo"
              className="pointer-events-none absolute -right-3 -bottom-3 h-24 w-24 text-white/15"
              aria-hidden="true"
            />

            <div className="relative flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white shadow-2xs backdrop-blur-md">
                <Calendar className="h-3.5 w-3.5" />
                <span className="capitalize">{fechaTexto}</span>
              </span>

              <InsigniaAroDorado
                data-testid="insignia-duracion-salida"
                variante="dorado"
                tamano="sm"
                className="border-[#c9a24b] bg-black/40 font-semibold text-amber-200 backdrop-blur-md"
              >
                {nochesTxt}
              </InsigniaAroDorado>
            </div>

            <div className="relative mt-auto flex items-center justify-between gap-2 pt-2">
              <span className="flex items-center gap-1 text-xs font-medium text-white/95">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-white/80" />
                <span className="max-w-[120px] truncate">{salida.destino}</span>
              </span>

              <ChipTipoProducto
                tipo={tipo}
                tamano="sm"
                data-testid="chip-tipo-producto-cabecera"
                className="border-white/30 bg-white/95 text-neutral-900 shadow-xs backdrop-blur-sm dark:bg-neutral-900/90 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Título y Badges */}
        <div className="p-4 pb-2">
          {/* Chip de disponibilidad de cupos con urgencia */}
          <div className="mb-2 flex items-center justify-between">
            <span
              data-testid="chip-cupos-salida"
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow-xs ${infoCupos.claseColor}`}
            >
              {chipCuposTexto}
            </span>
            {salida.cupoTotal !== null && salida.cupoTotal > 0 && salida.cupoTotal <= 5 && (
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                ¡Últimos cupos!
              </span>
            )}
          </div>

          <h3 className="line-clamp-2 text-base font-bold text-neutral-900 transition-colors group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-400">
            {salida.paqueteNombre}
          </h3>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {/* Horario si existe */}
            {horario && (
              <span
                data-testid="horario-salida"
                className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <Clock className="h-3 w-3 text-neutral-500" />
                {horario}
              </span>
            )}

            {/* Opciones y tarifas */}
            {salida.tarifas > 1 && (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                <Sparkles className="h-3 w-3" />
                {salida.tarifas} opciones
              </span>
            )}

            {salida.desdeEsDeGrupo && (
              <span
                data-testid="insignia-promo-grupal"
                className="flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/50 dark:text-purple-300"
              >
                <Users className="h-3 w-3" />
                Promo grupal
              </span>
            )}

            {/* Promo vigente si la API lo declara (con aro dorado T-036) */}
            {presentacionInfo.promoVigente && (
              <InsigniaPromo
                data-testid="insignia-promo-vigente"
                className="insignia-aro-dorado border-[#c9a24b] font-bold text-neutral-950"
              >
                Promo vigente
              </InsigniaPromo>
            )}

            {/* Promo vencida tachada según política de la API (T-028 / T-051) */}
            {presentacionInfo.mostrarLeyendaVencida && (
              <span
                data-testid="insignia-promo-vencida"
                className="flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
              >
                Promo vencida
              </span>
            )}
          </div>
        </div>

        {/* Chips de lo que incluye (si vienen en la salida) */}
        {salida.inclusiones && salida.inclusiones.length > 0 && (
          <div className="border-t border-neutral-100 px-4 py-2.5 dark:border-neutral-800/80">
            <span className="mb-1.5 block text-[10px] font-bold tracking-wider text-neutral-400 uppercase">
              ¿Qué incluye la excursión?
            </span>
            <div className="flex flex-wrap gap-1.5">
              {salida.inclusiones.slice(0, 3).map((inc, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                >
                  <CheckCircle className="h-2.5 w-2.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span className="max-w-[130px] truncate">{inc}</span>
                </span>
              ))}
              {salida.inclusiones.length > 3 && (
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-800">
                  +{salida.inclusiones.length - 3} más
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pie de tarjeta con Tarifa Desde y Botón Cotizar */}
      <div className="border-t border-neutral-100 bg-neutral-50/70 p-4 dark:border-neutral-800/80 dark:bg-neutral-800/30">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Tarifa desde:
          </span>

          <div className="text-right">
            {esConsultar ? (
              <span
                data-testid="tarifa-consultar"
                className="text-base font-extrabold text-neutral-700 dark:text-neutral-200"
              >
                Consultar
              </span>
            ) : (
              <div>
                {/* Precio tachado si la promo venció y la política es TACHAR (T-028 / T-051) */}
                {presentacionInfo.mostrarTachado && presentacionInfo.listaTachada && (
                  <span
                    data-testid="tarifa-lista-tachada"
                    className="mr-2 text-xs font-semibold text-neutral-400 line-through dark:text-neutral-500"
                  >
                    {formatearDinero(presentacionInfo.listaTachada)}
                  </span>
                )}

                {/* Precio venta principal */}
                <span
                  data-testid="tarifa-venta"
                  className="cifra text-lg font-black text-neutral-900 dark:text-white"
                >
                  {formatearDinero(salida.presentacion?.venta ?? salida.desde)}
                </span>

                {/* Si hay múltiples monedas (desdePorMoneda), mostrarlas */}
                {salida.desdePorMoneda && salida.desdePorMoneda.length > 1 && (
                  <div
                    data-testid="tarifa-desde-por-moneda"
                    className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400"
                  >
                    {salida.desdePorMoneda
                      .filter((d) => d.moneda !== salida.desde.moneda)
                      .map((d) => formatearDinero(d))
                      .join(' · ')}
                  </div>
                )}
              </div>
            )}
            <span
              className={`block text-[10px] ${
                condicionDesde.esGrupo
                  ? 'font-medium text-purple-700 dark:text-purple-300'
                  : 'text-neutral-400'
              }`}
            >
              {condicionDesde.subtitulo}
            </span>
          </div>
        </div>

        <div className={`grid ${onVerFicha ? 'grid-cols-2 gap-2' : 'grid-cols-1'}`}>
          {onVerFicha && (
            <button
              type="button"
              onClick={() => onVerFicha(salida)}
              data-testid="btn-ver-ficha-salida"
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Eye className="h-4 w-4 shrink-0 text-neutral-500" />
              <span>Ver ficha</span>
            </button>
          )}

          <Link
            href={`/cotizador?paqueteId=${encodeURIComponent(salida.paqueteId)}&fecha=${encodeURIComponent(salida.fecha)}`}
            data-testid="btn-cotizar-salida"
            onClick={() => onCotizar?.(salida)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-teal-700 active:scale-98 dark:bg-teal-500 dark:hover:bg-teal-600"
          >
            <Compass className="h-4 w-4" />
            <span>Cotizar esta salida</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
