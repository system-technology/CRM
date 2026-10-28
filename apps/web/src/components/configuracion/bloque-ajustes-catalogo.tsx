'use client';

import React, { useState, useEffect } from 'react';
import {
  Tag,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Save,
  MapPin,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { PromoVencida } from '@viajapro/contracts';
import {
  obtenerAjustesCatalogoApi,
  actualizarAjustesCatalogoApi,
} from '../../lib/catalogo-ajustes-api';
import { formatearDinero } from '../../lib/api';

interface BloqueAjustesCatalogoProps {
  valorInicial?: PromoVencida;
}

export function BloqueAjustesCatalogo({ valorInicial }: BloqueAjustesCatalogoProps) {
  const [promoVencida, setPromoVencida] = useState<PromoVencida>(valorInicial ?? 'OCULTAR');
  const [cargando, setCargando] = useState(!valorInicial);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);
  const [errorApi, setErrorApi] = useState<string | null>(null);

  useEffect(() => {
    if (valorInicial) return;
    let activo = true;

    async function cargar() {
      try {
        const ajustes = await obtenerAjustesCatalogoApi();
        if (activo) {
          setPromoVencida(ajustes.promoVencida);
        }
      } catch (err) {
        if (activo) {
          setErrorApi((err as Error).message || 'Error consultando ajustes de catálogo');
        }
      } finally {
        if (activo) setCargando(false);
      }
    }

    void cargar();
    return () => {
      activo = false;
    };
  }, [valorInicial]);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorApi(null);
    setMensajeExito(false);

    try {
      const actualizados = await actualizarAjustesCatalogoApi({ promoVencida });
      setPromoVencida(actualizados.promoVencida);
      setMensajeExito(true);
      setTimeout(() => setMensajeExito(false), 3500);
    } catch (err) {
      setErrorApi((err as Error).message || 'No fue posible guardar el ajuste');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div
        data-testid="cargando-ajustes-catalogo"
        className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 dark:text-teal-400" />
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Cargando configuración del catálogo...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="seccion-ajustes-catalogo">
      {/* Cabecera Técnica del Bloque */}
      <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              <Tag className="h-5 w-5" />
            </span>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Visualización de Promoción Vencida (
              <code className="font-mono text-xs">promo_vencida</code>)
            </h2>
            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              PATCH /api/v1/catalogo/ajustes
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">
            Define el comportamiento visual en la tarjeta del catálogo y en el cotizador cuando la
            fecha de vigencia de una promoción (<code className="font-mono">promo_hasta</code>) ha
            expirado.
          </p>
        </div>
      </div>

      {/* Grid de 2 Columnas: Panel de Selección y Vista Previa en Vivo */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna Izquierda: Formulario de Selección */}
        <form
          onSubmit={(e) => {
            void handleGuardar(e);
          }}
          className="space-y-4 lg:col-span-7"
        >
          {errorApi && (
            <div
              role="alert"
              data-testid="error-ajustes-catalogo"
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{errorApi}</span>
            </div>
          )}

          {mensajeExito && (
            <div
              role="status"
              data-testid="mensaje-guardado-exitoso"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Ajuste guardado exitosamente para la agencia.</span>
            </div>
          )}

          <div className="space-y-3">
            {/* Opción 1: OCULTAR */}
            <label
              htmlFor="radio-ocultar"
              className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4.5 transition-all ${
                promoVencida === 'OCULTAR'
                  ? 'border-teal-500 bg-teal-50/40 shadow-xs ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-950/20'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
              }`}
            >
              <input
                id="radio-ocultar"
                type="radio"
                name="promoVencida"
                value="OCULTAR"
                checked={promoVencida === 'OCULTAR'}
                onChange={() => setPromoVencida('OCULTAR')}
                data-testid="radio-promo-ocultar"
                className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white">
                    <EyeOff className="h-4 w-4 text-neutral-500" />
                    Ocultar precio de lista anterior (Valor por defecto)
                  </span>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                    Recomendado para cotizaciones limpias
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Al vencer la promoción, se oculta el precio tachado. La tarjeta y el cotizador
                  enseñan únicamente el precio de venta vigente, eliminando cualquier referencia
                  visual al descuento expirado.
                </p>
              </div>
            </label>

            {/* Opción 2: TACHAR */}
            <label
              htmlFor="radio-tachar"
              className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4.5 transition-all ${
                promoVencida === 'TACHAR'
                  ? 'border-teal-500 bg-teal-50/40 shadow-xs ring-1 ring-teal-500 dark:border-teal-400 dark:bg-teal-950/20'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
              }`}
            >
              <input
                id="radio-tachar"
                type="radio"
                name="promoVencida"
                value="TACHAR"
                checked={promoVencida === 'TACHAR'}
                onChange={() => setPromoVencida('TACHAR')}
                data-testid="radio-promo-tachar"
                className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white">
                    <Tag className="h-4 w-4 text-amber-500" />
                    Tachar con aviso de vencimiento
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    Anclaje de precio y urgencia
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  Mantiene visible el precio de lista anterior con línea tachada e incorpora la
                  insignia ámbar{' '}
                  <strong className="font-semibold text-amber-700 dark:text-amber-400">
                    «Promoción vencida»
                  </strong>
                  .
                </p>
              </div>
            </label>
          </div>

          {/* Cuadro de Advertencia Comercial */}
          <div
            role="note"
            className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <strong className="font-semibold">
                Invariante de dominio (ADR-0017 §9 / Regla R12):
              </strong>
              <p className="mt-0.5 leading-relaxed">
                El precio de venta cobrado al cliente es exactamente el mismo en ambos modos. Este
                ajuste solo gobierna la presentación visual (si se muestra o no el precio de lista
                tachado de referencia).
              </p>
            </div>
          </div>

          {/* Botón de Guardar */}
          <button
            type="submit"
            disabled={guardando}
            data-testid="boton-guardar-ajustes-catalogo"
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-teal-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-teal-700 disabled:opacity-50"
          >
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Guardar ajuste de catálogo</span>
              </>
            )}
          </button>
        </form>

        {/* Columna Derecha: Previsualización en Vivo de la Tarjeta */}
        <div className="space-y-2 lg:col-span-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500 uppercase">
              Vista previa en vivo (Catálogo y Cotizador)
            </span>
            <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Modo: {promoVencida}
            </span>
          </div>

          <div
            data-testid="tarjeta-previsualizacion-catalogo"
            className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="border-b border-neutral-100 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                  <Calendar className="h-3 w-3" />
                  Sáb, 14 nov 2026
                </span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  Pasadía / 1D
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-neutral-900 dark:text-white">
                Pasadía Islas del Rosario & Bora Bora
              </h3>
              <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                <MapPin className="h-3 w-3 text-neutral-400" />
                <span>Cartagena de Indias</span>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-baseline justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <span className="text-xs text-neutral-500">Tarifa desde:</span>
                <div className="text-right">
                  {promoVencida === 'TACHAR' && (
                    <span
                      data-testid="precio-tachado-previsualizacion"
                      className="block font-mono text-xs text-neutral-400 line-through"
                    >
                      {formatearDinero({ unidades: '520000', moneda: 'COP' })}
                    </span>
                  )}
                  <span className="cifra text-lg font-black text-neutral-900 dark:text-white">
                    {formatearDinero({ unidades: '450000', moneda: 'COP' })}
                  </span>
                  {promoVencida === 'TACHAR' ? (
                    <span
                      data-testid="badge-promo-vencida-previsualizacion"
                      className="mt-0.5 block rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    >
                      Promoción vencida
                    </span>
                  ) : (
                    <span className="block text-[10px] text-neutral-400">por persona</span>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-neutral-50 p-2 text-[11px] text-neutral-500 dark:bg-neutral-800/40 dark:text-neutral-400">
                <Sparkles className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                <span>
                  {promoVencida === 'OCULTAR'
                    ? 'La tarifa se presenta limpia y sin tachón en cotizaciones y WhatsApp.'
                    : 'La tarifa muestra el anclaje del precio de lista con la etiqueta de advertencia.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
