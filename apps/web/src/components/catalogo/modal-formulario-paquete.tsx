'use client';

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, PackagePlus, Edit } from 'lucide-react';
import type { PlanAlimentacion, ResumenDePaqueteGestion } from '@viajapro/contracts';
import {
  validarFormularioCrearPaquete,
  validarFormularioEditarPaquete,
  type FormularioPaqueteValores,
} from '../../lib/catalogo-gestion-logica';

interface ModalFormularioPaqueteProps {
  abierto: boolean;
  alCerrar: () => void;
  alGuardar: (valores: FormularioPaqueteValores, idEdicion?: string) => Promise<void>;
  paqueteAEditar?: ResumenDePaqueteGestion | null;
}

export function ModalFormularioPaquete({
  abierto,
  alCerrar,
  alGuardar,
  paqueteAEditar,
}: ModalFormularioPaqueteProps) {
  const esEdicion = Boolean(paqueteAEditar);

  const [nombre, setNombre] = useState('');
  const [destino, setDestino] = useState('');
  const [dias, setDias] = useState<number | string>(1);
  const [noches, setNoches] = useState<number | string>(0);
  const [planAlimentacion, setPlanAlimentacion] = useState<PlanAlimentacion | 'SIN_DECLARAR' | ''>(
    'SIN_DECLARAR',
  );
  const [codigo, setCodigo] = useState('');
  const [formato, setFormato] = useState('');
  const [inclusiones, setInclusiones] = useState('');
  const [exclusiones, setExclusiones] = useState('');

  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;

    if (paqueteAEditar) {
      setNombre(paqueteAEditar.nombre);
      setDestino(paqueteAEditar.destino);
      setDias(paqueteAEditar.dias);
      setNoches(paqueteAEditar.noches);
      setPlanAlimentacion(paqueteAEditar.planAlimentacion ?? 'SIN_DECLARAR');
      setCodigo(paqueteAEditar.codigo ?? '');
      setFormato(paqueteAEditar.formato?.nombre ?? '');
      setInclusiones((paqueteAEditar.inclusiones ?? []).join('\n'));
      setExclusiones((paqueteAEditar.exclusiones ?? []).join('\n'));
    } else {
      setNombre('');
      setDestino('');
      setDias(1);
      setNoches(0);
      setPlanAlimentacion('SIN_DECLARAR');
      setCodigo('');
      setFormato('');
      setInclusiones('');
      setExclusiones('');
    }
    setErrores({});
    setErrorServidor(null);
  }, [abierto, paqueteAEditar]);

  if (!abierto) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrores({});
    setErrorServidor(null);

    const valores: FormularioPaqueteValores = {
      nombre,
      destino,
      dias,
      noches,
      planAlimentacion,
      codigo,
      formato,
      inclusiones,
      exclusiones,
    };

    if (esEdicion) {
      const validacion = validarFormularioEditarPaquete(valores);
      if (!validacion.exito) {
        setErrores(validacion.errores);
        return;
      }
    } else {
      const validacion = validarFormularioCrearPaquete(valores);
      if (!validacion.exito) {
        setErrores(validacion.errores);
        return;
      }
    }

    try {
      setGuardando(true);
      await alGuardar(valores, paqueteAEditar?.id);
      alCerrar();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Ocurrió un error inesperado al guardar el producto.';
      setErrorServidor(msg);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-paquete"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-6 py-4 dark:border-neutral-800 dark:bg-neutral-800/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              {esEdicion ? <Edit className="h-5 w-5" /> : <PackagePlus className="h-5 w-5" />}
            </span>
            <div>
              <h2
                id="titulo-modal-paquete"
                data-testid="titulo-modal-paquete"
                className="text-base font-bold text-neutral-900 dark:text-white"
              >
                {esEdicion ? 'Editar Producto del Catálogo' : 'Nuevo Producto Turístico'}
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {esEdicion
                  ? 'Modifica las condiciones comerciales y operativas del paquete'
                  : 'Registra un nuevo producto, excursión o paquete en el catálogo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            data-testid="boton-cerrar-modal-paquete"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario con scroll */}
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="flex flex-1 flex-col overflow-y-auto p-6"
        >
          {errorServidor && (
            <div
              role="alert"
              data-testid="error-servidor-paquete"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorServidor}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Nombre */}
            <div>
              <label
                htmlFor="campo-nombre-paquete"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Nombre del producto *
              </label>
              <input
                id="campo-nombre-paquete"
                data-testid="input-nombre-paquete"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Pasadía Islas del Rosario & Barú VIP"
                className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:bg-neutral-800 dark:text-white ${
                  errores.nombre
                    ? 'border-red-500 ring-1 ring-red-500'
                    : 'border-neutral-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-neutral-700'
                }`}
              />
              {errores.nombre && (
                <p
                  data-testid="error-campo-nombre"
                  className="mt-1 text-xs text-red-600 dark:text-red-400"
                >
                  {errores.nombre}
                </p>
              )}
            </div>

            {/* Fila: Destino y Código */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="campo-destino-paquete"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Destino turístico *
                </label>
                <input
                  id="campo-destino-paquete"
                  data-testid="input-destino-paquete"
                  type="text"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  placeholder="Ej. Cartagena, San Andrés, Santa Marta"
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:bg-neutral-800 dark:text-white ${
                    errores.destino
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-neutral-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-neutral-700'
                  }`}
                />
                {errores.destino && (
                  <p
                    data-testid="error-campo-destino"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errores.destino}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="campo-codigo-paquete"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Código / Clave natural (opcional)
                </label>
                <input
                  id="campo-codigo-paquete"
                  data-testid="input-codigo-paquete"
                  type="text"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="Ej. PKG-CTG-001"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                {errores.codigo && (
                  <p
                    data-testid="error-campo-codigo"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errores.codigo}
                  </p>
                )}
              </div>
            </div>

            {/* Fila: Días y Noches (con validación de coherencia) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="campo-dias-paquete"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Días de viaje *
                </label>
                <input
                  id="campo-dias-paquete"
                  data-testid="input-dias-paquete"
                  type="number"
                  min={1}
                  max={365}
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:bg-neutral-800 dark:text-white ${
                    errores.dias
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-neutral-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-neutral-700'
                  }`}
                />
                {errores.dias && (
                  <p
                    data-testid="error-campo-dias"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errores.dias}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="campo-noches-paquete"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Noches de alojamiento *
                </label>
                <input
                  id="campo-noches-paquete"
                  data-testid="input-noches-paquete"
                  type="number"
                  min={0}
                  max={364}
                  value={noches}
                  onChange={(e) => setNoches(e.target.value)}
                  className={`mt-1.5 min-h-[44px] w-full rounded-xl border px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-hidden dark:bg-neutral-800 dark:text-white ${
                    errores.noches
                      ? 'border-red-500 ring-1 ring-red-500'
                      : 'border-neutral-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-neutral-700'
                  }`}
                />
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Pasadía = 1D / 0N. Paquete con hotel = días iguales o +1 a noches.
                </p>
                {errores.noches && (
                  <p
                    data-testid="error-campo-noches"
                    className="mt-1 text-xs text-red-600 dark:text-red-400"
                  >
                    {errores.noches}
                  </p>
                )}
              </div>
            </div>

            {/* Fila: Plan de Alimentación y Formato */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="campo-plan-alimentacion"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Plan de alimentación
                </label>
                <select
                  id="campo-plan-alimentacion"
                  data-testid="select-plan-alimentacion"
                  value={planAlimentacion ?? 'SIN_DECLARAR'}
                  onChange={(e) =>
                    setPlanAlimentacion(e.target.value as PlanAlimentacion | 'SIN_DECLARAR')
                  }
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-700 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="SIN_DECLARAR">Sin declarar / No aplica (Pasadía)</option>
                  <option value="TODO_INCLUIDO">Todo Incluido</option>
                  <option value="SOLO_DESAYUNO">Solo Desayuno</option>
                  <option value="MEDIA_PENSION">Media Pensión</option>
                  <option value="PENSION_COMPLETA">Pensión Completa</option>
                  <option value="SIN_ALIMENTACION">Sin Alimentación</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="campo-formato-paquete"
                  className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Formato de viaje (opcional)
                </label>
                <input
                  id="campo-formato-paquete"
                  data-testid="input-formato-paquete"
                  type="text"
                  value={formato}
                  onChange={(e) => setFormato(e.target.value)}
                  placeholder="Ej. Vuelo + Hotel, Pasadía Náutica"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>

            {/* Inclusiones */}
            <div>
              <label
                htmlFor="campo-inclusiones"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Inclusiones (una por línea)
              </label>
              <textarea
                id="campo-inclusiones"
                data-testid="textarea-inclusiones"
                rows={3}
                value={inclusiones}
                onChange={(e) => setInclusiones(e.target.value)}
                placeholder={
                  'Tiquetes aéreos ida y regreso\nTraslados aeropuerto - hotel\nDesayuno buffet diario'
                }
                className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            {/* Exclusiones */}
            <div>
              <label
                htmlFor="campo-exclusiones"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Exclusiones (una por línea)
              </label>
              <textarea
                id="campo-exclusiones"
                data-testid="textarea-exclusiones"
                rows={2}
                value={exclusiones}
                onChange={(e) => setExclusiones(e.target.value)}
                placeholder={'Impuesto de muelle\nGastos personales y propinas'}
                className="mt-1.5 w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder-neutral-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          {/* Botones de acción */}
          <div className="mt-6 flex flex-col-reverse justify-end gap-2 border-t border-neutral-100 pt-4 sm:flex-row dark:border-neutral-800">
            <button
              type="button"
              onClick={alCerrar}
              disabled={guardando}
              data-testid="boton-cancelar-paquete"
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              data-testid="boton-guardar-paquete"
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear producto'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
