'use client';

import React, { useState } from 'react';
import { Sparkles, Building2, Palette, MapPin, Phone, Check, AlertCircle } from 'lucide-react';
import {
  type DatosMarcaOnboarding,
  PALETAS_MARCA_PREDEFINIDAS,
  validarPasoMarca,
} from '../../lib/onboarding-logica';

export interface PasoMarcaProps {
  datos: DatosMarcaOnboarding;
  alGuardar: (datos: DatosMarcaOnboarding) => void;
  alOmitir: () => void;
}

export function PasoMarca({ datos, alGuardar, alOmitir }: PasoMarcaProps) {
  const [marca, setMarca] = useState<DatosMarcaOnboarding>(datos);
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);

  const handleSeleccionarColor = (colorHex: string) => {
    setMarca((prev) => ({ ...prev, colorAcento: colorHex }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validacion = validarPasoMarca(marca);
    if (!validacion.valido) {
      setErrorValidacion(validacion.error ?? 'Datos de marca incompletos');
      return;
    }
    setErrorValidacion(null);
    alGuardar(marca);
  };

  return (
    <form onSubmit={handleSubmit} data-testid="paso-marca-form" className="space-y-6">
      {/* Alerta de Error */}
      {errorValidacion && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorValidacion}</span>
        </div>
      )}

      {/* Grid de Configuración y Vista Previa */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Formulario Principal (7 cols) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
              <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Datos Principales de la Agencia</span>
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Esta información encabezará tus cotizaciones y mensajes automáticos por WhatsApp.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Nombre Comercial de la Agencia *
                </label>
                <input
                  type="text"
                  required
                  value={marca.nombreComercial}
                  onChange={(e) => setMarca({ ...marca, nombreComercial: e.target.value })}
                  placeholder="Ej. Caribe Tour Express"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Razón Social Legal
                  </label>
                  <input
                    type="text"
                    value={marca.razonSocial}
                    onChange={(e) => setMarca({ ...marca, razonSocial: e.target.value })}
                    placeholder="Ej. Caribe Tour S.A.S."
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    NIT (Colombia)
                  </label>
                  <input
                    type="text"
                    value={marca.nit}
                    onChange={(e) => setMarca({ ...marca, nit: e.target.value })}
                    placeholder="901.482.910-3"
                    className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Ciudad Base / Región
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={marca.ciudadBase}
                      onChange={(e) => setMarca({ ...marca, ciudadBase: e.target.value })}
                      placeholder="Ej. Cartagena de Indias"
                      className="min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <MapPin className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Teléfono Oficial de Contacto
                  </label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={marca.telefonoContacto}
                      onChange={(e) => setMarca({ ...marca, telefonoContacto: e.target.value })}
                      placeholder="+57 300 123 4567"
                      className="min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 pl-9 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    <Phone className="pointer-events-none absolute top-3 left-3 h-4 w-4 text-neutral-400" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Lema Comercial o Eslogan
                </label>
                <input
                  type="text"
                  value={marca.lema}
                  onChange={(e) => setMarca({ ...marca, lema: e.target.value })}
                  placeholder="Ej. Experiencias auténticas por el Caribe colombiano"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-300 px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Selector de Color de Marca */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-white">
              <Palette className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Color de Acento de la Agencia (T-039)</span>
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Selecciona una paleta colombiana representativa o define tu color institucional.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {PALETAS_MARCA_PREDEFINIDAS.map((paleta) => {
                const esSeleccionada =
                  marca.colorAcento.toUpperCase() === paleta.colorHex.toUpperCase();
                return (
                  <button
                    key={paleta.id}
                    type="button"
                    onClick={() => handleSeleccionarColor(paleta.colorHex)}
                    className={`flex min-h-[44px] items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                      esSeleccionada
                        ? 'border-neutral-900 bg-neutral-50 ring-2 ring-neutral-900 dark:border-white dark:bg-neutral-800 dark:ring-white'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800/60'
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full shadow-xs"
                      style={{ backgroundColor: paleta.colorHex }}
                    >
                      {esSeleccionada && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      {paleta.nombre}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Color personalizado:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={marca.colorAcento}
                  onChange={(e) => setMarca({ ...marca, colorAcento: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700"
                />
                <input
                  type="text"
                  value={marca.colorAcento}
                  onChange={(e) => setMarca({ ...marca, colorAcento: e.target.value })}
                  placeholder="#C9A24B"
                  className="min-h-[44px] w-28 rounded-xl border border-neutral-300 px-3 py-2 font-mono text-xs text-neutral-900 uppercase focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Vista Previa en Vivo (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="sticky top-4 rounded-2xl border border-neutral-200 bg-neutral-50/50 p-5 backdrop-blur-xs dark:border-neutral-800 dark:bg-neutral-900/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
                Vista Previa en Vivo
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <Sparkles className="h-3 w-3" />
                Cotización de Viajero
              </span>
            </div>

            {/* Tarjeta de Cotización con Estilo de Marca */}
            <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md dark:border-neutral-800 dark:bg-neutral-900">
              {/* Cabecera de la Agencia */}
              <div
                className="p-4 text-white transition-colors"
                style={{ backgroundColor: marca.colorAcento }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 font-bold backdrop-blur-xs">
                      {marca.nombreComercial
                        ? marca.nombreComercial.slice(0, 2).toUpperCase()
                        : 'VP'}
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold tracking-tight">
                        {marca.nombreComercial || 'Nombre de la Agencia'}
                      </h4>
                      <p className="text-[11px] opacity-90">{marca.ciudadBase || 'Colombia'}</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold">
                    OFICIAL
                  </span>
                </div>
              </div>

              {/* Cuerpo de la Cotización */}
              <div className="space-y-3 p-4">
                <div className="border-b border-neutral-100 pb-2 dark:border-neutral-800">
                  <p className="text-[11px] font-medium text-neutral-400">
                    Propuesta preparada para:
                  </p>
                  <p className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    Camila Restrepo (2 adultos)
                  </p>
                </div>

                <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
                  <span className="text-[10px] font-bold text-amber-700 uppercase dark:text-amber-400">
                    Pasadía Recomendado
                  </span>
                  <p className="text-xs font-bold text-neutral-900 dark:text-white">
                    Pasadía Islas del Rosario & Acuario
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[11px] text-neutral-500">Total inversión:</span>
                    <span className="cifra text-sm font-black" style={{ color: marca.colorAcento }}>
                      $ 480.000 COP
                    </span>
                  </div>
                </div>

                <p className="text-center text-[10px] text-neutral-400 italic">
                  «{marca.lema || 'Experiencias únicas para viajeros memorables'}»
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Acciones del Paso */}
      <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-neutral-200 pt-5 sm:flex-row dark:border-neutral-800">
        <button
          type="button"
          onClick={alOmitir}
          data-testid="btn-omitir-paso-marca"
          className="min-h-[44px] w-full rounded-xl px-5 py-2.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 sm:w-auto dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          Omitir por ahora
        </button>

        <button
          type="submit"
          data-testid="btn-guardar-paso-marca"
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-neutral-800 active:scale-98 sm:w-auto dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          <span>Guardar y Continuar a Catálogo</span>
        </button>
      </div>
    </form>
  );
}
