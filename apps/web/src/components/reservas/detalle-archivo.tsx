'use client';

import React, { useState } from 'react';
import { ArrowLeft, Pencil, Users } from 'lucide-react';
import type {
  ActualizarReserva,
  CancelarArchivo,
  DetalleDeArchivo,
  EstadoDeReserva,
  ReemplazarPasajeros,
  ReservaDelArchivo,
} from '@viajapro/contracts';
import {
  ACCION_HACIA_ESTADO,
  ETIQUETA_AVANCE,
  ETIQUETA_ESTADO_RESERVA,
  ETIQUETA_MOTIVO_CAIDA,
  ETIQUETA_MOTIVO_CANCELACION,
  SIGUIENTES_ESTADOS,
  describirPlazo,
  mensajeDeErrorDelArchivo,
} from '../../lib/archivos-logica';
import { formatearDinero, formatearFecha, formatearFechaHora, pluralizar } from '../../lib/formato';
import {
  enlaceDeContacto,
  enlaceDeConversacion,
  enlaceDeCotizacion,
} from '../../lib/enlaces-viaje-logica';
import { useEnlacesDelViaje } from '../../lib/use-enlaces-del-viaje';
import { EnlacesDelViaje } from '../comun/enlaces-del-viaje';
import { DialogoCancelarArchivo } from './dialogo-cancelar-archivo';
import { EditorPasajeros } from './editor-pasajeros';
import { FormularioReserva } from './formulario-reserva';
import { SemaforoPlazo } from './semaforo-plazo';

interface DetalleArchivoProps {
  archivo: DetalleDeArchivo;
  zona: string;
  /** `archivo.operar`: sin él el detalle es de solo lectura (la API igual lo exige). */
  puedeOperar: boolean;
  /** Solo móvil: vuelve a la lista. */
  onVolver: () => void;
  onActualizarReserva: (reservaId: string, cambio: ActualizarReserva) => Promise<void>;
  onReemplazarPasajeros: (cambio: ReemplazarPasajeros) => Promise<void>;
  onCancelarArchivo: (cancelacion: CancelarArchivo) => Promise<void>;
}

const BOTON =
  'focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:hover:bg-neutral-800';

const NOMBRE_TIPO = { ADT: 'Adulto', CHD: 'Niño', INF: 'Infante' } as const;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-neutral-600 dark:text-neutral-400">{etiqueta}</dt>
      <dd className="text-sm font-medium">{valor}</dd>
    </div>
  );
}

