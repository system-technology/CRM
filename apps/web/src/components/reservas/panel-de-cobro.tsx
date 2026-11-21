'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Wallet } from 'lucide-react';
import type { CobroDelArchivo, RegistrarPago } from '@viajapro/contracts';
import { obtenerCobroDelArchivo, registrarPago } from '../../lib/cobros-api';
import {
  CLASE_TONO,
  ETIQUETA_ESTADO_DE_COBRO,
  ETIQUETA_MEDIO_DE_PAGO,
  ETIQUETA_SITUACION,
  ETIQUETA_TIPO_DE_MOVIMIENTO,
  TONO_ESTADO_DE_COBRO,
  esSobrepagoSinConfirmar,
  fraseDeSaldo,
  mensajeDeErrorDeCobro,
  saldoEnPantalla,
} from '../../lib/cobros-logica';
import { formatearDinero, formatearFecha } from '../../lib/formato';
import {
  PERMISO_COBRO_CORREGIR,
  PERMISO_COBRO_REGISTRAR,
  PERMISO_COBRO_VER,
  usePermisos,
} from '../../lib/permisos';
import { DialogoRegistrarPago } from './dialogo-registrar-pago';

interface PanelDeCobroProps {
  archivoId: string;
  numero: number;
  /** Zona de la agencia (R9): las fechas se presentan en ella. */
  zona: string;
}

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; cobro: CobroDelArchivo };

const BOTON_SECUNDARIO =
  'focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-3 text-xs font-medium hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:hover:bg-neutral-800';

