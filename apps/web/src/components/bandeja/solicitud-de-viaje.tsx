import React from 'react';
import Link from 'next/link';
import type { Oportunidad } from '@viajapro/contracts';
import { Calendar, FileText, MapPin, PlusCircle, Users } from 'lucide-react';
import { formatearDinero } from '../../lib/formato';
import {
  describirVencimiento,
  enlaceParaCotizar,
  fechaDeSalidaTexto,
  nombreCortoDeDestino,
  pasajerosEnLetras,
  type ViajeDeContacto,
} from '../../lib/viaje-solicitado-logica';
import { InsigniaDePlazo, CLASES_POR_NIVEL } from '../comun/viaje-insignias';
import { EnlacesDelViaje } from '../comun/enlaces-del-viaje';
import { enlaceDeArchivo, enlaceDeCobro, soloEnlaces } from '../../lib/enlaces-viaje-logica';
import { usePermisos } from '../../lib/permisos';

interface SolicitudDeViajeProps {
  viaje: ViajeDeContacto;
  contactoId: string;
  conversacionId?: string | undefined;
  oportunidad: Oportunidad | null;
  onCrearOportunidad?: (() => void) | undefined;
}

/**
 * Lo que el cliente pide y lo que ya se hizo con eso, arriba del panel de la conversación: destino,
 * salida, pasajeros, plazo, cotización vigente y file. Una sola acción principal: «Cotizar», que
 * abre el cotizador con lo conocido ya rellenado. Los campos personalizados bajan (los muestra la
 * ficha debajo, plegados).
 */
export function SolicitudDeViaje({
  viaje,
  contactoId,
  conversacionId,
  oportunidad,
  onCrearOportunidad,
}: SolicitudDeViajeProps) {
  const { tienePermiso } = usePermisos();
  const destino = nombreCortoDeDestino(viaje.destino);
  const salida = fechaDeSalidaTexto(viaje.fechaSalida);
  const pasajeros = pasajerosEnLetras(viaje.pasajeros);
  const sinNada = !oportunidad && !destino && !salida && !viaje.cotizacion && !viaje.archivo;
  const vigencia = viaje.cotizacion?.vigenteHasta
    ? describirVencimiento(viaje.cotizacion.vigenteHasta)
    : null;

  const hrefCotizar = enlaceParaCotizar({
    contactoId,
    conversacionId,
    oportunidadId: viaje.oportunidadId,
    paqueteId: viaje.paqueteId,
    destino: viaje.destino,
    fechaSalida: viaje.fechaSalida,
    pasajeros: viaje.pasajeros,
  });

  return (
    <section
      aria-labelledby="titulo-solicitud-de-viaje"
      data-testid="solicitud-de-viaje"
      className="border-l-acento-600 space-y-2.5 rounded-xl border border-l-4 border-neutral-200 bg-white p-3.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-800/40"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="titulo-solicitud-de-viaje"
          className="text-sm font-bold text-neutral-600 dark:text-neutral-300"
        >
          Solicitud de viaje
        </h3>
        {oportunidad && (
          <div className="flex items-center gap-2">
            <span className="rounded-xs border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-sm font-bold text-neutral-800 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              {oportunidad.etapa.nombre}
            </span>
            {onCrearOportunidad && (
              <button
                type="button"
                data-testid="btn-crear-oportunidad"
                onClick={onCrearOportunidad}
                className="text-acento-700 dark:text-acento-100 flex min-h-[44px] items-center px-2 text-sm font-semibold hover:underline"
                title="Crear una oportunidad nueva para este viajero"
              >
                + Nueva
              </button>
            )}
          </div>
        )}
      </div>

      {sinNada ? (
        <div className="space-y-2">
          <p className="text-neutral-600 dark:text-neutral-400">
            Aún no hay destino ni fechas. Pregunta al cliente adónde y cuándo quiere viajar y
            regístralo en una oportunidad, o cotiza directamente.
          </p>
          {onCrearOportunidad && (
            <button
              type="button"
              data-testid="btn-crear-oportunidad"
              onClick={onCrearOportunidad}
              className="text-acento-700 dark:text-acento-100 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold hover:underline md:min-h-[32px]"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Crear oportunidad</span>
            </button>
          )}
        </div>
      ) : (
        <dl className="space-y-1.5">
          <div className="flex items-start gap-2">
            <dt className="sr-only">Destino</dt>
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
              aria-hidden="true"
            />
            <dd
              className={
                destino
                  ? 'text-base font-bold text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-600 dark:text-neutral-400'
              }
            >
              {destino ?? 'Destino por definir'}
              {oportunidad && oportunidad.titulo && (
                <span className="mt-0.5 block text-sm font-normal text-neutral-600 dark:text-neutral-400">
                  {oportunidad.titulo}
                </span>
              )}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Salida</dt>
            <Calendar
              className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
              aria-hidden="true"
            />
            <dd className="text-neutral-800 dark:text-neutral-200">
              {salida ? `Sale el ${salida}` : 'Sin fecha de salida'}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Pasajeros</dt>
            <Users
              className="h-4 w-4 shrink-0 text-neutral-500 dark:text-neutral-400"
              aria-hidden="true"
            />
            <dd className="text-neutral-800 dark:text-neutral-200">
              {pasajeros ?? 'Pasajeros por definir'}
            </dd>
          </div>
          {oportunidad?.valorEstimado && (
            <div className="flex items-center gap-2 pl-6">
              <dt className="text-neutral-600 dark:text-neutral-400">Valor estimado</dt>
              <dd className="cifra font-bold text-neutral-900 dark:text-neutral-100">
                {formatearDinero(oportunidad.valorEstimado)} {oportunidad.valorEstimado.moneda}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* La vigencia de la cotización ya se ve en su propio bloque; aquí solo el time limit. */}
      {viaje.plazo && !(viaje.cotizacion && viaje.plazo.etiqueta === 'Cotización vence') && (
        <div>
          <InsigniaDePlazo plazo={viaje.plazo} />
        </div>
      )}

      {viaje.cotizacion && (
        <div
          data-testid="cotizacion-vigente"
          className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
            Cotización vigente · v{viaje.cotizacion.version}
          </p>
          <p className="cifra mt-0.5 font-bold text-neutral-900 dark:text-neutral-100">
            {formatearDinero(viaje.cotizacion.venta)} {viaje.cotizacion.venta.moneda}
          </p>
          {vigencia && (
            <p
              className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-sm font-semibold ${CLASES_POR_NIVEL[vigencia.nivel]}`}
            >
              Vence {vigencia.cuando}
            </p>
          )}
          <Link
            href={`/cotizaciones/${viaje.cotizacion.id}`}
            className="text-acento-700 dark:text-acento-100 mt-1.5 flex min-h-[44px] items-center gap-1.5 text-sm font-semibold hover:underline md:min-h-[28px]"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ver cotización</span>
          </Link>
        </div>
      )}

      {/* Hacia delante: el archivo de viaje y su cobro, con la misma fila que usan las demás pantallas */}
      {viaje.archivo && (
        <EnlacesDelViaje
          enlaces={soloEnlaces([
            enlaceDeArchivo({ tipo: 'listo', valor: viaje.archivo }),
            enlaceDeCobro(viaje.archivo, tienePermiso('cobro.ver')),
          ])}
        />
      )}

      <Link
        href={hrefCotizar}
        data-testid="boton-cotizar"
        className="boton-primario flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-colors"
      >
        <PlusCircle className="h-4 w-4" aria-hidden="true" />
        <span>Cotizar</span>
      </Link>
    </section>
  );
}
