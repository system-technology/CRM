'use client';

import React, { useId, useState } from 'react';
import type { Dinero, MedioDePago, RegistrarPago } from '@viajapro/contracts';
import { MedioDePago as EsquemaMedioDePago } from '@viajapro/contracts';
import {
  ETIQUETA_MEDIO_DE_PAGO,
  aUnidadesMinimas,
  admiteCentavos,
  hoyEnLaAgencia,
} from '../../lib/cobros-logica';
import { formatearDinero } from '../../lib/formato';
import { useFocoModal } from '../../lib/use-foco-modal';
import { CampoFecha } from '../comun/campo-fecha';

interface DialogoRegistrarPagoProps {
  numero: number;
  moneda: Dinero['moneda'];
  /** Lo que falta por cobrar cuando se abre el diálogo: contexto, no un valor que se envíe. */
  saldo: Dinero;
  /** Zona de la agencia (R9): el «hoy» del campo de fecha es el suyo, no el del navegador. */
  zona: string;
  enviando: boolean;
  errorServidor: string | null;
  /** El servidor rechazó por sobrepago: se ofrece confirmarlo en vez de bloquear. */
  pedirConfirmarSobrepago: boolean;
  onRegistrar: (pago: RegistrarPago) => void;
  onCerrar: () => void;
}

const CAMPO =
  'focus-visible:ring-acento-600 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white';

/**
 * «Registrar pago» (T-331, ADR-0034). El asesor registra **solo el PAGO del viajero**: devolver,
 * ajustar o reversar es de `cobro.corregir` y no se ofrece aquí.
 *
 * El verbo es el mismo en el botón que abre, en el que confirma y en el aviso de éxito:
 * *registrar*. Nada de «Guardar».
 *
 * La moneda no se elige: es la del archivo de viaje y el servidor rechaza cualquier otra
 * (`MONEDA_DISTINTA_DEL_ARCHIVO`). Se muestra junto al monto para que quede dicha, y viaja
 * explícita en el cuerpo de la petición.
 */
