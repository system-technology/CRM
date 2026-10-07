'use client';

/**
 * Cotizador de paquetes.
 *
 * Objetivo declarado en `docs/01-producto/07-cabeza-de-playa-paquetes.md`:
 * **de conversación a propuesta enviada en menos de cinco minutos.**
 *
 * Todo el cálculo ocurre en el servidor. Esta pantalla no multiplica ni suma: muestra lo que
 * la API devuelve. Si el markup se calculara aquí, el precio que ve el asesor y el que queda
 * en la cotización podrían diferir — y esa diferencia la descubre el cliente.
 */

import { useEffect, useState } from 'react';
import type { Acomodacion, CotizacionCalculada, Paquete } from '@viajapro/contracts';
import { api, ErrorApi, formatearDinero } from '../../lib/api';

const ACOMODACIONES: Acomodacion[] = ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'];

export default function Cotizador() {
  const [paquetes, setPaquetes] = useState<Paquete[] | null>(null);
  const [paqueteId, setPaqueteId] = useState('');
  const [fechaSalida, setFechaSalida] = useState('2027-12-18');
  const [adultos, setAdultos] = useState(2);
  const [ninos, setNinos] = useState(2);
  const [infantes, setInfantes] = useState(0);
  const [acomodacion, setAcomodacion] = useState<Acomodacion | ''>('');
  const [markupExtra, setMarkupExtra] = useState(0);

  const [cotizacion, setCotizacion] = useState<CotizacionCalculada | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    api
      .listarPaquetes()
      .then((p) => {
        setPaquetes(p.datos);
        if (p.datos[0]) setPaqueteId(p.datos[0].id);
      })
      .catch((e) => setError(e as ErrorApi));
  }, []);

  async function cotizar() {
    if (!paqueteId) return;
    setCalculando(true);
    setError(null);
    try {
      setCotizacion(
        await api.cotizar({
          paqueteId,
          fechaSalida,
          pasajeros: { adultos, ninos, infantes },
          ...(acomodacion ? { acomodacion } : {}),
          ...(markupExtra ? { markupExtra } : {}),
        }),
      );
    } catch (e) {
      setError(e as ErrorApi);
      setCotizacion(null);
    } finally {
      setCalculando(false);
    }
  }

  const paquete = paquetes?.find((p) => p.id === paqueteId);

  return (
    <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
      <main className="flex-1 p-6">
        <header className="mb-5">
          <h1 className="text-lg font-semibold">Nueva cotización</h1>
          <p className="text-sm text-neutral-500">
            Elige paquete, fechas y pasajeros. El precio lo calcula el servidor.
          </p>
        </header>

        {paquetes === null && !error && (
          // Esqueleto, no spinner: el usuario ve dónde va a aparecer el contenido.
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-neutral-200" />
            ))}
          </div>
        )}

        {paquetes?.length === 0 && (
          <p className="rounded-md border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
            No hay paquetes en el catálogo todavía. Carga un tarifario para empezar a cotizar.
          </p>
        )}

        {paquetes && paquetes.length > 0 && (
          <div className="space-y-4">
            <section className="rounded-md border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold">Paquete y fechas</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-neutral-500">Paquete</span>
                  <select
                    value={paqueteId}
                    onChange={(e) => setPaqueteId(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-neutral-300 bg-white px-2 py-1.5 text-base"
                  >
                    {paquetes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-neutral-500">Fecha de salida</span>
                  <input
                    type="date"
                    value={fechaSalida}
                    onChange={(e) => setFechaSalida(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-neutral-300 px-2 py-1.5 text-base"
                  />
                </label>
              </div>
              {paquete && (
                <p className="mt-2 text-sm text-neutral-500">
                  {paquete.dias} días / {paquete.noches} noches · {paquete.destino} ·{' '}
                  {paquete.planAlimentacion.toLowerCase().replace(/_/g, ' ')}
                </p>
              )}
            </section>

            <section className="rounded-md border border-neutral-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold">Pasajeros y acomodación</h2>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ['Adultos', adultos, setAdultos, 1],
                    ['Niños', ninos, setNinos, 0],
                    ['Infantes', infantes, setInfantes, 0],
                  ] as const
                ).map(([etiqueta, valor, fijar, minimo]) => (
                  <label key={etiqueta} className="block">
                    <span className="text-xs text-neutral-500">{etiqueta}</span>
                    <input
                      type="number"
                      min={minimo}
                      value={valor}
                      onChange={(e) => fijar(Math.max(minimo, Number(e.target.value)))}
                      className="cifra mt-1 w-20 rounded-sm border border-neutral-300 px-2 py-1.5 text-base"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-4">
                <span className="text-xs text-neutral-500">Acomodación</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  <button
                    onClick={() => setAcomodacion('')}
                    className={`rounded-sm border px-2.5 py-1 text-sm ${
                      acomodacion === ''
                        ? 'border-acento-700 bg-acento-50 font-medium text-acento-800'
                        : 'border-neutral-300 text-neutral-600'
                    }`}
                  >
                    Sugerida
                  </button>
                  {ACOMODACIONES.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAcomodacion(a)}
                      className={`rounded-sm border px-2.5 py-1 text-sm ${
                        acomodacion === a
                          ? 'border-acento-700 bg-acento-50 font-medium text-acento-800'
                          : 'border-neutral-300 text-neutral-600'
                      }`}
                    >
                      {a.charAt(0) + a.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={cotizar}
                disabled={calculando}
                className="mt-4 rounded-sm bg-acento-700 px-4 py-2 text-base font-medium text-white hover:bg-acento-800 disabled:opacity-50"
              >
                {calculando ? 'Calculando…' : 'Calcular precio'}
              </button>
            </section>

            {error && (
              // El error dice QUÉ pasó y QUÉ hacer. Nunca "algo salió mal".
              <div
                role="alert"
                className="rounded-md border border-alerta-600/30 bg-alerta-50 p-4 text-base text-alerta-700"
              >
                <strong className="block font-semibold">{error.message}</strong>
                {error.details && (
                  <ul className="mt-1 list-disc pl-5 text-sm">
                    {Object.entries(error.details).map(([campo, mensaje]) => (
                      <li key={campo}>
                        <span className="font-medium">{campo}</span>: {String(mensaje)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {cotizacion && <Desglose c={cotizacion} />}
          </div>
        )}
      </main>

      {cotizacion && (
        <aside className="w-80 shrink-0 border-l border-neutral-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Resumen</h2>

          <p className="text-xs text-neutral-500">Total venta</p>
          <p className="cifra text-xl font-semibold">{formatearDinero(cotizacion.totalVenta)}</p>

          {cotizacion.totalNeto && (
            <p className="cifra mt-2 text-sm text-neutral-400">
              Costo neto {formatearDinero(cotizacion.totalNeto)}
            </p>
          )}

          {cotizacion.margen && (
            // El margen es lo más visible del panel a propósito: es el dato que ningún dueño
            // de agencia puede responder hoy sin abrir Excel.
            <div className="mt-3 rounded-md bg-ok-50 p-3">
              <p className="text-xs text-ok-700">Margen</p>
              <p className="cifra text-lg font-semibold text-ok-700">
                {formatearDinero(cotizacion.margen)}
                <span className="ml-1 text-sm font-normal">
                  ({cotizacion.margenPorcentaje?.toFixed(1)}%)
                </span>
              </p>
            </div>
          )}

          <label className="mt-4 block">
            <span className="text-xs text-neutral-500">Markup adicional (%)</span>
            <input
              type="number"
              value={markupExtra}
              onChange={(e) => setMarkupExtra(Number(e.target.value))}
              onBlur={cotizar}
              className="cifra mt-1 w-full rounded-sm border border-neutral-300 px-2 py-1.5 text-base"
            />
          </label>

          <div className="mt-5 space-y-2">
            <button className="w-full rounded-sm bg-acento-700 px-3 py-2 text-base font-medium text-white hover:bg-acento-800">
              Enviar por WhatsApp
            </button>
            <button className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base">
              Ver PDF
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function Desglose({ c }: { c: CotizacionCalculada }) {
  return (
    <section className="rounded-md border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Desglose</h2>
        <span className="rounded-sm bg-aviso-50 px-2 py-0.5 text-xs text-aviso-700">
          {c.temporadaNombre}
        </span>
        <span className="rounded-sm bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {c.habitaciones.length} hab. {c.acomodacion.toLowerCase()}
        </span>
        {/* Las plazas vacías se pagan igual. Es la pregunta que el viajero hace siempre. */}
        {c.plazasSinUsar > 0 && (
          <span className="rounded-sm bg-aviso-50 px-2 py-0.5 text-xs text-aviso-700">
            {c.plazasSinUsar} plaza{c.plazasSinUsar > 1 ? 's' : ''} sin usar, se paga igual
          </span>
        )}
      </div>

      <table className="w-full text-base">
        <thead>
          <tr className="border-b border-neutral-200 text-xs text-neutral-500">
            <th className="py-1.5 text-left font-medium">Concepto</th>
            <th className="py-1.5 text-right font-medium">Cant.</th>
            <th className="py-1.5 text-right font-medium">Venta unit.</th>
            <th className="py-1.5 text-right font-medium">Subtotal</th>
            {/* El neto NUNCA se muestra al cliente: es lo que cobra el mayorista. */}
            <th className="py-1.5 text-right font-medium text-neutral-400">
              Neto <span title="Solo visible para el equipo">·</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {c.lineas.map((l) => (
            <tr key={l.tipoPasajero} className="border-b border-neutral-100">
              <td className="py-1.5">
                {l.tipoPasajero === 'ADT' ? 'Adulto' : l.tipoPasajero === 'CHD' ? 'Niño' : 'Infante'}
              </td>
              <td className="cifra py-1.5 text-right">{l.cantidad}</td>
              <td className="cifra py-1.5 text-right">
                {formatearDinero(l.precioUnitarioVenta)}
              </td>
              <td className="cifra py-1.5 text-right font-medium">
                {formatearDinero(l.subtotalVenta)}
              </td>
              <td className="cifra py-1.5 text-right text-neutral-400">
                {l.subtotalNeto ? formatearDinero(l.subtotalNeto) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-sm text-neutral-500">
        Salida {c.fechaSalida} · regreso {c.fechaRegreso}
      </p>
    </section>
  );
}
