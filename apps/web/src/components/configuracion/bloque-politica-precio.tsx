'use client';

import React, { useState } from 'react';
import { Calculator, Percent, TrendingUp, Lock, Sparkles, Users2, Check } from 'lucide-react';
import type { PoliticaDePrecio, OrigenDeLaVenta } from '@viajapro/contracts';
import { calcularEjemploVivo, formatearPesosCop } from '../../lib/politica-precio-logica';
import { DistintivoDatosDemo } from '../comun/distintivo-datos-demo';
import { usePermisos } from '../../lib/permisos';
import { MOCK_SESION_DUENO } from '../../lib/auth-api';

interface BloquePoliticaPrecioProps {
  politicaInicial?: Partial<PoliticaDePrecio>;
  puedeVerNetoYMargen?: boolean;
}

export function BloquePoliticaPrecio({
  politicaInicial,
  puedeVerNetoYMargen: puedeVerNetoProp,
}: BloquePoliticaPrecioProps) {
  const { puedeVerNetoYMargen: puedeVerNetoHook } = usePermisos(
    puedeVerNetoProp !== undefined ? (puedeVerNetoProp ? MOCK_SESION_DUENO : null) : undefined,
  );
  const tienePermiso = puedeVerNetoProp !== undefined ? puedeVerNetoProp : puedeVerNetoHook;

  const [politica, setPolitica] = useState<Omit<PoliticaDePrecio, 'actualizadaEn'>>({
    porcentaje: politicaInicial?.porcentaje ?? 20,
    base: politicaInicial?.base ?? 'SOBRE_EL_NETO',
    origenDeLaVenta: politicaInicial?.origenDeLaVenta ?? 'DERIVADA_DEL_NETO',
    redondeoVenta: politicaInicial?.redondeoVenta ?? 1000,
    admiteMargenPorTarifa: politicaInicial?.admiteMargenPorTarifa ?? true,
  });

  const [netoPrueba, setNetoPrueba] = useState<number>(1_000_000);

  // Cálculo vivo garantizado por @viajapro/domain (R3 + R8)
  const ejemplo = calcularEjemploVivo(netoPrueba, politica);
  if (!tienePermiso) {
    return (
      <div
        data-testid="bloque-politica-precio-restringido"
        className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-bold text-neutral-900 dark:text-white">
          Acceso restringido
        </h3>
        <p className="mt-1.5 max-w-md text-xs text-neutral-500 dark:text-neutral-400">
          No tienes permisos para ver o modificar la política de precios ni los márgenes comerciales
          de la agencia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Encabezado del Bloque */}
      <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <Calculator className="h-5 w-5" />
            </div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Cómo se forma el precio
            </h2>
            <DistintivoDatosDemo visible={true} />
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              ADR-0009
            </span>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs text-neutral-500 dark:text-neutral-400">
            Configura la regla comercial con la que la agencia determina los precios de venta al
            público a partir del costo neto de mayoristas y receptivos.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 sm:self-auto dark:bg-neutral-800 dark:text-neutral-300">
          <span className="font-medium">Regla del Propietario:</span>
          <span className="font-semibold text-neutral-900 dark:text-white">
            Neto + Margen comercial
          </span>
        </div>
      </div>

      {/* Grid Principal: Parámetros a la izquierda, Ejemplo Vivo a la derecha */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMNA 1: FORMULARIO DE POLÍTICA (7 Cols) */}
        <div className="space-y-5 lg:col-span-7">
          {/* Campo 1: Porcentaje de Margen */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <label
                htmlFor="input-porcentaje-margen"
                className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-white"
              >
                <Percent className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Margen Comercial General</span>
              </label>
              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-extrabold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                {politica.porcentaje} %
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Porcentaje objetivo aplicado para calcular la ganancia de la agencia.
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <input
                  id="input-porcentaje-margen"
                  type="number"
                  min={1}
                  max={90}
                  step={0.5}
                  value={politica.porcentaje}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 0 && val < 99) {
                      setPolitica({ ...politica, porcentaje: val });
                    }
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 pr-8 text-sm font-semibold text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <span className="pointer-events-none absolute top-3 right-3 text-xs font-bold text-neutral-400">
                  %
                </span>
              </div>

              {/* Botones de Acceso Rápido */}
              <div className="flex flex-wrap gap-1.5">
                {[15, 20, 25, 30].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPolitica({ ...politica, porcentaje: pct })}
                    className={`min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      politica.porcentaje === pct
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'border border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Slider interactivo */}
            <input
              type="range"
              min={1}
              max={60}
              step={0.5}
              value={politica.porcentaje}
              onChange={(e) => setPolitica({ ...politica, porcentaje: parseFloat(e.target.value) })}
              className="mt-3 h-2 w-full cursor-pointer accent-emerald-600"
              aria-label="Ajuste fino de porcentaje de margen"
            />
          </div>

          {/* Campo 2: Base del Margen (SOBRE_EL_NETO vs SOBRE_LA_VENTA) */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                  Base del Margen (Interpretación de la Agencia)
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400">ADR-0009</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Define cómo calcula la agencia su porcentaje. Dos agencias que dicen «margen del 20%»
              cobran precios distintos:
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Opción A: SOBRE_EL_NETO */}
              <button
                type="button"
                id="btn-base-sobre-el-neto"
                onClick={() => setPolitica({ ...politica, base: 'SOBRE_EL_NETO' })}
                className={`flex min-h-[56px] flex-col rounded-xl border-2 p-3.5 text-left transition-all ${
                  politica.base === 'SOBRE_EL_NETO'
                    ? 'border-blue-600 bg-blue-50/60 shadow-sm dark:border-blue-500 dark:bg-blue-950/30'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    Sobre el Costo Neto
                  </span>
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      politica.base === 'SOBRE_EL_NETO'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    {politica.base === 'SOBRE_EL_NETO' && <Check className="h-2.5 w-2.5" />}
                  </div>
                </div>
                <span className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  «Le subo el {politica.porcentaje} %»
                </span>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Se suma el porcentaje directamente al valor neto del mayorista.
                </p>
                <code className="mt-2 rounded bg-neutral-100 px-2 py-1 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  Venta = Neto + (Neto × %)
                </code>
              </button>

              {/* Opción B: SOBRE_LA_VENTA */}
              <button
                type="button"
                id="btn-base-sobre-la-venta"
                onClick={() => setPolitica({ ...politica, base: 'SOBRE_LA_VENTA' })}
                className={`flex min-h-[56px] flex-col rounded-xl border-2 p-3.5 text-left transition-all ${
                  politica.base === 'SOBRE_LA_VENTA'
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-sm dark:border-emerald-500 dark:bg-emerald-950/30'
                    : 'border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-900 dark:text-white">
                    Sobre el Precio de Venta
                  </span>
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      politica.base === 'SOBRE_LA_VENTA'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    {politica.base === 'SOBRE_LA_VENTA' && <Check className="h-2.5 w-2.5" />}
                  </div>
                </div>
                <span className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  «Me deja el {politica.porcentaje} %»
                </span>
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Margen financiero real. El porcentaje es sobre el total cobrado al cliente.
                </p>
                <code className="mt-2 rounded bg-neutral-100 px-2 py-1 text-[10px] text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  Venta = Neto / (1 − %)
                </code>
              </button>
            </div>
          </div>

          {/* Campo 3 & 4: Origen de la Venta y Redondeo */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Origen de la Venta */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <label
                htmlFor="select-origen-venta"
                className="block text-xs font-bold text-neutral-900 dark:text-white"
              >
                Origen del Precio de Venta
              </label>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                Determina si el precio se deriva del costo neto o se respeta el tarifario público.
              </p>
              <select
                id="select-origen-venta"
                value={politica.origenDeLaVenta}
                onChange={(e) =>
                  setPolitica({ ...politica, origenDeLaVenta: e.target.value as OrigenDeLaVenta })
                }
                className="mt-3 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value="DERIVADA_DEL_NETO">DERIVADA_DEL_NETO (Cálculo automático)</option>
                <option value="FIJADA_EN_EL_TARIFARIO">
                  FIJADA_EN_EL_TARIFARIO (Manual según tarifario)
                </option>
              </select>
            </div>

            {/* Redondeo de Venta */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <label
                htmlFor="select-redondeo-venta"
                className="block text-xs font-bold text-neutral-900 dark:text-white"
              >
                Regla de Redondeo
              </label>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                Redondea el precio final a números limpios para la cotización del cliente.
              </p>
              <select
                id="select-redondeo-venta"
                value={politica.redondeoVenta}
                onChange={(e) =>
                  setPolitica({ ...politica, redondeoVenta: parseInt(e.target.value, 10) })
                }
                className="mt-3 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-900 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value={0}>Sin redondeo (exacto al centavo)</option>
                <option value={1000}>Múltiplo de $1.000 COP (Recomendado)</option>
                <option value={5000}>Múltiplo de $5.000 COP</option>
                <option value={10000}>Múltiplo de $10.000 COP</option>
              </select>
            </div>
          </div>

          {/* Campo 5: Admite Margen Por Tarifa */}
          <div className="flex min-h-[48px] items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <span className="text-xs font-bold text-neutral-900 dark:text-white">
                Admite Margen Personalizado por Tarifa
              </span>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                Permite a los asesores o administradores sobreescribir el porcentaje en tarifas
                puntuales (ej. bloqueos de temporada alta).
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={politica.admiteMargenPorTarifa}
              onClick={() =>
                setPolitica({ ...politica, admiteMargenPorTarifa: !politica.admiteMargenPorTarifa })
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                politica.admiteMargenPorTarifa
                  ? 'bg-emerald-600'
                  : 'bg-neutral-300 dark:bg-neutral-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  politica.admiteMargenPorTarifa ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 0c.15.4: Botón Guardar Deshabilitado con honestidad */}
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Guardado en Base de Datos No Expuesto Aún
                  </span>
                  <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
                    La API aún no expone la ruta de persistencia según ADR-0009. Los cambios aplican
                    de inmediato en este simulador y cotizador local.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={true}
                className="flex min-h-[44px] cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-500 opacity-80 dark:bg-neutral-800 dark:text-neutral-500"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Guardar Política</span>
              </button>
            </div>
          </div>
        </div>

        {/* COLUMNA 2: EJEMPLO VIVO INTERACTIVO (5 Cols) */}
        <div className="space-y-4 lg:col-span-5">
          <div className="sticky top-6 rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50/30 via-white to-blue-50/20 p-5 shadow-md dark:border-emerald-600/30 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950">
            {/* Cabecera del Ejemplo */}
            <div className="flex items-center justify-between border-b border-neutral-200/80 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Ejemplo Vivo — Impacto en Negocio
                </h3>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                En Tiempo Real
              </span>
            </div>

            {/* Selector de Neto de Prueba */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="input-neto-prueba"
                  className="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                >
                  Costo Neto de Prueba (Tarifa Mayorista):
                </label>
                <span className="text-xs font-bold text-neutral-900 dark:text-white">
                  {formatearPesosCop(netoPrueba)}
                </span>
              </div>

              <div className="mt-2 flex gap-1.5">
                {[500_000, 1_000_000, 2_500_000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setNetoPrueba(val)}
                    className={`min-h-[44px] flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      netoPrueba === val
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                    }`}
                  >
                    {formatearPesosCop(val)}
                  </button>
                ))}
              </div>

              <input
                id="input-neto-prueba"
                type="range"
                min={200_000}
                max={5_000_000}
                step={50_000}
                value={netoPrueba}
                onChange={(e) => setNetoPrueba(parseInt(e.target.value, 10))}
                className="mt-2.5 h-1.5 w-full cursor-pointer accent-emerald-600"
                aria-label="Ajustar costo neto de prueba"
              />
            </div>

            {/* Resultado Principal: Precio de Venta Calculado */}
            <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-inner dark:border-neutral-800 dark:bg-neutral-950">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Precio de Venta al Viajero:
              </span>
              <div
                id="resultado-precio-venta"
                className="mt-1 text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-white"
              >
                {ejemplo.ventaFormateada}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                  Margen: +{ejemplo.margenImporteFormateado} ({ejemplo.margenPorcentajeTexto})
                </span>
              </div>
            </div>

            {/* Desglose Matemático */}
            <div className="mt-4 rounded-lg bg-neutral-100/90 p-3 text-xs dark:bg-neutral-800/80">
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                Fórmula aplicada:
              </span>
              <p className="mt-1 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                {ejemplo.explicacionFormula}
              </p>
            </div>

            {/* Comparación Impacto en Sillas / Bus de 40 */}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-blue-300">
                <Users2 className="h-4 w-4 shrink-0" />
                <span>¿Por qué importa la base ({politica.base})?</span>
              </div>

              <div className="mt-3 space-y-2 text-xs text-blue-800 dark:text-blue-200">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-1.5 dark:border-blue-900/60">
                  <span>Diferencia por cada pasajero (silla):</span>
                  <span
                    id="diferencia-por-silla"
                    className="font-bold text-blue-950 dark:text-blue-100"
                  >
                    {ejemplo.diferenciaSillaFormateada}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="font-semibold">
                    En una salida de 40 pasajeros (bus completo):
                  </span>
                  <span
                    id="diferencia-bus-40"
                    className="font-extrabold text-blue-950 dark:text-white"
                  >
                    {ejemplo.diferenciaBus40Formateada}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-blue-700 dark:text-blue-300">
                Cambiar de <strong>Sobre el Costo Neto</strong> a <strong>Sobre la Venta</strong>{' '}
                representa <strong>{ejemplo.diferenciaBus40Formateada}</strong> adicionales de
                utilidad bruta para la agencia en un solo bus de 40 cupos sobre tarifas netas de{' '}
                {formatearPesosCop(netoPrueba)}.
              </p>
            </div>

            {/* Garantía de Dominio */}
            <div className="mt-4 flex items-center gap-2 text-[10px] text-neutral-400 dark:text-neutral-500">
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Cálculo certificado por @viajapro/domain (precio-de-venta.ts)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