export function DialogoRegistrarPago({
  numero,
  moneda,
  saldo,
  zona,
  enviando,
  errorServidor,
  pedirConfirmarSobrepago,
  onRegistrar,
  onCerrar,
}: DialogoRegistrarPagoProps) {
  const hoy = hoyEnLaAgencia(zona);
  const [monto, setMonto] = useState('');
  const [pagadoEl, setPagadoEl] = useState(hoy);
  const [medio, setMedio] = useState<MedioDePago | ''>('');
  const [referencia, setReferencia] = useState('');
  const [nota, setNota] = useState('');
  const [confirmaSobrepago, setConfirmaSobrepago] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });

  /**
   * Una sola clave por intento de pago, estable entre reintentos (R5): si la red se corta después
   * de que el servidor guardó, reintentar devuelve la misma fila en lugar de cobrar dos veces.
   */
  const [claveIdempotencia] = useState(() => crypto.randomUUID());
  const id = useId();

  const registrar = (e: React.FormEvent) => {
    e.preventDefault();
    const cifra = aUnidadesMinimas(monto, moneda);
    if (!cifra.ok) {
      setError(cifra.motivo);
      return;
    }
    if (!medio) {
      setError('Elige cómo pagó el viajero.');
      return;
    }
    if (!pagadoEl) {
      setError('Escribe la fecha del pago como día/mes/año, por ejemplo 15/12/2026.');
      return;
    }
    if (pagadoEl > hoy) {
      setError('La fecha del pago no puede ser futura. Elige hoy o un día anterior.');
      return;
    }
    setError(null);
    onRegistrar({
      tipo: 'PAGO',
      claveIdempotencia,
      monto: { unidades: cifra.unidades, moneda },
      pagadoEl,
      medio,
      ...(referencia.trim() ? { referencia: referencia.trim() } : {}),
      ...(nota.trim() ? { nota: nota.trim() } : {}),
      ...(confirmaSobrepago ? { confirmarSobrepago: true } : {}),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-titulo`}
      onClick={onCerrar}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
    >
      <div
        ref={contenedorRef}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-neutral-900"
      >
        <h2 id={`${id}-titulo`} className="text-base font-bold">
          Registrar pago del file {numero}
        </h2>
        <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
          Falta por cobrar {formatearDinero(saldo)}. Queda en el historial a tu nombre y no se puede
          borrar.
        </p>

        <form onSubmit={registrar} className="mt-4 space-y-3">
          <div>
            <label htmlFor={`${id}-monto`} className="mb-1 block text-xs font-medium">
              Cuánto pagó *
            </label>
            <div className="flex items-stretch gap-2">
              <span
                aria-hidden="true"
                className="flex min-h-[44px] items-center rounded-lg bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                {moneda}
              </span>
              <input
                id={`${id}-monto`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder={admiteCentavos(moneda) ? '1.250,50' : '1.250.000'}
                aria-describedby={`${id}-monto-ayuda`}
                className={`${CAMPO} tabular-nums`}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
            <p
              id={`${id}-monto-ayuda`}
              className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400"
            >
              En {moneda}, la moneda del archivo.{' '}
              {admiteCentavos(moneda)
                ? 'Punto para los miles y coma para los decimales.'
                : 'Sin centavos: el peso es la unidad.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-fecha`} className="mb-1 block text-xs font-medium">
                Fecha del pago *
              </label>
              <CampoFecha
                id={`${id}-fecha`}
                valor={pagadoEl}
                onChange={setPagadoEl}
                className={CAMPO}
                data-testid="fecha-del-pago"
              />
            </div>
            <div>
              <label htmlFor={`${id}-medio`} className="mb-1 block text-xs font-medium">
                Cómo pagó *
              </label>
              <select
                id={`${id}-medio`}
                className={CAMPO}
                value={medio}
                onChange={(e) => setMedio(e.target.value as MedioDePago | '')}
              >
                <option value="">Elige el medio…</option>
                {EsquemaMedioDePago.options.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_MEDIO_DE_PAGO[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={`${id}-referencia`} className="mb-1 block text-xs font-medium">
              Referencia (opcional)
            </label>
            <input
              id={`${id}-referencia`}
              type="text"
              maxLength={100}
              placeholder="Banco y últimos dígitos, número de consignación…"
              className={CAMPO}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor={`${id}-nota`} className="mb-1 block text-xs font-medium">
              Nota (opcional)
            </label>
            <textarea
              id={`${id}-nota`}
              rows={2}
              maxLength={500}
              className={CAMPO}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
              No escribas números de tarjeta: no se guardan.
            </p>
          </div>

          {(error ?? errorServidor) && (
            <p
              role="alert"
              data-testid="error-registrar-pago"
              className="border-alerta-600/40 bg-alerta-50 text-alerta-700 dark:bg-alerta-600/15 dark:text-alerta-600 rounded-lg border px-3 py-2 text-xs"
            >
              {error ?? errorServidor}
            </p>
          )}

          {pedirConfirmarSobrepago && (
            <label className="border-aviso-600/40 bg-aviso-50 dark:bg-aviso-600/15 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={confirmaSobrepago}
                onChange={(e) => setConfirmaSobrepago(e.target.checked)}
              />
              <span className="text-aviso-700 dark:text-aviso-600">
                Sí, el viajero pagó de más y el archivo queda con saldo a favor.
              </span>
            </label>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCerrar}
              disabled={enviando}
              className="focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-4 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={enviando || (pedirConfirmarSobrepago && !confirmaSobrepago)}
              className="bg-acento-700 hover:bg-acento-800 focus-visible:ring-acento-600 min-h-[44px] rounded-xl px-4 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
            >
              {enviando ? 'Registrando…' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
