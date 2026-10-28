'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  type FichaDeContacto,
  type Seguimiento,
  type EditarContacto,
  type CrearOportunidad,
  type CrearSeguimiento,
} from '@viajapro/contracts';
import { BarraModulos } from '../../../components/bandeja/barra-modulos';
import { LineaTiempo360 } from '../../../components/contactos/linea-tiempo-360';
import { ModalEditarContacto } from '../../../components/contactos/modal-editar-contacto';
import { ModalCrearOportunidad } from '../../../components/contactos/modal-crear-oportunidad';
import { ModalCrearSeguimiento } from '../../../components/contactos/modal-crear-seguimiento';
import { SeccionCamposPersonalizados } from '../../../components/contactos/seccion-campos-personalizados';
import {
  AvisoErrorAccionable,
  AvisoVacio,
  EsqueletoTabla,
} from '../../../components/comun/esqueletos';
import {
  obtenerFichaDeContacto,
  editarContactoApi,
  crearOportunidadApi,
  crearSeguimientoApi,
  completarSeguimientoApi,
  listarSeguimientosApi,
} from '../../../lib/crm-api';
import {
  construirLineaTiempo360,
  calcularMetricasContacto360,
} from '../../../lib/contacto-360-logica';
import { formatearTelefonoVisual } from '../../../lib/contactos-logica';
import { formatearDinero, formatearFecha } from '../../../lib/formato';
import { generarColorAvatar, obtenerIniciales } from '../../../lib/bandeja-logica';
import {
  formatearErrorAmigable,
  construirMensajeErrorAccionable,
} from '../../../lib/estados-ui-logica';
import {
  ArrowLeft,
  MessageSquare,
  Edit3,
  Kanban,
  CheckCircle2,
  ShieldCheck,
  Tag,
  Clock,
  ExternalLink,
  Plus,
} from 'lucide-react';

interface Contacto360PageProps {
  params?: Promise<{ id: string }>;
}

