'use client';

import React, { useState, useEffect } from 'react';
import { FormInput, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  obtenerCamposDefinidosStorage,
  type DefinicionCampoPersonalizado,
  validarValorCampoPersonalizado,
} from '../../lib/campos-personalizados-logica';

interface SeccionCamposPersonalizadosProps {
  entidad: 'contacto' | 'oportunidad';
  entidadId: string;
  valoresIniciales?: Record<string, unknown>;
  onGuardar?: (valores: Record<string, unknown>) => void;
}

export function SeccionCamposPersonalizados({
  entidad,
  entidadId,
  valoresIniciales = {},
  onGuardar,
}: SeccionCamposPersonalizadosProps) {
  const [definiciones, setDefiniciones] = useState<DefinicionCampoPersonalizado[]>([]);
  const [valores, setValores] = useState<Record<string, unknown>>(valoresIniciales);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    const todos = obtenerCamposDefinidosStorage();
    const filtrados = todos.filter((c) => c.entidad === entidad);
    setDefiniciones(filtrados);
  }, [entidad]);

  useEffect(() => {
    // Si hay valores guardados en localStorage para esta entidad concreta, cargarlos
    const storageKey = `viajapro_valores_campos_${entidad}_${entidadId}`;
    try {
      const guardadoLocal = localStorage.getItem(storageKey);
      if (guardadoLocal) {
        const parsed = JSON.parse(guardadoLocal) as Record<string, unknown>;
        setValores((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignorar
    }
  }, [entidad, entidadId]);

  const handleChange = (clave: string, valor: unknown) => {
    setValores((prev) => ({ ...prev, [clave]: valor }));
    // Limpiar error al escribir
    if (errores[clave]) {
      setErrores((prev) => {
        const nuevo = { ...prev };
        delete nuevo[clave];
        return nuevo;
      });
    }
  };

  const manejarGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    const nuevosErrores: Record<string, string> = {};

    for (const def of definiciones) {
      const val = valores[def.clave];
      const res = validarValorCampoPersonalizado(def, val);
      if (!res.valido && res.error) {
        nuevosErrores[def.clave] = res.error;
      }
    }

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);
      return;
    }

    // Persistir en localStorage
    const storageKey = `viajapro_valores_campos_${entidad}_${entidadId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(valores));
    } catch {
      // Ignorar
    }

    if (onGuardar) onGuardar(valores);

    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  if (definiciones.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
      <div className="flex items-center justify-between border-b border-neutral-200/80 pb-2 dark:border-neutral-700/60">
        <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
          <FormInput className="text-acento-600 dark:text-acento-400 h-4 w-4" />
          <span>Campos Personalizados ({entidad === 'contacto' ? 'Viajero' : 'Oportunidad'}):</span>
        </div>
      </div>

      <form onSubmit={manejarGuardar} className="space-y-3.5">
        {definiciones.map((def) => {
          const rawVal = valores[def.clave];
          const val =
            typeof rawVal === 'string' || typeof rawVal === 'number' ? String(rawVal) : '';
          const err = errores[def.clave];

          return (
            <div key={def.id} className="space-y-1">
              <label
                htmlFor={`campo-${def.clave}`}
                className="flex items-center justify-between text-xs font-medium text-neutral-700 dark:text-neutral-300"
              >
                <span>
                  {def.nombre} {def.requerido && <span className="font-bold text-rose-500">*</span>}
                </span>
                {def.descripcion && (
                  <span
                    className="max-w-[200px] truncate text-[10px] text-neutral-400"
                    title={def.descripcion}
                  >
                    {def.descripcion}
                  </span>
                )}
              </label>

              {def.tipo === 'lista' ? (
                <select
                  id={`campo-${def.clave}`}
                  value={val}
                  onChange={(e) => handleChange(def.clave, e.target.value)}
                  className="focus:border-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="">Selecciona una opción...</option>
                  {def.opciones?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : def.tipo === 'numero' ? (
                <input
                  id={`campo-${def.clave}`}
                  type="number"
                  value={val}
                  onChange={(e) => handleChange(def.clave, e.target.value)}
                  placeholder="0"
                  className="cifra focus:border-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              ) : def.tipo === 'fecha' ? (
                <input
                  id={`campo-${def.clave}`}
                  type="date"
                  value={val}
                  onChange={(e) => handleChange(def.clave, e.target.value)}
                  className="focus:border-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              ) : (
                <input
                  id={`campo-${def.clave}`}
                  type="text"
                  value={val}
                  onChange={(e) => handleChange(def.clave, e.target.value)}
                  placeholder={`Escribe ${def.nombre.toLowerCase()}...`}
                  className="focus:border-acento-600 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              )}

              {err && (
                <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span>{err}</span>
                </p>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-2">
          {guardado ? (
            <span
              role="status"
              className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-4 w-4" />
              Guardado
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-xs transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span>Guardar campos</span>
          </button>
        </div>
      </form>
    </div>
  );
}