function FilaReserva({
  reserva,
  cancelado,
  zona,
  puedeOperar,
  onActualizar,
}: {
  reserva: ReservaDelArchivo;
  cancelado: boolean;
  zona: string;
  puedeOperar: boolean;
  onActualizar: (reservaId: string, cambio: ActualizarReserva) => Promise<void>;
}) {
  const [destino, setDestino] = useState<EstadoDeReserva | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (cambio: ActualizarReserva) => {
    setEnviando(true);
    setError(null);
    try {
      await onActualizar(reserva.id, cambio);
      setDestino(null);
    } catch (e) {
      setError(mensajeDeErrorDelArchivo(e));
    } finally {
      setEnviando(false);
    }
  };

  const siguientes = cancelado || !puedeOperar ? [] : SIGUIENTES_ESTADOS[reserva.estado];

  return (
    <li
      data-testid="reserva"
      className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">
            {reserva.mayoristaNombre ?? 'Mayorista por definir'}
          </p>
          <p className="text-xs text-neutral-700 dark:text-neutral-300">
            {ETIQUETA_ESTADO_RESERVA[reserva.estado]}
            {reserva.localizador ? ` · Localizador ${reserva.localizador}` : ''}
          </p>
        </div>
        <SemaforoPlazo semaforo={reserva.semaforo} />
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2">
        {reserva.timeLimit && (
          <Dato etiqueta="Time limit" valor={formatearFechaHora(reserva.timeLimit, { zona })} />
        )}
        {reserva.pagoTotalVenceEn && (
          <Dato
            etiqueta="Pago total hasta"
            valor={formatearFechaHora(reserva.pagoTotalVenceEn, { zona })}
          />
        )}
        {reserva.plazoVigente && (
          <Dato etiqueta="Plazo vigente" valor={describirPlazo(reserva.plazoVigente)} />
        )}
        {reserva.netoUnidades !== undefined && (
          <Dato
            etiqueta="Neto del mayorista"
            valor={
              reserva.netoUnidades === null
                ? 'Incompleto (falta cargar netos)'
                : formatearDinero({ unidades: reserva.netoUnidades, moneda: reserva.moneda })
            }
          />
        )}
        {reserva.motivoCaida && (
          <Dato etiqueta="Motivo de caída" valor={ETIQUETA_MOTIVO_CAIDA[reserva.motivoCaida]} />
        )}
      </dl>
      {reserva.nota && (
        <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">Nota: {reserva.nota}</p>
      )}

      {destino && puedeOperar ? (
        <FormularioReserva
          reserva={reserva}
          estadoDestino={destino}
          zona={zona}
          enviando={enviando}
          errorServidor={error}
          onEnviar={(c) => void enviar(c)}
          onCancelar={() => {
            setDestino(null);
            setError(null);
          }}
        />
      ) : (
        !cancelado &&
        puedeOperar && (
          <div className="mt-3 flex flex-wrap gap-2">
            {siguientes.map((s) => (
              <button key={s} type="button" className={BOTON} onClick={() => setDestino(s)}>
                {ACCION_HACIA_ESTADO[s]}
              </button>
            ))}
            <button
              type="button"
              className={BOTON}
              onClick={() => setDestino(reserva.estado)}
              aria-label={`Corregir localizador o nota de la reserva con ${reserva.mayoristaNombre ?? 'mayorista por definir'}`}
            >
              <Pencil className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Corregir datos
            </button>
          </div>
        )
      )}
    </li>
  );
}