export default function Contacto360Page({ params: paramsPromise }: Contacto360PageProps) {
  const routerParams = useParams();
  const idFromParams = routerParams?.['id'] as string | undefined;

  let idFromProps: string | undefined;
  if (paramsPromise) {
    try {
      const unwrapped = use(paramsPromise);
      idFromProps = unwrapped.id;
    } catch {
      // Si no es un Promise unwrappable
    }
  }

  const contactoId = idFromProps ?? idFromParams ?? '00000000-0002-4000-8000-000000000001';

  const [ficha, setFicha] = useState<FichaDeContacto | null>(null);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pestaña activa
  const [pestanaActiva, setPestanaActiva] = useState<
    'cronologia' | 'oportunidades' | 'seguimientos' | 'campos'
  >('cronologia');

  // Modales
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
  const [modalOportunidadAbierto, setModalOportunidadAbierto] = useState(false);
  const [modalSeguimientoAbierto, setModalSeguimientoAbierto] = useState(false);

  const cargarDatos = async () => {
    setCargando(true);
    setError(null);
    try {
      const [fichaRes, segsRes] = await Promise.all([
        obtenerFichaDeContacto(contactoId),
        listarSeguimientosApi({ estado: 'TODOS' }).catch(() => ({
          datos: [],
          pageInfo: { nextCursor: null, hasMore: false },
        })),
      ]);

      setFicha(fichaRes);
      // Filtrar seguimientos de este contacto o de su oportunidad activa
      const segsFiltrados = segsRes.datos.filter(
        (s) =>
          s.contactoId === contactoId ||
          (fichaRes.oportunidadActual && s.oportunidadId === fichaRes.oportunidadActual.id),
      );
      setSeguimientos(segsFiltrados);
    } catch (err) {
      setError(
        formatearErrorAmigable(
          err,
          'No fue posible cargar la ficha 360 del contacto. Verifica la conexión o el identificador.',
        ),
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarDatos();
  }, [contactoId]);

  // Guardar edición de contacto
  const handleGuardarContacto = async (cambios: EditarContacto) => {
    const contactoActualizado = await editarContactoApi(contactoId, cambios);
    if (ficha) {
      setFicha({
        ...ficha,
        contacto: contactoActualizado,
      });
    }
  };

  // Crear oportunidad
  const handleCrearOportunidad = async (cuerpo: CrearOportunidad) => {
    const nuevaOp = await crearOportunidadApi(cuerpo);
    if (ficha) {
      setFicha({
        ...ficha,
        oportunidadActual: nuevaOp,
      });
    }
    return nuevaOp;
  };

  // Crear seguimiento
  const handleCrearSeguimiento = async (cuerpo: CrearSeguimiento) => {
    const nuevoSeg = await crearSeguimientoApi(cuerpo);
    setSeguimientos((prev) => [nuevoSeg, ...prev]);
    return nuevoSeg;
  };

  // Completar seguimiento
  const handleCompletarSeguimiento = async (id: string) => {
    const actualizado = await completarSeguimientoApi(id);
    setSeguimientos((prev) => prev.map((s) => (s.id === id ? actualizado : s)));
  };

  // Métricas y línea de tiempo
  const metricas = useMemo(() => {
    if (!ficha) return null;
    return calcularMetricasContacto360(ficha, seguimientos);
  }, [ficha, seguimientos]);

  const eventosLineaTiempo = useMemo(() => {
    if (!ficha) return [];
    return construirLineaTiempo360(ficha, seguimientos);
  }, [ficha, seguimientos]);

  const errorAccionable = useMemo(() => {
    if (!error && ficha) return null;
    return construirMensajeErrorAccionable(
      error ?? new Error('No existe o no fue posible cargar el contacto solicitado.'),
      'CONTACTOS_LISTA',
    );
  }, [error, ficha]);

  if (cargando) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
        <BarraModulos />
        <main className="flex flex-1 flex-col space-y-6 overflow-y-auto p-6">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          <EsqueletoTabla filas={6} />
        </main>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
        <BarraModulos />
        <main className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="w-full max-w-lg">
            {errorAccionable && (
              <AvisoErrorAccionable
                error={errorAccionable}
                onReintentar={() => {
                  void cargarDatos();
                }}
              />
            )}
            <div className="mt-4 text-center">
              <Link
                href="/contactos"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-neutral-200 px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Volver al Directorio de Contactos</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { contacto, oportunidadActual, cotizaciones, archivosDeViajeIds } = ficha;
  const avatarColores = generarColorAvatar(contacto.id);
  const iniciales = obtenerIniciales(contacto.nombre, contacto.telefono);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de Módulos (56px) */}
      <BarraModulos />

      {/* Contenido Principal con Scroll */}
      <main className="flex flex-1 flex-col overflow-y-auto pb-16 md:pb-6">
        {/* Barra superior de navegación */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-white/95 px-6 py-3.5 backdrop-blur-xs dark:border-neutral-800 dark:bg-neutral-900/95">
          <Link
            href="/contactos"
            className="flex min-h-[44px] items-center gap-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Directorio de Contactos</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/bandeja"
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/50"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Abrir WhatsApp</span>
            </Link>
            <button
              type="button"
              onClick={() => setModalEditarAbierto(true)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <Edit3 className="h-4 w-4" />
              <span>Editar Datos</span>
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
          {/* Tarjeta de Identidad 360 */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              {/* Información Personal */}
              <div className="flex items-start gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold shadow-xs select-none"
                  style={{ backgroundColor: avatarColores.bg, color: avatarColores.text }}
                >
                  {iniciales}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-extrabold text-neutral-900 dark:text-white">
                      {contacto.nombre || 'Viajero sin nombre registrado'}
                    </h1>
                    {contacto.consentimientos.includes('PROMOCIONAL') && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <ShieldCheck className="h-3 w-3" />
                        Consentimiento Ley 1581
                      </span>
                    )}
                  </div>
                  <p className="cifra text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                    {formatearTelefonoVisual(contacto.telefono)}
                  </p>
                  {contacto.correo && (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {contacto.correo}
                    </p>
                  )}

                  {/* Etiquetas */}
                  {contacto.etiquetas.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2">
                      {contacto.etiquetas.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        >
                          <Tag className="h-3 w-3 text-neutral-400" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {contacto.preferencias && (
                    <p className="pt-2 text-xs text-neutral-600 italic dark:text-neutral-400">
                      «{contacto.preferencias}»
                    </p>
                  )}
                </div>
              </div>

              {/* Botones de Acción Comercial Rápida */}
              <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0">
                <button
                  type="button"
                  onClick={() => setModalOportunidadAbierto(true)}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600"
                >
                  <Kanban className="h-4 w-4" />
                  <span>Nueva Oportunidad</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalSeguimientoAbierto(true)}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Clock className="h-4 w-4" />
                  <span>Agendar Seguimiento</span>
                </button>
              </div>
            </div>
          </div>

          {/* Grilla de Métricas 360 */}
          {metricas && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                  Oportunidad Activa
                </p>
                <p className="cifra mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {metricas.tieneOportunidadActiva
                    ? formatearDinero({
                        unidades: String(metricas.valorOportunidadEstimadoCop),
                        moneda: 'COP',
                      })
                    : 'Sin oportunidad'}
                </p>
                <p className="mt-0.5 text-[11px] text-teal-600 dark:text-teal-400">
                  {metricas.etapaOportunidad ?? 'Lead en exploración'}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                  Cotizaciones Emitidas
                </p>
                <p className="cifra mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {metricas.totalCotizaciones}
                </p>
                <p className="cifra mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Total{' '}
                  {formatearDinero({
                    unidades: String(metricas.cotizacionesMontoTotalCop),
                    moneda: 'COP',
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                  Seguimientos Pendientes
                </p>
                <p className="cifra mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {metricas.seguimientosPendientes}
                </p>
                <p className="mt-0.5 text-[11px] text-purple-600 dark:text-purple-400">
                  {metricas.seguimientosPendientes > 0 ? 'Compromisos activos' : 'Al día'}
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <p className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase">
                  Archivos de Viaje
                </p>
                <p className="cifra mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {archivosDeViajeIds.length}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                  {archivosDeViajeIds.length > 0 ? 'Confirmados' : 'Sin reservas'}
                </p>
              </div>
            </div>
          )}

          {/* Navegación por Pestañas */}
          <div className="flex border-b border-neutral-200 text-xs font-bold dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setPestanaActiva('cronologia')}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 transition-colors ${
                pestanaActiva === 'cronologia'
                  ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span>Línea de Tiempo 360</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
                {eventosLineaTiempo.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPestanaActiva('oportunidades')}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 transition-colors ${
                pestanaActiva === 'oportunidades'
                  ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span>Oportunidad & Cotizaciones</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
                {cotizaciones.length + (oportunidadActual ? 1 : 0)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPestanaActiva('seguimientos')}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 transition-colors ${
                pestanaActiva === 'seguimientos'
                  ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span>Seguimientos</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] dark:bg-neutral-800">
                {seguimientos.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPestanaActiva('campos')}
              className={`flex min-h-[44px] items-center gap-2 border-b-2 px-4 py-2 transition-colors ${
                pestanaActiva === 'campos'
                  ? 'border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <span>Campos Personalizados</span>
            </button>
          </div>

          {/* Contenido de la Pestaña Activa */}
          {pestanaActiva === 'cronologia' && (
            <section aria-label="Historial cronológico 360" className="pt-2">
              <LineaTiempo360 eventos={eventosLineaTiempo} />
            </section>
          )}

          {pestanaActiva === 'oportunidades' && (
            <div className="space-y-6 pt-2">
              {/* Oportunidad Comercial */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Oportunidad en Pipeline
                  </h2>
                  {!oportunidadActual && (
                    <button
                      type="button"
                      onClick={() => setModalOportunidadAbierto(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Crear Oportunidad</span>
                    </button>
                  )}
                </div>

                {oportunidadActual ? (
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="inline-flex items-center rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                          {oportunidadActual.etapa.nombre} ({oportunidadActual.etapa.probabilidad}%)
                        </span>
                        <h3 className="mt-1.5 text-base font-bold text-neutral-900 dark:text-neutral-100">
                          {oportunidadActual.titulo}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="cifra text-lg font-extrabold text-neutral-900 dark:text-white">
                          {oportunidadActual.valorEstimado
                            ? formatearDinero(oportunidadActual.valorEstimado)
                            : 'Sin estimar'}
                        </p>
                        <p className="text-[11px] text-neutral-400">Valor estimado</p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 border-t border-neutral-100 pt-3 text-xs sm:grid-cols-3 dark:border-neutral-800">
                      <div>
                        <span className="text-neutral-400">Destino:</span>{' '}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {oportunidadActual.destino ?? 'No especificado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Fecha de salida:</span>{' '}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {oportunidadActual.fechaSalida
                            ? formatearFecha(oportunidadActual.fechaSalida)
                            : 'Flexible'}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400">Asesor:</span>{' '}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                          {oportunidadActual.asesorNombre ?? 'Por asignar'}
                        </span>
                      </div>
                    </div>

                    {oportunidadActual.proximaTarea && (
                      <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-300">
                        <p className="flex items-center gap-1.5 font-bold">
                          <Clock className="h-3.5 w-3.5" />
                          Próxima Tarea: {oportunidadActual.proximaTarea.descripcion}
                        </p>
                        <p className="mt-0.5 text-[11px] opacity-80">
                          Vence:{' '}
                          {formatearFecha(oportunidadActual.proximaTarea.venceEn, {
                            conHora: true,
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <AvisoVacio
                    titulo="Sin oportunidad activa"
                    descripcion="Este contacto aún no tiene una negociación abierta en el embudo comercial."
                  />
                )}
              </section>

              {/* Cotizaciones */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                    Cotizaciones Oficiales ({cotizaciones.length})
                  </h2>
                  <Link
                    href="/cotizador"
                    className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Nueva Cotización</span>
                  </Link>
                </div>

                {cotizaciones.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {cotizaciones.map((cot) => (
                      <div
                        key={cot.id}
                        className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="flex items-center justify-between">
                          <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            Versión {cot.version}
                          </span>
                          <span className="cifra text-sm font-bold text-neutral-900 dark:text-white">
                            {formatearDinero(cot.precioVenta)}
                          </span>
                        </div>
                        <h4 className="mt-2 text-xs font-bold text-neutral-800 dark:text-neutral-100">
                          {cot.titulo}
                        </h4>
                        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] text-neutral-400 dark:border-neutral-800">
                          <span>
                            {cot.vigenteHasta
                              ? `Vigente hasta ${formatearFecha(cot.vigenteHasta)}`
                              : 'Sin vencimiento'}
                          </span>
                          <Link
                            href={`/cotizaciones/${cot.id}`}
                            className="inline-flex items-center gap-1 font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                          >
                            <span>Ver cotización</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <AvisoVacio
                    titulo="Sin cotizaciones emitidas"
                    descripcion="Aún no se han generado cotizaciones formales para este contacto."
                  />
                )}
              </section>
            </div>
          )}

          {pestanaActiva === 'seguimientos' && (
            <section className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                  Seguimientos y Compromisos del Asesor ({seguimientos.length})
                </h2>
                <button
                  type="button"
                  onClick={() => setModalSeguimientoAbierto(true)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nuevo Seguimiento</span>
                </button>
              </div>

              {seguimientos.length > 0 ? (
                <div className="space-y-2.5">
                  {seguimientos.map((seg) => {
                    const completado = seg.completadoEn !== null;
                    return (
                      <div
                        key={seg.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            disabled={completado}
                            onClick={() => {
                              void handleCompletarSeguimiento(seg.id);
                            }}
                            className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              completado
                                ? 'cursor-default border-emerald-500 bg-emerald-500 text-white'
                                : 'border-neutral-300 hover:border-teal-500 hover:bg-teal-50 dark:border-neutral-700 dark:hover:bg-teal-950/40'
                            }`}
                            aria-label={
                              completado
                                ? 'Seguimiento ya completado'
                                : 'Marcar seguimiento como completado'
                            }
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <div>
                            <p
                              className={`text-xs font-bold ${
                                completado
                                  ? 'text-neutral-400 line-through dark:text-neutral-500'
                                  : 'text-neutral-900 dark:text-neutral-100'
                              }`}
                            >
                              {seg.descripcion}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {completado && seg.completadoEn
                                  ? `Cumplido el ${formatearFecha(seg.completadoEn, { conHora: true })}`
                                  : `Vence el ${formatearFecha(seg.venceEn, { conHora: true })}`}
                              </span>
                              {seg.oportunidadTitulo && (
                                <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                                  {seg.oportunidadTitulo}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {!completado && (
                          <button
                            type="button"
                            onClick={() => {
                              void handleCompletarSeguimiento(seg.id);
                            }}
                            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300"
                          >
                            <span>Completar</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <AvisoVacio
                  titulo="Sin seguimientos"
                  descripcion="No hay compromisos comerciales programados para este contacto."
                />
              )}
            </section>
          )}

          {pestanaActiva === 'campos' && (
            <section className="space-y-4 pt-2">
              <SeccionCamposPersonalizados entidad="contacto" entidadId={contacto.id} />
            </section>
          )}
        </div>
      </main>

      {/* Modales */}
      {modalEditarAbierto && (
        <ModalEditarContacto
          contacto={contacto}
          onCerrar={() => setModalEditarAbierto(false)}
          onGuardar={handleGuardarContacto}
        />
      )}

      {modalOportunidadAbierto && (
        <ModalCrearOportunidad
          contactoId={contacto.id}
          contactoNombre={contacto.nombre}
          onCerrar={() => setModalOportunidadAbierto(false)}
          onCrear={handleCrearOportunidad}
        />
      )}

      {modalSeguimientoAbierto && (
        <ModalCrearSeguimiento
          contactoId={contacto.id}
          oportunidadId={oportunidadActual?.id}
          onCerrar={() => setModalSeguimientoAbierto(false)}
          onCrear={handleCrearSeguimiento}
        />
      )}
    </div>
  );
}
