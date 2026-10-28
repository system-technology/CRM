'use client';

import { useModoDemo } from '../../lib/modo-demo';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { EtapaDefinida, MotivoPerdida, Oportunidad, TableroPipeline } from '@viajapro/contracts';
import { Kanban, Table as TableIcon, Search, Filter, Plus } from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { ColumnaKanban } from '../../components/pipeline/columna-kanban';
import { ModalMotivoPerdida } from '../../components/pipeline/modal-motivo-perdida';
import { DistintivoDatosDemo } from '../../components/comun/distintivo-datos-demo';
import { EsqueletoKanban, AvisoErrorAccionable } from '../../components/comun/esqueletos';
import { AvisoConfiguracionTenant } from '../../components/crm/aviso-configuracion-tenant';
import { obtenerMockTableroPipeline } from '../../lib/mock-pipeline';
import { formatearDineroCifra, moverOportunidadEnTablero } from '../../lib/pipeline-logica';
import {
  formatearErrorAmigable,
  construirMensajeErrorAccionable,
} from '../../lib/estados-ui-logica';
import {
  obtenerTableroPipeline,
  moverOportunidadDeEtapa,
  estaUsandoApiReal,
  CrmApiError,
} from '../../lib/crm-api';
import {
  useFiltrosPersistidos,
  CLAVE_FILTROS_PIPELINE,
  FILTROS_PIPELINE_DEFECTO,
  type FiltrosPipelinePersistidos,
} from '../../lib/filtros-guardados-logica';

const CAMPOS_IGNORADOS_PIPELINE: (keyof FiltrosPipelinePersistidos)[] = ['vista'];

