'use client';

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  ReemplazarPasajeros as EsquemaReemplazarPasajeros,
  type PasajeroDelArchivo,
  type ReemplazarPasajeros,
  type TipoPasajero,
} from '@viajapro/contracts';

interface FilaEditable {
  clave: string;
  nombre: string;
  tipo: TipoPasajero;
  edad: string;
  esTitular: boolean;
}

interface EditorPasajerosProps {
  pasajeros: PasajeroDelArchivo[];
  enviando: boolean;
  errorServidor: string | null;
  onGuardar: (cambio: ReemplazarPasajeros) => void;
  onCancelar: () => void;
}

const CAMPO =
  'focus-visible:ring-acento-600 min-h-[44px] rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white';

const NOMBRE_TIPO: Record<TipoPasajero, string> = {
  ADT: 'Adulto',
  CHD: 'Niño',
  INF: 'Infante',
};

let contador = 0;
const clave = () => `fila-${(contador += 1)}`;

/** Reemplaza la lista completa de pasajeros (el orden de las filas es el orden). */
export function EditorPasajeros({
  pasajeros,
  enviando,
  errorServidor,
  onGuardar,
  onCancelar,
}: EditorPasajerosProps) {
  const [filas, setFilas] = useState<FilaEditable[]>(() =>
    pasajeros.map((p) => ({
      clave: clave(),
      nombre: p.nombre,
      tipo: p.tipo,
      edad: p.edadAlViaje === null ? '' : String(p.edadAlViaje),
      esTitular: p.esTitular,
    })),
  );
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const cambiar = (k: string, parcial: Partial<FilaEditable>) =>
    setFilas((fs) => fs.map((f) => (f.clave === k ? { ...f, ...parcial } : f)));

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const parseo = EsquemaReemplazarPasajeros.safeParse({
      pasajeros: filas.map((f) => ({
        nombre: f.nombre,
        tipo: f.tipo,
        edadAlViaje: f.edad.trim() === '' ? null : Number(f.edad),
        esTitular: f.esTitular,
      })),
    });
    if (!parseo.success) {
      setErrorLocal('Revisa la lista: cada pasajero necesita nombre y la edad debe ser un número.');
      return;
    }
    setErrorLocal(null);
    onGuardar(parseo.data);
  };

  return (
    <form onSubmit={guardar} aria-label="Editar pasajeros" className="space-y-3">
      <ul className="space-y-3">
        {filas.map((f, i) => (
          <li
            key={f.clave}
            className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-[1fr_8rem_6rem_auto] dark:border-neutral-700"
          >
            <input
              aria-label={`Nombre del pasajero ${i + 1}`}
              className={`${CAMPO} col-span-2 sm:col-span-1`}
              value={f.nombre}
              maxLength={200}
              onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
            />
            <select
              aria-label={`Tipo del pasajero ${i + 1}`}
              className={CAMPO}
              value={f.tipo}
              onChange={(e) => cambiar(f.clave, { tipo: e.target.value as TipoPasajero })}
            >
              {(Object.keys(NOMBRE_TIPO) as TipoPasajero[]).map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO[t]}
                </option>
              ))}
            </select>
            <input
              aria-label={`Edad al viaje del pasajero ${i + 1}`}
              inputMode="numeric"
              placeholder="Edad"
              className={CAMPO}
              value={f.edad}
              onChange={(e) => cambiar(f.clave, { edad: e.target.value.replace(/\D/g, '') })}
            />
            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1">
              <label className="flex min-h-[44px] items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="titular"
                  checked={f.esTitular}
                  onChange={() =>
                    setFilas((fs) => fs.map((x) => ({ ...x, esTitular: x.clave === f.clave })))
                  }
                />
                Titular
              </label>
              <button
                type="button"
                aria-label={`Quitar al pasajero ${i + 1}`}
                onClick={() => setFilas((fs) => fs.filter((x) => x.clave !== f.clave))}
                className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() =>
          setFilas((fs) => [
            ...fs,
            { clave: clave(), nombre: '', tipo: 'ADT', edad: '', esTitular: fs.length === 0 },
          ])
        }
        className="focus-visible:ring-acento-600 flex min-h-[44px] items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Agregar pasajero
      </button>

      {(errorLocal ?? errorServidor) && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
        >
          {errorLocal ?? errorServidor}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={enviando}
          className="boton-primario min-h-[44px] rounded-xl px-4 text-xs font-semibold disabled:opacity-60"
        >
          {enviando ? 'Guardando…' : 'Guardar pasajeros'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          className="focus-visible:ring-acento-600 min-h-[44px] rounded-xl border border-neutral-300 px-4 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-700"
        >
          Volver
        </button>
      </div>
    </form>
  );
}