function Cifra({
  etiqueta,
  valor,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-neutral-600 dark:text-neutral-400">{etiqueta}</dt>
      <dd
        className={`break-words tabular-nums ${destacada ? 'text-xl font-bold sm:text-2xl' : 'text-sm font-semibold'}`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * Cobro al viajero dentro del archivo de viaje (T-331, ADR-0034).
 *
 * La pregunta que responde, y por eso va primero y en grande: **cuánto falta por cobrar**. Total y
 * pagado quedan debajo como respaldo de esa cifra, y el historial explica de dónde sale.
 *
 * **El saldo no se calcula aquí.** Llega derivado de los movimientos (`GET .../cobro`) y, tras
 * registrar un pago, se repinta con el cobro que devuelve la propia respuesta: nunca con una resta
 * hecha en el navegador.
 *
 * Permisos (ADR-0034 §6), los tres estados «sin permiso» de la pantalla:
 * - sin `cobro.ver` — no se pide nada a la API y se explica por qué no se ve;
 * - sin `cobro.registrar` — se ve el saldo y el historial, pero no se ofrece registrar;
 * - sin `cobro.corregir` — no se ofrece corregir ni reversar, que son del dueño.
 */
export function PanelDeCobro({ archivoId, numero, zona }: PanelDeCobroProps) {
  const { cargando: cargandoPermisos, tienePermiso } = usePermisos();
  const puedeVer = tienePermiso(PERMISO_COBRO_VER);
  const puedeRegistrar = tienePermiso(PERMISO_COBRO_REGISTRAR);
  const puedeCorregir = tienePermiso(PERMISO_COBRO_CORREGIR);

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [intento, setIntento] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [sobrepago, setSobrepago] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  /**
   * La clave de idempotencia del pago que se está intentando (R5). Vive **aquí**, no en el
   * diálogo: si viviera en el diálogo, cerrarlo y volver a abrirlo daría una clave nueva y el
   * reintento de un pago que el servidor ya guardó —pero cuya respuesta se perdió— cobraría dos
   * veces. Y el asesor no puede deshacerlo: reversar es de `cobro.corregir` (ADR-0034 §6).
   *
   * Solo se renueva tras un alta confirmada: a partir de ahí el siguiente ya es otro pago.
   */
  const [claveDelIntento, setClaveDelIntento] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (cargandoPermisos || !puedeVer) return;
    let activo = true;
    setEstado({ tipo: 'cargando' });
    obtenerCobroDelArchivo(archivoId)
      .then((cobro) => activo && setEstado({ tipo: 'listo', cobro }))
      .catch(
        (e: unknown) => activo && setEstado({ tipo: 'error', mensaje: mensajeDeErrorDeCobro(e) }),
      );
    return () => {
      activo = false;
    };
  }, [archivoId, cargandoPermisos, puedeVer, intento]);

  /**
   * Relectura del cobro después de un envío fallido: el pago pudo quedar guardado aunque la
   * respuesta se perdiera, y la pantalla no debe seguir afirmando un saldo viejo. No desmonta el
   * diálogo (el estado sigue siendo «listo»), así que lo escrito y el error siguen a la vista.
   */
  const releerTrasFallo = async () => {
    try {
      setEstado({ tipo: 'listo', cobro: await obtenerCobroDelArchivo(archivoId) });
    } catch (e) {
      // No se traga: se añade a lo que la asesora ya está leyendo.
      setErrorDialogo(
        (previo) =>
          `${previo ?? ''} Tampoco se pudo releer el saldo: ${mensajeDeErrorDeCobro(e)} Revisa el historial antes de reintentar.`,
      );
    }
  };

  const enviar = async (pago: RegistrarPago) => {
    setEnviando(true);
    setErrorDialogo(null);
    try {
      const resultado = await registrarPago(archivoId, pago);
      // El saldo que se pinta es el que devuelve el servidor, no una resta local.
      setEstado({ tipo: 'listo', cobro: resultado.cobro });
      // El pago quedó: el siguiente que se registre es otro pago, con otra clave.
      setClaveDelIntento(crypto.randomUUID());
      setAbierto(false);
      setSobrepago(false);
      setConfirmacion(
        `Pago registrado por ${formatearDinero(resultado.movimiento.monto)}. ${fraseDeSaldo(resultado.cobro)}`,
      );
    } catch (e) {
      setSobrepago(esSobrepagoSinConfirmar(e));
      setErrorDialogo(mensajeDeErrorDeCobro(e));
      // La clave NO cambia: reintentar este mismo pago no puede cobrar dos veces.
      await releerTrasFallo();
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoPermisos) {
    return <div aria-busy="true" aria-label="Cargando cobro" className="h-28" />;
  }

  if (!puedeVer) {
    return (
      <section
        aria-labelledby="cobro-titulo"
        data-testid="cobro-sin-permiso"
        className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
      >
        <h3 id="cobro-titulo" className="flex items-center gap-1.5 text-sm font-bold">
          <Lock className="h-4 w-4" aria-hidden="true" />
          Cobro al viajero
        </h3>
        <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
          Tu rol no incluye el permiso «Ver cobros», así que no se muestra cuánto pagó ni cuánto
          debe este viajero. Pide a quien administra la agencia que te lo asigne desde
          Configuración.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="cobro-titulo"
      data-testid="panel-de-cobro"
      className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="cobro-titulo" className="flex items-center gap-1.5 text-sm font-bold">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Cobro al viajero
        </h3>
        {estado.tipo === 'listo' && (
          <span
            data-testid="estado-de-cobro"
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASE_TONO[TONO_ESTADO_DE_COBRO[estado.cobro.estadoDeCobro]]}`}
          >
            {ETIQUETA_ESTADO_DE_COBRO[estado.cobro.estadoDeCobro]}
          </span>
        )}
      </div>

      {estado.tipo === 'cargando' && (
        <div className="space-y-2" aria-busy="true" aria-label="Cargando el cobro del archivo">
          <div className="esqueleto-brillo h-12 rounded-lg" />
          <div className="esqueleto-brillo h-16 rounded-lg" />
        </div>
      )}

      {estado.tipo === 'error' && (
        <div role="alert" className="text-xs text-neutral-800 dark:text-neutral-200">
          <p className="font-semibold">No se pudo cargar el cobro de este archivo.</p>
          <p className="mt-1">{estado.mensaje}</p>
          <button
            type="button"
            onClick={() => setIntento((i) => i + 1)}
            className={`${BOTON_SECUNDARIO} mt-2`}
          >
            Reintentar
          </button>
        </div>
      )}

      {estado.tipo === 'listo' && (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div className="col-span-2">
              {/* El signo del saldo se dice con palabras, no con un «−» delante del importe. */}
              <Cifra
                etiqueta={saldoEnPantalla(estado.cobro).etiqueta}
                valor={formatearDinero(saldoEnPantalla(estado.cobro).dinero)}
                destacada
              />
            </div>
            <Cifra etiqueta="Total del viaje" valor={formatearDinero(estado.cobro.total)} />
            <Cifra etiqueta="Pagado" valor={formatearDinero(estado.cobro.pagado)} />
          </dl>

          <p className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
            {ETIQUETA_SITUACION[estado.cobro.situacion]} · Fecha límite{' '}
            {formatearFecha(estado.cobro.fechaLimite, { zona })}
          </p>

          {confirmacion && (
            <p
              role="status"
              data-testid="pago-registrado"
              className="bg-ok-50 text-ok-700 border-ok-600/40 dark:bg-ok-600/15 dark:text-ok-600 mt-3 rounded-lg border px-3 py-2 text-xs"
            >
              {confirmacion}
            </p>
          )}

          {puedeRegistrar && estado.cobro.estadoDelArchivo === 'ABIERTO' && (
            <button
              type="button"
              data-testid="abrir-registrar-pago"
              onClick={() => {
                setConfirmacion(null);
                setErrorDialogo(null);
                setSobrepago(false);
                setAbierto(true);
              }}
              className="bg-acento-700 hover:bg-acento-800 focus-visible:ring-acento-600 mt-3 min-h-[44px] w-full rounded-xl px-4 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:outline-none sm:w-auto"
            >
              Registrar pago
            </button>
          )}

          {!puedeRegistrar && estado.cobro.estadoDelArchivo === 'ABIERTO' && (
            <p
              role="note"
              data-testid="cobro-sin-permiso-registrar"
              className="mt-3 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
            >
              Puedes consultar el cobro, pero tu rol no puede registrar pagos. Pide a quien
              administra la agencia el permiso «Registrar pagos».
            </p>
          )}

          <h4 className="mt-4 mb-2 text-xs font-bold">Historial de pagos</h4>
          {estado.cobro.movimientos.length === 0 ? (
            <p
              data-testid="historial-vacio"
              className="text-xs text-neutral-600 dark:text-neutral-400"
            >
              Todavía no hay pagos registrados.{' '}
              {puedeRegistrar
                ? 'Cuando el viajero abone, regístralo aquí y el saldo se actualiza solo.'
                : 'Aparecerán aquí en cuanto alguien de la agencia registre el primero.'}
            </p>
          ) : (
            <ul
              data-testid="historial-de-pagos"
              className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700"
            >
              {[...estado.cobro.movimientos].reverse().map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2"
                >
                  <span className="min-w-0 text-xs text-neutral-700 dark:text-neutral-300">
                    {ETIQUETA_TIPO_DE_MOVIMIENTO[m.tipo]}
                    {m.pagadoEl ? ` · ${formatearFecha(m.pagadoEl, { zona })}` : ''}
                    {m.medio ? ` · ${ETIQUETA_MEDIO_DE_PAGO[m.medio]}` : ''}
                    {m.referencia ? ` · ${m.referencia}` : ''}
                  </span>
                  <span
                    className={`ml-auto text-sm font-semibold tabular-nums ${m.reversado ? 'text-neutral-500 line-through' : ''}`}
                  >
                    {formatearDinero(m.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!puedeCorregir && estado.cobro.movimientos.length > 0 && (
            <p
              data-testid="cobro-sin-permiso-corregir"
              className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400"
            >
              Un pago registrado no se borra. Corregirlo —devolver, ajustar o reversar— lo hace
              quien administra la agencia.
            </p>
          )}
        </>
      )}

      {abierto && estado.tipo === 'listo' && (
        <DialogoRegistrarPago
          numero={numero}
          claveIdempotencia={claveDelIntento}
          moneda={estado.cobro.moneda}
          saldo={estado.cobro.saldo}
          zona={zona}
          enviando={enviando}
          errorServidor={errorDialogo}
          pedirConfirmarSobrepago={sobrepago}
          onRegistrar={(pago) => void enviar(pago)}
          onCerrar={() => {
            setAbierto(false);
            setErrorDialogo(null);
            setSobrepago(false);
          }}
        />
      )}
    </section>
  );
}
