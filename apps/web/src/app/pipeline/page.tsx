'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { EtapaDefinida, MotivoPerdida, Oportunidad, TableroPipeline } from '@viajapro/contracts';
import { Kanban, Table as TableIcon, Search, Filter, Plus } from 'lucide-react';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { ColumnaKanban } from '../../components/pipeline/columna-kanban';
import { ModalMotivoPerdida } from '../../components/pipeline/modal-motivo-perdida';
import { obtenerMockTableroPipeline } from '../../lib/mock-pipeline';
import { formatearDineroCifra, moverOportunidadEnTablero } from '../../lib/pipeline-logica';
import { obtenerTableroPipeline, moverOportunidadDeEtapa } from '../../lib/crm-api';

export default function PipelinePage() {
  const [tablero, setTablero] = useState<TableroPipeline>(() => obtenerMockTableroPipeline());
  const [vista, setVista] = useState<'kanban' | 'tabla'>('kanban');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroAsesor, setFiltroAsesor] = useState<string>('todos');

  // Carga inicial del tablero (API real si está disponible, o mock offline)
  useEffect(() => {
    let activo = true;
    obtenerTableroPipeline()
      .then((datos) => {
        if (activo) setTablero(datos);
      })
      .catch((err) => {
        console.warn('Error al cargar tablero CRM:', err);
      });
    return () => {
      activo = false;
    };
  }, []);

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

  // Mover oportunidad (actualización optimista + persistencia en API)
  const ejecutarMovimiento = async (
    oportunidadId: string,
    nuevaEtapa: EtapaDefinida,
    motivoPerdida: MotivoPerdida | null = null,
    notaPerdida: string | null = null,
  ) => {
    // 1. Actualización optimista local
    try {
      const nuevoTablero = moverOportunidadEnTablero(tablero, oportunidadId, {
        etapaId: nuevaEtapa.id,
        motivoPerdida,
        notaPerdida,
      });
      setTablero(nuevoTablero);
      mostrarAviso(`Oportunidad movida a "${nuevaEtapa.nombre}" con éxito.`);

      // 2. Persistencia en la API
      await moverOportunidadDeEtapa(oportunidadId, {
        etapaId: nuevaEtapa.id,
        motivoPerdida,
        notaPerdida,
      });
    } catch (e) {
      console.error(e);
      mostrarAviso('Error al persistir el movimiento de oportunidad.');
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

    if (nuevaEtapa.esPerdida) {
      setOportunidadPendientePerdida({ oportunidad: opEncontrada, etapaDestino: nuevaEtapa });
    } else {
      void ejecutarMovimiento(oportunidadId, nuevaEtapa, null, null);
    }
  };

  // Filtrado de tablero para vista
  const tableroFiltrado = useMemo(() => {
    if (!filtroTexto.trim() && filtroAsesor === 'todos') {
      return tablero;
    }

    const texto = filtroTexto.toLowerCase().trim();

    return {
      columnas: tablero.columnas.map((col) => ({
        ...col,
        oportunidades: col.oportunidades.filter((op) => {
          const coincideTexto =
            !texto ||
            op.titulo.toLowerCase().includes(texto) ||
            (op.destino && op.destino.toLowerCase().includes(texto)) ||
            (op.contactoNombre && op.contactoNombre.toLowerCase().includes(texto));

          const coincideAsesor =
            filtroAsesor === 'todos' ||
            op.asesorNombre?.toLowerCase().includes(filtroAsesor.toLowerCase());

          return coincideTexto && coincideAsesor;
        }),
      })),
    };
  }, [tablero, filtroTexto, filtroAsesor]);

  // Métricas rápidas de cabecera
  const totalOportunidadesActivas = tablero.columnas
    .filter((c) => !c.etapa.esPerdida && !c.etapa.esGanada)
    .reduce((acc, c) => acc + c.total, 0);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-100 text-neutral-900 select-none dark:bg-neutral-950 dark:text-neutral-100">
      {/* Barra de Módulos (56px) */}
      <BarraModulos />

      {/* Contenido Principal de Pipeline */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Cabecera de Página */}
        <header className="flex flex-col border-b border-neutral-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <div className="bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 flex h-8 w-8 items-center justify-center rounded-xl">
                  <Kanban className="h-4 w-4" />
                </div>
                <h1 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  Pipeline de Oportunidades
                </h1>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {totalOportunidadesActivas} activas
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Seguimiento comercial de paquetes y cierre de ventas
              </p>
            </div>

            {/* Acciones principales: Crear oportunidad + Switcher */}
            <div className="flex items-center space-x-3">
              {/* Conmutador de vista Kanban / Tabla */}
              <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-800/80">
                <button
                  type="button"
                  onClick={() => setVista('kanban')}
                  className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    vista === 'kanban'
                      ? 'bg-white text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-white'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                  }`}
                >
                  <Kanban className="h-3.5 w-3.5" />
                  <span>Tablero</span>
                </button>
                <button
                  type="button"
                  onClick={() => setVista('tabla')}
                  className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
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
                className="bg-acento-600 hover:bg-acento-700 flex items-center space-x-1.5 rounded-xl px-3.5 py-1.5 text-xs font-medium text-white shadow-xs transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nueva Oportunidad</span>
              </button>
            </div>
          </div>

          {/* Barra de Filtros y Búsqueda */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800/70">
            <div className="flex flex-1 items-center space-x-3">
              {/* Búsqueda */}
              <div className="relative max-w-sm flex-1">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-neutral-400" />
                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="Buscar por cliente, destino o título..."
                  className="focus:border-acento-500 w-full rounded-xl border border-neutral-200 bg-neutral-50 py-1.5 pr-3 pl-8 text-xs text-neutral-900 placeholder-neutral-400 focus:bg-white focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-100"
                />
              </div>

              {/* Selector de Asesor */}
              <div className="flex items-center space-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                <Filter className="h-3.5 w-3.5" />
                <select
                  value={filtroAsesor}
                  onChange={(e) => setFiltroAsesor(e.target.value)}
                  className="focus:border-acento-500 rounded-xl border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 focus:outline-hidden dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <option value="todos">Todos los asesores</option>
                  <option value="Carlos Asesor">Carlos Asesor</option>
                  <option value="Laura Gómez">Laura Gómez</option>
                  <option value="Carlos Rodríguez">Carlos Rodríguez</option>
                </select>
              </div>
            </div>

            {/* Aviso flotante */}
            {mensajeFeedback && (
              <div className="bg-ok-50 text-ok-800 dark:bg-ok-950/80 dark:text-ok-300 animate-in fade-in rounded-xl px-3 py-1 text-xs font-medium duration-200">
                {mensajeFeedback}
              </div>
            )}
          </div>
        </header>

        {/* Cuerpo Principal del Tablero Kanban */}
        {vista === 'kanban' ? (
          <div className="flex flex-1 overflow-x-auto overflow-y-hidden p-6">
            <div className="flex min-w-full space-x-4">
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
          /* Vista Tabla Compacta */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="rounded-2xl border border-neutral-200 bg-white shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
              <table className="w-full text-left text-xs">
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
                  {tableroFiltrado.columnas.flatMap((col) =>
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
                            className="text-acento-600 hover:text-acento-700 dark:text-acento-400 font-medium"
                          >
                            Chat
                          </Link>
                        </td>
                      </tr>
                    )),
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
