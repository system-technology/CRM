'use client';

/**
 * Pantalla de Cotización Guardada y Control de Versiones (0c.22).
 *
 * Muestra la cabecera oficial y el histórico completo de versiones inmutables.
 * Cada versión conserva la instantánea exacta cotizada (paquete, fecha, pasajeros, líneas, total).
 * Modificar crea la versión siguiente (POST /api/v1/cotizaciones/:id/versiones)
 * manteniendo las versiones anteriores 100% inalteradas.
 * Venta comercial transparente y calculada (R10). Todo a 375 px.
 */

import React, { use, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  Copy,
  Check,
  Edit3,
  Users,
  AlertCircle,
  FileText,
  User,
} from 'lucide-react';
import type { Acomodacion, CotizacionGuardada, Contacto } from '@viajapro/contracts';
import { BarraModulos } from '../../../components/bandeja/barra-modulos';
import { MigasDePan } from '../../../components/comun/migas-de-pan';
import { formatearDinero } from '../../../lib/api';
import {
  obtenerCotizacionGuardadaApi,
  anadirVersionCotizacionApi,
} from '../../../lib/cotizaciones-api';
import {
  armarCuerpoAnadirVersion,
  ordenarVersiones,
  obtenerUltimaVersion,
  interpretarErrorCotizaciones,
} from '../../../lib/cotizaciones-logica';
import { listarContactos } from '../../../lib/crm-api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PaginaCotizacionGuardada({ params }: PageProps) {
  const { id } = use(params);

  const [cotizacion, setCotizacion] = useState<CotizacionGuardada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<{
    codigo: string;
    mensaje: string;
    esErrorAgencia: boolean;
  } | null>(null);

  // Versión seleccionada actualmente
  const [versionSeleccionadaNumero, setVersionSeleccionadaNumero] = useState<number>(1);
  const [copiado, setCopiado] = useState(false);

  // Contacto asociado
  const [contacto, setContacto] = useState<Contacto | null>(null);

  // Modal para crear nueva versión
  const [modalModificarAbierto, setModalModificarAbierto] = useState(false);
  const [guardandoVersion, setGuardandoVersion] = useState(false);
  const [errorModificar, setErrorModificar] = useState<string | null>(null);

  // Cargar datos de la cotización
  useEffect(() => {
    setCargando(true);
    setErrorCarga(null);

    obtenerCotizacionGuardadaApi(id)
      .then((data) => {
        setCotizacion(data);
        const ultima = obtenerUltimaVersion(data.versiones);
        if (ultima) {
          setVersionSeleccionadaNumero(ultima.numero);
        }

        // Cargar datos del contacto para mostrar nombre
        listarContactos()
          .then((pag) => {
            const encontrado = pag.datos.find((c) => c.id === data.contactoId);
            if (encontrado) setContacto(encontrado);
          })
          .catch(() => {});
      })
      .catch((err: unknown) => {
        setErrorCarga(interpretarErrorCotizaciones(err));
      })
      .finally(() => {
        setCargando(false);
      });
  }, [id]);

  // Versiones ordenadas cronológicamente
  const versionesCronologicas = useMemo(() => {
    if (!cotizacion) return [];
    return ordenarVersiones(cotizacion.versiones, 'asc');
  }, [cotizacion]);

  // Versión actualmente en vista
  const versionActual = useMemo(() => {
    if (!cotizacion) return null;
    return (
      cotizacion.versiones.find((v) => v.numero === versionSeleccionadaNumero) ??
      obtenerUltimaVersion(cotizacion.versiones) ??
      null
    );
  }, [cotizacion, versionSeleccionadaNumero]);

  // Formulario de modificación (para nueva versión)
  const [modFecha, setModFecha] = useState('');
  const [modAdultos, setModAdultos] = useState(2);
  const [modNinos, setModNinos] = useState(0);
  const [modInfantes, setModInfantes] = useState(0);
  const [modAcomodacion, setModAcomodacion] = useState<Acomodacion>('DOBLE');
  const [modVigenteHasta, setModVigenteHasta] = useState('');

  // Sincronizar formulario al abrir modal de modificación
  const abrirModalModificar = () => {
    if (!versionActual) return;
    setModFecha(versionActual.fechaSalida);
    setModAdultos(versionActual.adultos);
    setModNinos(versionActual.ninos);
    setModInfantes(versionActual.infantes);
    setModAcomodacion((versionActual.acomodacion as Acomodacion) || 'DOBLE');
    setModVigenteHasta(versionActual.vigenteHasta || '');
    setErrorModificar(null);
    setModalModificarAbierto(true);
  };

  const manejarCrearNuevaVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cotizacion || !versionActual) return;

    setGuardandoVersion(true);
    setErrorModificar(null);

    try {
      const cuerpo = armarCuerpoAnadirVersion({
        paqueteId: versionActual.paqueteId,
        fecha: modFecha,
        adultos: modAdultos,
        ninos: modNinos,
        infantes: modInfantes,
        acomodacion: modAcomodacion,
        vigenteHasta: modVigenteHasta || undefined,
      });

      const cotizacionActualizada = await anadirVersionCotizacionApi(cotizacion.id, cuerpo);
      setCotizacion(cotizacionActualizada);

      // Seleccionar automáticamente la nueva versión creada
      const ultima = obtenerUltimaVersion(cotizacionActualizada.versiones);
      if (ultima) {
        setVersionSeleccionadaNumero(ultima.numero);
      }

      setModalModificarAbierto(false);
    } catch (err: unknown) {
      const interpretado = interpretarErrorCotizaciones(err);
      setErrorModificar(interpretado.mensaje);
    } finally {
      setGuardandoVersion(false);
    }
  };

  // Generador de propuesta WhatsApp para la versión seleccionada
  const copiarPropuestaWhatsApp = () => {
    if (!cotizacion || !versionActual) return;

    const nombreViajero = contacto?.nombre || 'Viajero';
    const linesText = versionActual.lineas
      .map((l) => `  • ${l.nombre} (${l.veces}x) — *${formatearDinero(l.total)}*`)
      .join('\n');

    const mensaje = `¡Hola, ${nombreViajero}! Te comparto la ${cotizacion.titulo} (Versión ${versionActual.numero}):

🌴 *${versionActual.paqueteNombre.toUpperCase()}*
📍 *Destino:* ${versionActual.destino}
📅 *Fecha de Salida:* ${versionActual.fechaSalida} (${versionActual.noches} noches)
👥 *Pasajeros:* ${versionActual.adultos} adulto(s)${versionActual.ninos > 0 ? `, ${versionActual.ninos} niño(s)` : ''}${versionActual.infantes > 0 ? `, ${versionActual.infantes} infante(s)` : ''}

📋 *Desglose de Tarifas:*
${linesText}

💰 *TOTAL VENTA:* *${formatearDinero(versionActual.venta)}*
${versionActual.vigenteHasta ? `⏳ *Oferta vigente hasta:* ${versionActual.vigenteHasta}\n` : ''}
_Quedo muy atento a cualquier consulta para confirmar tu reserva._`;

    void navigator.clipboard.writeText(mensaje).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    });
  };

  return (
    <div className="flex h-screen w-full bg-neutral-50 dark:bg-neutral-950">
      <BarraModulos />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
          {/* Migas de pan de turismo y estado oficial (T-034) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MigasDePan
              elementos={[
                { etiqueta: 'Inicio', href: '/' },
                { etiqueta: 'Cotizaciones', href: '/cotizaciones' },
                {
                  etiqueta: cotizacion?.titulo
                    ? cotizacion.titulo
                    : `Cotización #${id.slice(0, 8)}`,
                },
              ]}
              mostrarBotonVolver
              volverHref="/cotizaciones"
              volverTexto="Volver a Cotizaciones"
            />

            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
              Cotización Oficial Guardada
            </span>
          </div>

          {/* Estado de carga (Esqueleto - 0c.25) */}
          {cargando && (
            <div className="animate-pulse space-y-6 select-none">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
                  <div className="space-y-2">
                    <div className="h-4 w-48 rounded bg-neutral-200 dark:bg-neutral-700" />
                    <div className="h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800" />
                  </div>
                  <div className="h-8 w-24 rounded-lg bg-neutral-200 dark:bg-neutral-700" />
                </div>
                <div className="mt-6 space-y-3">
                  <div className="h-3.5 w-full rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="h-3.5 w-5/6 rounded bg-neutral-100 dark:bg-neutral-800" />
                </div>
                <div className="mt-8 flex justify-between border-t border-neutral-100 pt-4 dark:border-neutral-800">
                  <div className="h-3 w-20 rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="h-6 w-32 rounded bg-purple-200 dark:bg-purple-900" />
                </div>
              </div>
            </div>
          )}

          {/* Error de carga (404 honesto) */}
          {!cargando && errorCarga && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold">
                    {errorCarga.codigo === 'COTIZACION_NO_ENCONTRADA'
                      ? 'Cotización no encontrada'
                      : 'Error al consultar la cotización'}
                  </h3>
                  <p className="mt-1 text-xs">{errorCarga.mensaje}</p>
                  <div className="mt-4">
                    <Link
                      href="/cotizador"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-purple-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800"
                    >
                      Ir al Cotizador
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contenido de la Cotización Guardada */}
          {!cargando && !errorCarga && cotizacion && versionActual && (
            <>
              {/* Cabecera Principal */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-neutral-100 px-2.5 py-0.5 text-xs font-bold text-neutral-700 uppercase dark:bg-neutral-800 dark:text-neutral-300">
                        {cotizacion.estado}
                      </span>
                      <span className="text-xs text-neutral-400">
                        Registrada:{' '}
                        {new Date(cotizacion.creadaEn).toLocaleDateString('es-CO', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    <h1 className="mt-2 text-2xl font-black text-neutral-900 dark:text-white">
                      {cotizacion.titulo}
                    </h1>

                    <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-neutral-400" />
                        Viajero: <strong>{contacto?.nombre || 'Contacto registrado'}</strong>
                      </span>
                      {contacto?.telefono && (
                        <span className="font-mono text-neutral-500">({contacto.telefono})</span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-neutral-400" />
                        Historial: {cotizacion.versiones.length}{' '}
                        {cotizacion.versiones.length === 1 ? 'versión' : 'versiones'}
                      </span>
                    </div>
                  </div>

                  {/* Botón Prominente: Modificar (Crear Nueva Versión) */}
                  <div className="flex flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={abrirModalModificar}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-purple-800"
                    >
                      <Edit3 className="h-4 w-4" />
                      <span>Modificar (Nueva Versión)</span>
                    </button>
                    <span className="text-[11px] text-neutral-400">
                      Crea la versión {cotizacion.versiones.length + 1} sin alterar las anteriores
                    </span>
                  </div>
                </div>
              </div>

              {/* Selector de Versiones (Tabs/Pills) */}
              <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                    Historial de Versiones Inmutables ({versionesCronologicas.length})
                  </span>
                  <span className="text-[11px] text-neutral-400">
                    Haga clic en una versión para ver exactamente lo que se cotizó ese día
                  </span>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {versionesCronologicas.map((v) => {
                    const activa = v.numero === versionActual.numero;
                    const fechaTxt = new Date(v.creadaEn).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVersionSeleccionadaNumero(v.numero)}
                        className={`flex min-h-[44px] items-center gap-3 rounded-xl border px-4 py-2 text-xs font-semibold transition-all ${
                          activa
                            ? 'border-purple-600 bg-purple-50 text-purple-950 shadow-xs dark:border-purple-500 dark:bg-purple-950/40 dark:text-purple-200'
                            : 'border-neutral-200 bg-neutral-50/70 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800/40 dark:text-neutral-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              activa
                                ? 'bg-purple-700 text-white'
                                : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200'
                            }`}
                          >
                            {v.numero}
                          </span>
                          <span className="font-bold">Versión {v.numero}</span>
                        </div>

                        <span className="text-[11px] font-normal opacity-75">({fechaTxt})</span>

                        <span className="cifra font-extrabold text-neutral-900 dark:text-white">
                          {formatearDinero(v.venta)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Detalle de la Versión Activa */}
              <div className="grid gap-6 lg:grid-cols-12">
                {/* Columna Izquierda: Parámetros e Invariantes */}
                <div className="space-y-4 lg:col-span-4">
                  <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                        Detalles de la Versión {versionActual.numero}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                        <Clock className="h-3 w-3" />
                        {new Date(versionActual.creadaEn).toLocaleString('es-CO')}
                      </span>
                    </div>

                    <div className="mt-4 space-y-3 text-xs">
                      <div>
                        <span className="text-neutral-500">Paquete Turístico:</span>
                        <p className="font-bold text-neutral-900 dark:text-white">
                          {versionActual.paqueteNombre}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Destino:</span>
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {versionActual.destino}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Fecha de Salida:</span>
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {versionActual.fechaSalida} ({versionActual.noches} noches)
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-neutral-500">Pasajeros:</span>
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {versionActual.adultos} adt
                          {versionActual.ninos > 0 ? `, ${versionActual.ninos} chd` : ''}
                          {versionActual.infantes > 0 ? `, ${versionActual.infantes} inf` : ''}
                        </span>
                      </div>

                      {versionActual.acomodacion && (
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Acomodación:</span>
                          <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                            {versionActual.acomodacion}
                          </span>
                        </div>
                      )}

                      {versionActual.vigenteHasta && (
                        <div className="flex items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
                          <span className="text-neutral-500">Oferta válida hasta:</span>
                          <span className="font-bold text-amber-700 dark:text-amber-400">
                            {versionActual.vigenteHasta}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Tabla de Líneas y Total */}
                <div className="space-y-6 lg:col-span-8">
                  {/* Desglose de Líneas */}
                  <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
                          Líneas de Precio — Versión {versionActual.numero}
                        </h2>
                        <p className="text-xs text-neutral-500">
                          Tarifas congeladas en el momento de crear esta versión
                        </p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {versionActual.lineas.length}{' '}
                        {versionActual.lineas.length === 1 ? 'línea' : 'líneas'}
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-neutral-100 dark:border-neutral-800">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
                            <th className="px-4 py-2.5 text-left font-medium">Concepto</th>
                            <th className="px-4 py-2.5 text-left font-medium">Modalidad</th>
                            <th className="px-4 py-2.5 text-right font-medium">Cantidad</th>
                            <th className="px-4 py-2.5 text-right font-medium">Precio Unitario</th>
                            <th className="px-4 py-2.5 text-right font-medium">Subtotal Venta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                          {versionActual.lineas.map((linea) => (
                            <tr key={linea.tarifaId}>
                              <td className="px-4 py-3 font-bold text-neutral-800 dark:text-neutral-200">
                                {linea.nombre}
                              </td>
                              <td className="px-4 py-3 text-neutral-500">
                                {linea.unidad === 'POR_PERSONA' ? 'Por persona' : 'Por grupo'}
                              </td>
                              <td className="cifra px-4 py-3 text-right font-semibold text-neutral-700 dark:text-neutral-300">
                                {linea.veces}x
                              </td>
                              <td className="cifra px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                                {formatearDinero(linea.precioUnitario)}
                              </td>
                              <td className="cifra px-4 py-3 text-right text-sm font-black text-neutral-900 dark:text-white">
                                {formatearDinero(linea.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-neutral-200 bg-neutral-50/80 font-bold dark:border-neutral-700 dark:bg-neutral-800/60">
                            <td
                              colSpan={4}
                              className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200"
                            >
                              Total Venta Versión {versionActual.numero}:
                            </td>
                            <td className="cifra px-4 py-3 text-right text-lg font-black text-purple-700 dark:text-purple-400">
                              {formatearDinero(versionActual.venta)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                  {/* Acciones de WhatsApp */}
                  <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs sm:flex-row dark:border-neutral-800 dark:bg-neutral-900">
                    <div>
                      <h4 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Propuesta para WhatsApp (Versión {versionActual.numero})
                      </h4>
                      <p className="text-[11px] text-neutral-500">
                        Copia el texto comercial listo para compartir con el cliente
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={copiarPropuestaWhatsApp}
                      className="bg-ok-600 hover:bg-ok-700 flex min-h-[44px] w-full shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs font-bold text-white shadow-xs transition-colors sm:w-auto"
                    >
                      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copiado ? '¡Copiado al Portapapeles!' : 'Copiar Propuesta WhatsApp'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Modal Crear Nueva Versión («Modificar») */}
          {modalModificarAbierto && versionActual && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-modal-modificar"
              className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs duration-200"
            >
              <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                      <Edit3 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2
                        id="titulo-modal-modificar"
                        className="text-base font-bold text-neutral-900 dark:text-white"
                      >
                        Crear Versión {(cotizacion?.versiones.length ?? 1) + 1}
                      </h2>
                      <p className="text-xs text-neutral-500">
                        Modifica composición de viaje conservando la Versión {versionActual.numero}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalModificarAbierto(false)}
                    disabled={guardandoVersion}
                    aria-label="Cerrar modal"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    ×
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    void manejarCrearNuevaVersion(e);
                  }}
                  className="space-y-4 p-6 text-xs"
                >
                  {errorModificar && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="font-semibold">{errorModificar}</p>
                    </div>
                  )}

                  {/* Fecha de Salida */}
                  <div>
                    <label
                      htmlFor="input-mod-fecha"
                      className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300"
                    >
                      <Calendar className="h-3.5 w-3.5 text-neutral-400" />
                      Fecha de salida *
                    </label>
                    <input
                      id="input-mod-fecha"
                      type="date"
                      value={modFecha}
                      onChange={(e) => setModFecha(e.target.value)}
                      disabled={guardandoVersion}
                      required
                      className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  {/* Pasajeros */}
                  <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40">
                    <span className="flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-300">
                      <Users className="h-3.5 w-3.5 text-neutral-400" />
                      Composición de Pasajeros
                    </span>

                    {/* Adultos */}
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Adultos (mín 1):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModAdultos(Math.max(1, modAdultos - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          -
                        </button>
                        <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                          {modAdultos}
                        </span>
                        <button
                          type="button"
                          onClick={() => setModAdultos(modAdultos + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Niños */}
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Niños (2-11 años):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModNinos(Math.max(0, modNinos - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          -
                        </button>
                        <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                          {modNinos}
                        </span>
                        <button
                          type="button"
                          onClick={() => setModNinos(modNinos + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Infantes */}
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Infantes (&lt; 2 años):
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setModInfantes(Math.max(0, modInfantes - 1))}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          -
                        </button>
                        <span className="cifra w-6 text-center text-sm font-bold text-neutral-900 dark:text-white">
                          {modInfantes}
                        </span>
                        <button
                          type="button"
                          onClick={() => setModInfantes(modInfantes + 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-300 bg-white font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Acomodación */}
                  <div>
                    <label
                      htmlFor="select-mod-acomodacion"
                      className="font-bold text-neutral-700 dark:text-neutral-300"
                    >
                      Acomodación
                    </label>
                    <select
                      id="select-mod-acomodacion"
                      value={modAcomodacion}
                      onChange={(e) => setModAcomodacion(e.target.value as Acomodacion)}
                      disabled={guardandoVersion}
                      className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    >
                      <option value="SENCILLA">Sencilla (1 persona)</option>
                      <option value="DOBLE">Doble (2 personas)</option>
                      <option value="TRIPLE">Triple (3 personas)</option>
                      <option value="CUADRUPLE">Cuádruple (4 personas)</option>
                    </select>
                  </div>

                  {/* Vigente Hasta */}
                  <div>
                    <label
                      htmlFor="input-mod-vigente"
                      className="font-bold text-neutral-700 dark:text-neutral-300"
                    >
                      Válida hasta (opcional)
                    </label>
                    <input
                      id="input-mod-vigente"
                      type="date"
                      value={modVigenteHasta}
                      onChange={(e) => setModVigenteHasta(e.target.value)}
                      disabled={guardandoVersion}
                      className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 shadow-2xs focus:border-purple-600 focus:ring-1 focus:ring-purple-600 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                  </div>

                  <p className="text-[11px] text-neutral-500">
                    * El servidor recalculará los importes oficiales. La Versión{' '}
                    {versionActual.numero} no cambiará.
                  </p>

                  <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setModalModificarAbierto(false)}
                      disabled={guardandoVersion}
                      className="flex min-h-[44px] items-center justify-center rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={guardandoVersion}
                      className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-purple-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50"
                    >
                      {guardandoVersion ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Guardando nueva versión...</span>
                        </>
                      ) : (
                        <span>Guardar Versión {(cotizacion?.versiones.length ?? 1) + 1}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
