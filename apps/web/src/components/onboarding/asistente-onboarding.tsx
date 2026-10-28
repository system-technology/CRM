'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Compass,
  Users,
  MessageSquare,
  CheckCircle2,
  Clock,
  RotateCcw,
} from 'lucide-react';
import {
  type PasoOnboardingId,
  type ProgresoOnboarding,
  type DatosMarcaOnboarding,
  type DatosCatalogoOnboarding,
  type DatosEquipoOnboarding,
  type DatosWhatsAppOnboarding,
  ORDEN_PASOS_ONBOARDING,
  TITULOS_PASOS_ONBOARDING,
  cargarProgresoOnboarding,
  avanzarPasoOnboarding,
  omitirPasoOnboarding,
  calcularPorcentajeProgreso,
  restablecerOnboarding,
} from '../../lib/onboarding-logica';
import { PasoMarca } from './paso-marca';
import { PasoCatalogo } from './paso-catalogo';
import { PasoEquipo } from './paso-equipo';
import { PasoWhatsApp } from './paso-whatsapp';
import { ResumenOnboardingCompletado } from './resumen-onboarding-completado';

export interface AsistenteOnboardingProps {
  tenantId?: string | null | undefined;
  nombreAgencia?: string | null | undefined;
  alFinalizar?: () => void;
}

