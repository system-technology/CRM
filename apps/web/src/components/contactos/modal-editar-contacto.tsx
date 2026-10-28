'use client';

import React, { useState } from 'react';
import { type Contacto, type EditarContacto } from '@viajapro/contracts';
import { useFocoModal } from '../../lib/use-foco-modal';
import { X, User, Loader2, AlertCircle } from 'lucide-react';
import { formatearErrorAmigable } from '../../lib/estados-ui-logica';

interface ModalEditarContactoProps {
  contacto: Contacto;
  onCerrar: () => void;
  onGuardar: (cambios: EditarContacto) => Promise<void>;
}

export function ModalEditarContacto({ contacto, onCerrar, onGuardar }: ModalEditarContactoProps) {
  const modalRef = useFocoModal<HTMLDivElement>({ abierto: true, alCerrar: onCerrar });

  const [nombre, setNombre] = useState(contacto.nombre ?? '');
  const [telefono, setTelefono] = useState(contacto.telefono);
  const [correo, setCorreo] = useState(contacto.correo ?? '');
  const [etiquetasTexto, setEtiquetasTexto] = useState(contacto.etiquetas.join(', '));
  const [preferencias, setPreferencias] = useState(contacto.preferencias ?? '');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const etiquetasArray = etiquetasTexto
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const cambios: EditarContacto = {
      ...(nombre.trim() !== (contacto.nombre ?? '') && { nombre: nombre.trim() || null }),
      ...(telefono.trim() !== contacto.telefono && { telefono: telefono.trim() }),
      ...(correo.trim() !== (contacto.correo ?? '') && { correo: correo.trim() || null }),
      etiquetas: etiquetasArray,
      ...(preferencias.trim() !== (contacto.preferencias ?? '') && {
        preferencias: preferencias.trim() || null,
      }),
    };

    setGuardando(true);
    try {
      await onGuardar(cambios);
      onCerrar();
    } catch (err) {
      setError(
        formatearErrorAmigable(
          err,
          'No fue posible actualizar el contacto. Verifica los datos e intenta nuevamente.',
        ),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-editar-contacto"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="titulo-modal-editar-contacto"
                className="text-base font-bold text-neutral-900 dark:text-neutral-100"
              >
                Editar Ficha del Contacto
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Actualiza datos demográficos y preferencias del viajero
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Cerrar modal de edición"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <div>
              <p className="font-semibold">Atención</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="mt-5 space-y-4"
        >
          <div>
            <label
              htmlFor="editar-contacto-nombre"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Nombre completo
            </label>
            <div className="relative mt-1">
              <input
                id="editar-contacto-nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Laura Restrepo"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="editar-contacto-telefono"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Teléfono móvil (E.164) *
              </label>
              <div className="relative mt-1">
                <input
                  id="editar-contacto-telefono"
                  type="text"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+573001234567"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="editar-contacto-correo"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Correo electrónico
              </label>
              <div className="relative mt-1">
                <input
                  id="editar-contacto-correo"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="editar-contacto-etiquetas"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Etiquetas (separadas por coma)
            </label>
            <div className="relative mt-1">
              <input
                id="editar-contacto-etiquetas"
                type="text"
                value={etiquetasTexto}
                onChange={(e) => setEtiquetasTexto(e.target.value)}
                placeholder="VIP, Caribe, Familia"
                className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="editar-contacto-preferencias"
              className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            >
              Preferencias y notas de viaje
            </label>
            <div className="relative mt-1">
              <textarea
                id="editar-contacto-preferencias"
                rows={3}
                value={preferencias}
                onChange={(e) => setPreferencias(e.target.value)}
                placeholder="Hoteles 5 estrellas frente al mar, régimen Todo Incluido, vuelos matutinos..."
                className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 focus:ring-2 focus:ring-teal-500/20 focus:outline-hidden disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
            >
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar Cambios</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