export function DetalleArchivo({
  archivo,
  zona,
  puedeOperar,
  onVolver,
  onActualizarReserva,
  onReemplazarPasajeros,
  onCancelarArchivo,
}: DetalleArchivoProps) {
  const [editandoPasajeros, setEditandoPasajeros] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelado = archivo.estado === 'CANCELADO';
  // El file ya trae la cotización de origen; falta el contacto y su conversación (dos peticiones).
  const enlaces = useEnlacesDelViaje(archivo.contactoId, null, { conArchivos: false });
  const nombreContacto = enlaces.contacto.tipo === 'listo' ? enlaces.contacto.valor?.nombre : null;

  const ejecutar = async (operacion: () => Promise<void>, alTerminar: () => void) => {
    setEnviando(true);
    setError(null);
    try {
      await operacion();
      alTerminar();
    } catch (e) {
      setError(mensajeDeErrorDelArchivo(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article aria-labelledby="archivo-titulo" className="space-y-5 p-4 sm:p-6">
      <button
        type="button"
        onClick={onVolver}
        className={`${BOTON} flex items-center gap-1 lg:hidden`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver a la lista
      </button>

      <header className="space-y-2 border-b border-neutral-200 pb-4 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="archivo-titulo" className="text-lg font-bold">
            File {archivo.numero} · {archivo.destino}
          </h2>
          {cancelado ? (
            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
              Cancelado
            </span>
          ) : (
            <>
              {archivo.avance && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                  {ETIQUETA_AVANCE[archivo.avance]}
                </span>
              )}
              <SemaforoPlazo semaforo={archivo.semaforo} />
            </>
          )}
        </div>
        <EnlacesDelViaje
          enlaces={[
            enlaceDeConversacion(enlaces.conversacionId),
            enlaceDeContacto(archivo.contactoId, nombreContacto),
            enlaceDeCotizacion(archivo.cotizacionId, archivo.versionCotizacion),
          ]}
        />
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Dato etiqueta="Paquete" valor={archivo.paqueteNombre} />
          <Dato
            etiqueta="Salida"
            valor={`${formatearFecha(archivo.fechaSalida, { zona })} · ${archivo.noches} noches`}
          />
          <Dato
            etiqueta="Pasajeros"
            valor={`${pluralizar(archivo.adultos, 'adulto', 'adultos')}, ${pluralizar(archivo.ninos, 'niño', 'niños')}, ${pluralizar(archivo.infantes, 'infante', 'infantes')}`}
          />
          <Dato etiqueta="Venta" valor={formatearDinero(archivo.venta)} />
        </dl>
        {cancelado && archivo.motivoCancelacion && (
          <p className="text-xs text-neutral-700 dark:text-neutral-300">
            Motivo: {ETIQUETA_MOTIVO_CANCELACION[archivo.motivoCancelacion]}
            {archivo.notaCancelacion ? ` — ${archivo.notaCancelacion}` : ''}
          </p>
        )}
      </header>

      {!puedeOperar && !cancelado && (
        <p
          role="note"
          data-testid="aviso-solo-lectura"
          className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          Puedes consultar este archivo, pero tu rol no puede modificarlo. Para avanzar reservas,
          editar pasajeros o cancelar, pide a quien administra la agencia el permiso «Operar
          archivos de viaje».
        </p>
      )}

      {error && !editandoPasajeros && !cancelando && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          {error}
        </p>
      )}

      <section aria-labelledby="reservas-titulo">
        <h3 id="reservas-titulo" className="mb-2 text-sm font-bold">
          Reservas por mayorista
        </h3>
        {archivo.reservas.length === 0 ? (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Este archivo no tiene reservas.
          </p>
        ) : (
          <ul className="space-y-3">
            {archivo.reservas.map((r) => (
              <FilaReserva
                key={r.id}
                reserva={r}
                cancelado={cancelado}
                zona={zona}
                puedeOperar={puedeOperar}
                onActualizar={onActualizarReserva}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pasajeros-titulo">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="pasajeros-titulo" className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4" aria-hidden="true" />
            Pasajeros
          </h3>
          {!cancelado && puedeOperar && !editandoPasajeros && (
            <button type="button" className={BOTON} onClick={() => setEditandoPasajeros(true)}>
              Editar pasajeros
            </button>
          )}
        </div>
        {archivo.avisos.includes('PASAJEROS_NO_CUADRAN_CON_LA_VENTA') && (
          <p
            role="note"
            className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
          >
            Los pasajeros no cuadran con lo vendido (
            {pluralizar(archivo.adultos, 'adulto', 'adultos')},{' '}
            {pluralizar(archivo.ninos, 'niño', 'niños')},{' '}
            {pluralizar(archivo.infantes, 'infante', 'infantes')}). Puedes guardar igual, pero
            revisa la lista.
          </p>
        )}
        {editandoPasajeros && puedeOperar ? (
          <EditorPasajeros
            pasajeros={archivo.pasajeros}
            enviando={enviando}
            errorServidor={error}
            onGuardar={(c) =>
              void ejecutar(
                () => onReemplazarPasajeros(c),
                () => setEditandoPasajeros(false),
              )
            }
            onCancelar={() => {
              setEditandoPasajeros(false);
              setError(null);
            }}
          />
        ) : archivo.pasajeros.length === 0 ? (
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Todavía no hay pasajeros cargados.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
            {archivo.pasajeros.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm">
                  {p.nombre}
                  {p.esTitular && (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold dark:bg-neutral-800">
                      Titular
                    </span>
                  )}
                </span>
                <span className="text-xs text-neutral-700 dark:text-neutral-300">
                  {NOMBRE_TIPO[p.tipo]}
                  {p.edadAlViaje !== null ? ` · ${p.edadAlViaje} años` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!cancelado && puedeOperar && (
        <section className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCancelando(true);
            }}
            className="min-h-[44px] rounded-xl border border-red-300 px-4 text-xs font-semibold text-red-800 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
          >
            Cancelar archivo…
          </button>
        </section>
      )}

      {cancelando && puedeOperar && (
        <DialogoCancelarArchivo
          numero={archivo.numero}
          enviando={enviando}
          errorServidor={error}
          onConfirmar={(c) =>
            void ejecutar(
              () => onCancelarArchivo(c),
              () => setCancelando(false),
            )
          }
          onCerrar={() => {
            setCancelando(false);
            setError(null);
          }}
        />
      )}
    </article>
  );
}