export function AsistenteOnboarding({
  tenantId,
  nombreAgencia,
  alFinalizar,
}: AsistenteOnboardingProps) {
  const [progreso, setProgreso] = useState<ProgresoOnboarding>(() =>
    cargarProgresoOnboarding(tenantId, nombreAgencia),
  );
  const [pasoVisual, setPasoVisual] = useState<PasoOnboardingId | 'resumen'>(() => {
    const cargado = cargarProgresoOnboarding(tenantId, nombreAgencia);
    return cargado.completado ? 'resumen' : cargado.pasoActual;
  });

  useEffect(() => {
    const cargado = cargarProgresoOnboarding(tenantId, nombreAgencia);
    setProgreso(cargado);
    if (cargado.completado) {
      setPasoVisual('resumen');
    } else {
      setPasoVisual(cargado.pasoActual);
    }
  }, [tenantId, nombreAgencia]);

  const porcentaje = calcularPorcentajeProgreso(progreso.pasos);

  // Guardar Marca (Paso 1)
  const handleGuardarMarca = (datos: DatosMarcaOnboarding) => {
    const actualizado = avanzarPasoOnboarding(progreso, 'marca', { marca: datos });
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  const handleOmitirMarca = () => {
    const actualizado = omitirPasoOnboarding(progreso, 'marca');
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  // Guardar Catálogo (Paso 2)
  const handleGuardarCatalogo = (datos: DatosCatalogoOnboarding) => {
    const actualizado = avanzarPasoOnboarding(progreso, 'catalogo', { catalogo: datos });
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  const handleOmitirCatalogo = () => {
    const actualizado = omitirPasoOnboarding(progreso, 'catalogo');
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  // Guardar Equipo (Paso 3)
  const handleGuardarEquipo = (datos: DatosEquipoOnboarding) => {
    const actualizado = avanzarPasoOnboarding(progreso, 'equipo', { equipo: datos });
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  const handleOmitirEquipo = () => {
    const actualizado = omitirPasoOnboarding(progreso, 'equipo');
    setProgreso(actualizado);
    setPasoVisual(actualizado.pasoActual);
  };

  // Guardar WhatsApp (Paso 4)
  const handleGuardarWhatsApp = (datos: DatosWhatsAppOnboarding) => {
    const actualizado = avanzarPasoOnboarding(progreso, 'whatsapp', { whatsapp: datos });
    setProgreso(actualizado);
    setPasoVisual('resumen');
    alFinalizar?.();
  };

  const handleOmitirWhatsApp = () => {
    const actualizado = omitirPasoOnboarding(progreso, 'whatsapp');
    setProgreso(actualizado);
    setPasoVisual('resumen');
    alFinalizar?.();
  };

  // Reiniciar Onboarding
  const handleReiniciar = () => {
    const reiniciado = restablecerOnboarding(progreso.tenantId, nombreAgencia);
    setProgreso(reiniciado);
    setPasoVisual('marca');
  };

  const renderIconoPaso = (paso: PasoOnboardingId) => {
    switch (paso) {
      case 'marca':
        return <Sparkles className="h-4 w-4" />;
      case 'catalogo':
        return <Compass className="h-4 w-4" />;
      case 'equipo':
        return <Users className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  return (
    <div data-testid="asistente-onboarding" className="mx-auto max-w-5xl space-y-8">
      {/* Encabezado del Asistente */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              Paso a Paso
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              T-105
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
            Bienvenido a ViajaPro: Configura tu Agencia
          </h1>
          <p className="mt-1 text-xs text-neutral-600 sm:text-sm dark:text-neutral-400">
            Completa estos 4 pasos esenciales para pasar de una cuenta nueva a tu primera cotización
            turística enviada por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase dark:text-neutral-400">
              Progreso General
            </span>
            <p className="cifra text-xl font-black text-neutral-900 dark:text-white">
              {porcentaje}%
            </p>
          </div>
          <button
            type="button"
            onClick={handleReiniciar}
            title="Restablecer asistente"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Barra de Progreso */}
      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      {/* Navegador de Pasos (Stepper) */}
      <nav aria-label="Pasos de onboarding" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ORDEN_PASOS_ONBOARDING.map((paso, index) => {
          const config = TITULOS_PASOS_ONBOARDING[paso];
          const estado = progreso.pasos[paso];
          const esActivo = pasoVisual === paso;
          const esCompletado = estado === 'completado';
          const esOmitido = estado === 'omitido';

          return (
            <button
              key={paso}
              type="button"
              onClick={() => setPasoVisual(paso)}
              data-testid={`btn-paso-${paso}`}
              className={`flex min-h-[44px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                esActivo
                  ? 'border-neutral-900 bg-white shadow-md ring-2 ring-neutral-900 dark:border-white dark:bg-neutral-900 dark:ring-white'
                  : esCompletado
                    ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                    : esOmitido
                      ? 'border-neutral-200 bg-neutral-50 opacity-80 hover:opacity-100 dark:border-neutral-800 dark:bg-neutral-900/50'
                      : 'border-neutral-200 bg-white opacity-75 hover:opacity-100 dark:border-neutral-800 dark:bg-neutral-900'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                    esCompletado
                      ? 'bg-emerald-600 text-white'
                      : esActivo
                        ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  {esCompletado ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </span>

                <span className="flex items-center gap-1 text-[10px] text-neutral-400">
                  <Clock className="h-3 w-3" />
                  {config.tiempoEstimado}
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-900 dark:text-white">
                  {renderIconoPaso(paso)}
                  <span className="truncate">{config.titulo}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-neutral-500 capitalize dark:text-neutral-400">
                    {esCompletado
                      ? 'Completado'
                      : esOmitido
                        ? 'Omitido'
                        : esActivo
                          ? 'En curso'
                          : 'Pendiente'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Contenido del Paso Activo */}
      <div className="transition-all">
        {pasoVisual === 'marca' && (
          <PasoMarca
            datos={progreso.marca}
            alGuardar={handleGuardarMarca}
            alOmitir={handleOmitirMarca}
          />
        )}

        {pasoVisual === 'catalogo' && (
          <PasoCatalogo
            datos={progreso.catalogo}
            alGuardar={handleGuardarCatalogo}
            alOmitir={handleOmitirCatalogo}
          />
        )}

        {pasoVisual === 'equipo' && (
          <PasoEquipo
            datos={progreso.equipo}
            alGuardar={handleGuardarEquipo}
            alOmitir={handleOmitirEquipo}
          />
        )}

        {pasoVisual === 'whatsapp' && (
          <PasoWhatsApp
            datos={progreso.whatsapp}
            alGuardar={handleGuardarWhatsApp}
            alOmitir={handleOmitirWhatsApp}
          />
        )}

        {pasoVisual === 'resumen' && (
          <ResumenOnboardingCompletado progreso={progreso} alReiniciar={handleReiniciar} />
        )}
      </div>
    </div>
  );
}
