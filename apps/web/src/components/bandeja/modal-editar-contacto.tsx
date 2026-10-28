'use client';

import React, { useState } from 'react';
import type { Contacto } from '@viajapro/contracts';
import { User, X, Check, Loader2, AlertTriangle, Phone, Mail, Tag } from 'lucide-react';
import { editarContactoApi } from '../../lib/crm-api';

export interface ModalEditarContactoProps {
  contacto: Contacto;
  onCerrar: () => void;
  onContactoActualizado: (contactoActualizado: Contacto) => void;
}

export function ModalEditarContacto({
  contacto,
  onCerrar,
  onContactoActualizado,
}: ModalEditarContactoProps) {
  const [nombre, setNombre] = useState(contacto.nombre ?? '');
  const [telefono, setTelefono] = useState(contacto.telefono);
  const [correo, setCorreo] = useState(contacto.correo ?? '');
  const [etiquetasTexto, setEtiquetasTexto] = useState(contacto.etiquetas.join(', '));
  const [preferencias, setPreferencias] = useState(contacto.preferencias ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!telefono.trim()) {
      setError('El teléfono es obligatorio y debe incluir código de país (ej. +573001234567).');
      return;
    }

    setGuardando(true);
    setError(null);

    const etiquetasArray = etiquetasTexto
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      const contactoActualizado = await editarContactoApi(contacto.id, {
        nombre: nombre.trim() || null,
        telefono: telefono.trim(),
        correo: correo.trim() || null,
        etiquetas: etiquetasArray,
        preferencias: preferencias.trim() || null,
      });

      onContactoActualizado(contactoActualizado);
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el contacto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-editar-contacto-titulo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-4"
    >
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 sm:px-6 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="bg-acento-500/10 text-acento-600 dark:bg-acento-400/10 dark:text-acento-400 flex h-9 w-9 items-center justify-center rounded-xl">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="modal-editar-contacto-titulo"
                className="text-sm font-bold text-neutral-900 sm:text-base dark:text-neutral-100"
              >
                Editar Información del Contacto
              </h2>
              <p className="text-[11px] text-neutral-500 sm:text-xs dark:text-neutral-400">
                Datos asociados en el CRM y WhatsApp
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            aria-label="Cerrar modal de editar contacto"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit(e);
          }}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="space-y-4 px-4 py-4 sm:px-6">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <p className="min-w-0 flex-1">{error}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="input-nombre-contacto"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Nombre del viajero / contacto
              </label>
              <input
                id="input-nombre-contacto"
                data-testid="input-nombre-contacto"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Ana María Martínez"
                className="focus:border-acento-600 mt-1.5 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            <div>
              <label
                htmlFor="input-telefono-contacto"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Teléfono de WhatsApp (formato internacional E.164){' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1.5">
                <Phone className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                <input
                  id="input-telefono-contacto"
                  data-testid="input-telefono-contacto"
                  type="tel"
                  required
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. +573001234567"
                  className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-correo-contacto"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Correo electrónico
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                <input
                  id="input-correo-contacto"
                  data-testid="input-correo-contacto"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="Ej. ana.martinez@ejemplo.com"
                  className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-etiquetas-contacto"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Etiquetas (separadas por comas)
              </label>
              <div className="relative mt-1.5">
                <Tag className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                <input
                  id="input-etiquetas-contacto"
                  data-testid="input-etiquetas-contacto"
                  type="text"
                  value={etiquetasTexto}
                  onChange={(e) => setEtiquetasTexto(e.target.value)}
                  placeholder="Ej. VIP, Luna de Miel, Cancún"
                  className="focus:border-acento-600 flex min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white py-2 pr-3 pl-9 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="input-preferencias-contacto"
                className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300"
              >
                Preferencias y notas del viajero
              </label>
              <div className="relative mt-1.5">
                <textarea
                  id="input-preferencias-contacto"
                  data-testid="input-preferencias-contacto"
                  rows={3}
                  value={preferencias}
                  onChange={(e) => setPreferencias(e.target.value)}
                  placeholder="Preferencias de asiento, cadenas de hotel favoritas, restricciones..."
                  className="focus:border-acento-600 flex w-full rounded-xl border border-neutral-300 bg-white p-3 text-xs font-medium text-neutral-900 shadow-2xs focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            </div>
          </div>

          {/* Botones al pie */}
          <div className="flex flex-col-reverse gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 dark:border-neutral-800 dark:bg-neutral-900/60">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="boton-guardar-contacto"
              disabled={guardando || !telefono.trim()}
              className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all active:scale-98 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Guardar cambios</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