export default function PipelinePage() {
  const { esDemo } = useModoDemo();
  const [tablero, setTablero] = useState<TableroPipeline>(() => obtenerMockTableroPipeline());

  // Filtros persistidos en localStorage con opción de limpiar (T-103)
  const {
    filtros: filtrosPersistidos,
    actualizarFiltro,
    limpiarFiltros,
    tieneFiltrosActivos,
  } = useFiltrosPersistidos(
    CLAVE_FILTROS_PIPELINE,
    FILTROS_PIPELINE_DEFECTO,
    CAMPOS_IGNORADOS_PIPELINE,
  );

  const vista = filtrosPersistidos.vista;
  const filtroTexto = filtrosPersistidos.filtroTexto;
  const filtroAsesor = filtrosPersistidos.filtroAsesor;

  const setVista = (v: 'kanban' | 'tabla') => actualizarFiltro('vista', v);
  const setFiltroTexto = (v: string) => actualizarFiltro('filtroTexto', v);
  const setFiltroAsesor = (v: string) => actualizarFiltro('filtroAsesor', v);

  // Estado del origen de datos y configuración (Tarea 0c.14)
  const [esModoSimulado, setEsModoSimulado] = useState<boolean>(!estaUsandoApiReal());
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarDemoForzado, setMostrarDemoForzado] = useState<boolean>(false);
  const [cargandoApi, setCargandoApi] = useState<boolean>(estaUsandoApiReal());

  const cargarTablero = () => {
    if (!estaUsandoApiReal() || esDemo) {
      setTablero(obtenerMockTableroPipeline());
      setEsModoSimulado(true);
      setCargandoApi(false);
      setErrorConfiguracion(null);
      setErrorCarga(null);
      return;
    }

    setCargandoApi(true);
    setErrorCarga(null);
    setErrorConfiguracion(null);

    obtenerTableroPipeline()
      .then((datos) => {
        setTablero(datos);
        setEsModoSimulado(false);
        setErrorConfiguracion(null);
        setErrorCarga(null);
      })
      .catch((err) => {
        if (
          err instanceof CrmApiError &&
          (err.status === 401 || err.code === 'SIN_SESION' || err.code === 'CONFIG_TENANT_FALTANTE')
        ) {
          setErrorConfiguracion(formatearErrorAmigable(err));
        } else {
          setErrorCarga(formatearErrorAmigable(err, 'No fue posible cargar el tablero pipeline.'));
        }
      })
      .finally(() => {
        setCargandoApi(false);
      });
  };

  // Carga inicial del tablero (API real si está disponible y configurada, o mock)
  useEffect(() => {
    cargarTablero();
  }, [esDemo]);

  // Estado del modal de pérdida
  const [oportunidadPendientePerdida, setOportunidadPendientePerdida] = useState<{
    oportunidad: Oportunidad;
    etapaDestino: EtapaDefinida;
  } | null>(null);

  // Mensaje de feedback/notificación
  const [mensajeFeedback, setMensajeFeedback] = useState<string | null>(null);

  const mostrarAviso = (msg: string) => {
    setMensajeFeedback(msg);
    setTimeout(() => setMensajeFeedback(null), 3000);
  };

  // Mover oportunidad (actualización optimista + persistencia en API con reversión)
  const ejecutarMovimiento = async (
    oportunidadId: string,
    nuevaEtapa: EtapaDefinida,
    motivoPerdida: MotivoPerdida | null = null,
    notaPerdida: string | null = null,
  ) => {
    const tableroPrevio = tablero;
    let nuevoTablero: TableroPipeline;
    try {
      nuevoTablero = moverOportunidadEnTablero(tablero, oportunidadId, {
        etapaId: nuevaEtapa.id,
        motivoPerdida,
        notaPerdida,
      });
    } catch (errorValidacion) {
      console.error(errorValidacion);
      mostrarAviso(
        errorValidacion instanceof Error
          ? errorValidacion.message
          : 'Error al mover la oportunidad.',
      );
      return;
    }

    // 1. Actualización optimista local
    setTablero(nuevoTablero);
    mostrarAviso(`Oportunidad movida a "${nuevaEtapa.nombre}" con éxito.`);

    // 2. Persistencia en la API
    try {
      await moverOportunidadDeEtapa(oportunidadId, {
        etapaId: nuevaEtapa.id,
        motivoPerdida,
        notaPerdida,
      });
    } catch (e) {
      console.error(e);
      // Reversión optimista ante error en la API
      setTablero(tableroPrevio);
      mostrarAviso('Error al persistir el movimiento de oportunidad. Se revirtió el cambio.');
    }
  };

  // Manejar solicitud de movimiento (desde teclado o drop)
  const manejarSolicitudMover = (op: Oportunidad, nuevaEtapa: EtapaDefinida) => {
    if (nuevaEtapa.esPerdida) {
      // Exige abrir el modal de motivo
      setOportunidadPendientePerdida({ oportunidad: op, etapaDestino: nuevaEtapa });
    } else {
      void ejecutarMovimiento(op.id, nuevaEtapa, null, null);
    }
  };

  // Manejar drop de HTML5 drag & drop
  const manejarDropOportunidad = (oportunidadId: string, nuevaEtapa: EtapaDefinida) => {
    let opEncontrada: Oportunidad | null = null;
    for (const col of tablero.columnas) {
      const op = col.oportunidades.find((o) => o.id === oportunidadId);
      if (op) {
        opEncontrada = op;
        break;
      }
    }
    if (!opEncontrada) return;

    if (opEncontrada.etapa.id === nuevaEtapa.id) return;

    manejarSolicitudMover(opEncontrada, nuevaEtapa);
  };

  // Filtrado de tablero por texto y asesor
  const tableroFiltrado = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();
    const asesor = filtroAsesor;

    return {
      ...tablero,
      columnas: tablero.columnas.map((col) => ({
        ...col,
        oportunidades: col.oportunidades.filter((op) => {
          // Filtro por asesor
          if (asesor !== 'todos' && op.asesorNombre !== asesor) {
            return false;
          }
          // Filtro por texto
          if (texto) {
            const coincideTitulo = op.titulo.toLowerCase().includes(texto);
            const coincideCliente = op.contactoNombre
              ? op.contactoNombre.toLowerCase().includes(texto)
              : false;
            const coincideDestino = op.destino ? op.destino.toLowerCase().includes(texto) : false;
            return coincideTitulo || coincideCliente || coincideDestino;
          }
          return true;
        }),
      })),
    };
  }, [tablero, filtroTexto, filtroAsesor]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de Módulos (56px) */}
      <BarraModulos />

      {/* Contenedor Principal del Pipeline */}
      <main className="flex flex-1 flex-col overflow-hidden pb-14 md:pb-0">
        {/* Cabecera del Pipeline */}
        <header className="min-w-0 border-b border-neutral-200 bg-white px-3.5 py-3 shadow-2xs sm:px-6 sm:py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Kanban className="text-acento-600 dark:text-acento-400 h-5 w-5" />
                <h1 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Pipeline de Oportunidades
                </h1>
                {(esModoSimulado || mostrarDemoForzado) && <DistintivoDatosDemo />}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Gestión comercial de prospectos y cotizaciones en curso
              </p>
            </div>

            {/* Controles de Vista y Acción Principal */}
            <div className="flex items-center space-x-3">
              {/* Selector Kanban / Tabla con touch target >= 44px */}
              <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-800 dark:bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setVista('kanban')}
                  className={`flex min-h-[44px] items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    vista === 'kanban'
                      ? 'bg-white text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  <Kanban className="h-3.5 w-3.5" />
                  <span>Kanban</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVista('tabla')}
                  className={`flex min-h-[44px] items-center space-x-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    vista === 'tabla'
                      ? 'bg-white text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Tabla</span>
                </button>
              </div>

              {/* Botón de crear oportunidad */}
              <button
                type="button"
                onClick={() => mostrarAviso('Creación de oportunidad disponible en cotizador.')}
                className="bg-acento-600 hover:bg-acento-700 flex min-h-[44px] items-center space-x-1.5 rounded-xl px-4 py-2.5 text-xs font-medium text-white shadow-xs transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Oportunidad</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800/70">
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:space-x-3">
              {/* Búsqueda */}
              <div className="relative w-full sm:max-w-sm sm:flex-1">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="Buscar por cliente, destino o título..."
                  className="focus:border-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pr-3 pl-8 text-xs text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-100"
                />
              </div>

              {/* Selector de Asesor */}
              <div className="flex w-full items-center space-x-1.5 text-xs text-neutral-500 sm:w-auto dark:text-neutral-400">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filtroAsesor}
                  onChange={(e) => setFiltroAsesor(e.target.value)}
                  aria-label="Filtrar por asesor"
                  className="focus:border-acento-500 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-xs text-neutral-700 focus:outline-hidden sm:w-auto dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="todos">Todos los asesores</option>
                  <option value="Carlos Asesor">Carlos Asesor</option>
                  <option value="Laura Gómez">Laura Gómez</option>
                  <option value="Carlos Rodríguez">Carlos Rodríguez</option>
                </select>
              </div>

              {/* Botón Limpiar Filtros */}
              {tieneFiltrosActivos && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  title="Limpiar filtros guardados"
                  aria-label="Limpiar filtros del pipeline"
                  className="flex min-h-[44px] items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Aviso flotante accesible */}
            {mensajeFeedback && (
              <div
                role="status"
                aria-live="polite"
                className="bg-ok-50 text-ok-800 dark:bg-ok-950/80 dark:text-ok-300 animate-in fade-in rounded-xl px-3 py-1.5 text-xs font-medium duration-200"
              >
                {mensajeFeedback}
              </div>
            )}
          </div>
        </header>

        {/* Cuerpo Principal del Tablero Kanban */}
        {errorConfiguracion && !mostrarDemoForzado ? (
          <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
            <AvisoConfiguracionTenant
              mensajeError={errorConfiguracion}
              onContinuarConDemo={() => setMostrarDemoForzado(true)}
            />
          </div>
        ) : errorCarga && !mostrarDemoForzado ? (
          <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
            <AvisoErrorAccionable
              error={construirMensajeErrorAccionable(errorCarga, 'PIPELINE_TABLERO')}
              onReintentar={cargarTablero}
            />
          </div>
        ) : cargandoApi ? (
          <EsqueletoKanban />
        ) : vista === 'kanban' ? (
          <div className="flex flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-6">
            <div className="flex min-w-full space-x-3 sm:space-x-4">
              {tableroFiltrado.columnas.map((columna) => (
                <ColumnaKanban
                  key={columna.etapa.id}
                  columna={columna}
                  etapas={tablero.columnas.map((c) => c.etapa)}
                  onSolicitarMover={manejarSolicitudMover}
                  onDropOportunidad={manejarDropOportunidad}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Vista Tabla Compacta con scroll horizontal contenido en móvil */
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Oportunidad</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Destino</th>
                    <th className="px-4 py-3">Etapa</th>
                    <th className="px-4 py-3 text-right">Valor Estimado</th>
                    <th className="px-4 py-3">Próxima Tarea</th>
                    <th className="px-4 py-3">Asesor</th>
                    <th className="px-4 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {tableroFiltrado.columnas.every((col) => col.oportunidades.length === 0) ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-xs text-neutral-400">
                        No hay oportunidades que coincidan con los filtros aplicados.
                      </td>
                    </tr>
                  ) : (
                    tableroFiltrado.columnas.flatMap((col) =>
                      col.oportunidades.map((op) => (
                        <tr
                          key={op.id}
                          className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40"
                        >
                          <td className="px-4 py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                            {op.titulo}
                          </td>
                          <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">
                            {op.contactoNombre || '—'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                            {op.destino || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                              {op.etapa.nombre}
                            </span>
                          </td>
                          <td className="cifra px-4 py-3 text-right font-bold text-neutral-900 dark:text-neutral-100">
                            {formatearDineroCifra(op.valorEstimado)}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-neutral-600 dark:text-neutral-400">
                            {op.proximaTarea ? op.proximaTarea.descripcion : '—'}
                          </td>
                          <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                            {op.asesorNombre || 'Sin asignar'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link
                              href="/bandeja"
                              aria-label={`Abrir chat con ${op.contactoNombre || 'cliente'}`}
                              className="text-acento-600 hover:text-acento-700 dark:text-acento-400 inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-medium"
                            >
                              Chat
                            </Link>
                          </td>
                        </tr>
                      )),
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Motivo de Pérdida */}
      {oportunidadPendientePerdida && (
        <ModalMotivoPerdida
          oportunidad={oportunidadPendientePerdida.oportunidad}
          onConfirmar={(motivo, nota) => {
            void ejecutarMovimiento(
              oportunidadPendientePerdida.oportunidad.id,
              oportunidadPendientePerdida.etapaDestino,
              motivo,
              nota,
            );
            setOportunidadPendientePerdida(null);
          }}
          onCancelar={() => setOportunidadPendientePerdida(null)}
        />
      )}
    </div>
  );
}
