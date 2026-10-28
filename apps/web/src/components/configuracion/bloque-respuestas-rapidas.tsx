'use client';

import React, { useState, useMemo } from 'react';
import {
  CATEGORIAS_RESPUESTA_RAPIDA,
  filtrarRespuestasRapidas,
  guardarRespuestasRapidas,
  interpolarVariables,
  obtenerRespuestasRapidas,
  restablecerRespuestasRapidasPorDefecto,
  validarRespuestaRapida,
  type CategoriaRespuestaRapida,
  type RespuestaRapida,
} from '../../lib/respuestas-rapidas-logica';
import {
  Zap,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  CheckCircle2,
  Eye,
  Info,
  X,
  Save,
} from 'lucide-react';

export interface BloqueRespuestasRapidasProps {
  tenantId?: string | null | undefined;
  nombreAgencia?: string | undefined;
}

export function BloqueRespuestasRapidas({
  tenantId,
  nombreAgencia = 'Nuestra Agencia',
}: BloqueRespuestasRapidasProps) {
  const [respuestas, setRespuestas] = useState<RespuestaRapida[]>(() =>
    obtenerRespuestasRapidas(tenantId),
  );
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaRespuestaRapida | 'todas'>(
    'todas',
  );
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Estado para el modal / formulario de edición y creación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [idEditando, setIdEditando] = useState<string | null>(null);

  const [formAtajo, setFormAtajo] = useState('');
  const [formTitulo, setFormTitulo] = useState('');
  const [formCategoria, setFormCategoria] = useState<CategoriaRespuestaRapida>('general');
  const [formContenido, setFormContenido] = useState('');
  const [erroresForm, setErroresForm] = useState<Record<string, string>>({});

  // Previsualización interactiva con viajero de ejemplo
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [viajeroPrueba] = useState('Sofía Ramírez');

  const respuestasFiltradas = useMemo(() => {
    return filtrarRespuestasRapidas(respuestas, busqueda, categoriaFiltro);
  }, [respuestas, busqueda, categoriaFiltro]);

  const abrirCreacion = () => {
    setModoEdicion(false);
    setIdEditando(null);
    setFormAtajo('');
    setFormTitulo('');
    setFormCategoria('general');
    setFormContenido('');
    setErroresForm({});
    setModalAbierto(true);
  };

  const abrirEdicion = (rr: RespuestaRapida) => {
    setModoEdicion(true);
    setIdEditando(rr.id);
    setFormAtajo(rr.atajo);
    setFormTitulo(rr.titulo);
    setFormCategoria(rr.categoria);
    setFormContenido(rr.contenido);
    setErroresForm({});
    setModalAbierto(true);
  };

  const insertarTagEnContenido = (tag: string) => {
    setFormContenido((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  const guardarFormulario = (e: React.FormEvent) => {
    e.preventDefault();

    const datosValidar: Partial<RespuestaRapida> = {
      atajo: formAtajo.trim().toLowerCase().replace(/^\//, ''),
      titulo: formTitulo.trim(),
      categoria: formCategoria,
      contenido: formContenido.trim(),
    };

    const validacion = validarRespuestaRapida(datosValidar);
    if (!validacion.valido) {
      setErroresForm(validacion.errores);
      return;
    }

    // Verificar unicidad del atajo (excepto si estamos editando el mismo)
    const atajoExistente = respuestas.find(
      (r) => r.atajo.toLowerCase() === datosValidar.atajo && r.id !== idEditando,
    );
    if (atajoExistente) {
      setErroresForm({
        atajo: `El atajo «/${datosValidar.atajo}» ya está en uso por otra respuesta.`,
      });
      return;
    }

    let nuevasRespuestas: RespuestaRapida[];
    if (modoEdicion && idEditando) {
      nuevasRespuestas = respuestas.map((r) =>
        r.id === idEditando
          ? {
              ...r,
              atajo: datosValidar.atajo!,
              titulo: datosValidar.titulo!,
              categoria: datosValidar.categoria!,
              contenido: datosValidar.contenido!,
              actualizadoEn: new Date().toISOString(),
            }
          : r,
      );
      setMensajeExito(`Respuesta rápida «/${datosValidar.atajo}» actualizada exitosamente.`);
    } else {
      const nuevoItem: RespuestaRapida = {
        id: `rr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        atajo: datosValidar.atajo!,
        titulo: datosValidar.titulo!,
        categoria: datosValidar.categoria!,
        contenido: datosValidar.contenido!,
        agenciaId: tenantId ?? undefined,
        actualizadoEn: new Date().toISOString(),
      };
      nuevasRespuestas = [nuevoItem, ...respuestas];
      setMensajeExito(`Nueva respuesta rápida «/${datosValidar.atajo}» creada exitosamente.`);
    }

    setRespuestas(nuevasRespuestas);
    guardarRespuestasRapidas(nuevasRespuestas, tenantId);
    setModalAbierto(false);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const eliminarRespuesta = (id: string, atajo: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar la respuesta rápida «/${atajo}»?`)) {
      const actualizadas = respuestas.filter((r) => r.id !== id);
      setRespuestas(actualizadas);
      guardarRespuestasRapidas(actualizadas, tenantId);
      setMensajeExito(`Respuesta rápida «/${atajo}» eliminada.`);
      setTimeout(() => setMensajeExito(null), 3000);
    }
  };

  const restablecerPorDefecto = () => {
    if (
      window.confirm(
        '¿Deseas restablecer las respuestas rápidas predeterminadas para tu agencia? Esto sobreescribirá cambios no guardados.',
      )
    ) {
      const restablecidas = restablecerRespuestasRapidasPorDefecto(tenantId);
      setRespuestas(restablecidas);
      setMensajeExito('Se han restablecido las respuestas rápidas por defecto.');
      setTimeout(() => setMensajeExito(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera de la Sección */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Respuestas Rápidas para la Bandeja
            </h2>
            <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              {respuestas.length} disponibles
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
              T-104
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Los asesores pueden insertar estas plantillas en el compositor de WhatsApp escribiendo
            «/» seguido del atajo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={restablecerPorDefecto}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            title="Restablecer respuestas originales"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Restablecer por defecto</span>
          </button>

          <button
            type="button"
            onClick={abrirCreacion}
            className="bg-acento-700 hover:bg-acento-800 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors"
          >
            <Plus className="h-4 w-4" />
            <span>Nueva respuesta</span>
          </button>
        </div>
      </div>

      {/* Estado Honesto de la API / Persistencia (Criterio de Aceptación) */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950 dark:text-amber-100">
            Estado de Persistencia: Almacenamiento Local de Agencia Activo
          </p>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            Las respuestas rápidas que agregues o edites se almacenan de manera aislada para tu
            agencia en este navegador. La sincronización centralizada en base de datos
            multi-dispositivo entrará en producción cuando se active el endpoint de API de
            Respuestas Rápidas (T-078).
          </p>
        </div>
      </div>

      {/* Notificación de Éxito */}
      {mensajeExito && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{mensajeExito}</span>
        </div>
      )}

      {/* Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Categorías */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoriaFiltro('todas')}
            className={`flex min-h-[44px] items-center rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              categoriaFiltro === 'todas'
                ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
            }`}
          >
            Todas ({respuestas.length})
          </button>
          {CATEGORIAS_RESPUESTA_RAPIDA.map((cat) => {
            const count = respuestas.filter((r) => r.categoria === cat.id).length;
            const activa = categoriaFiltro === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaFiltro(cat.id)}
                className={`flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activa
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                }`}
              >
                <span>{cat.icono}</span>
                <span>{cat.etiqueta}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Buscador de atajos o textos */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar atajo o texto..."
            className="min-h-[44px] w-full rounded-xl border border-neutral-200 bg-white py-2 pr-3 pl-9 text-xs placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-white"
          />
        </div>
      </div>

      {/* Grid de Respuestas Rápidas */}
      {respuestasFiltradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center dark:border-neutral-800">
          <Zap className="mx-auto h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            No se encontraron respuestas rápidas
          </p>
          <p className="mt-1 text-[11px] text-neutral-400">
            {busqueda
              ? `No hay resultados para «${busqueda}». Prueba con otro término.`
              : 'Agrega una nueva respuesta rápida para agilizar la atención de tus asesores.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {respuestasFiltradas.map((rr) => {
            const cat = CATEGORIAS_RESPUESTA_RAPIDA.find((c) => c.id === rr.categoria);
            const enPreview = previewId === rr.id;
            const textoInterpolado = interpolarVariables(rr.contenido, {
              nombreCliente: viajeroPrueba,
              nombreAsesor: 'Carlos Asesor',
              nombreAgencia,
              destino: 'Cartagena de Indias',
            });

            return (
              <div
                key={rr.id}
                className="flex flex-col justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-acento-700 dark:text-acento-400 font-mono text-xs font-bold">
                        /{rr.atajo}
                      </span>
                      {cat && (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          {cat.icono} {cat.etiqueta}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPreviewId(enPreview ? null : rr.id)}
                        className={`flex h-8 min-h-[44px] w-8 min-w-[44px] items-center justify-center rounded-lg transition-colors ${
                          enPreview
                            ? 'bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300'
                            : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                        }`}
                        title="Alternar vista previa con variables"
                        aria-label="Alternar vista previa"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirEdicion(rr)}
                        className="flex h-8 min-h-[44px] w-8 min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        title="Editar respuesta rápida"
                        aria-label={`Editar respuesta ${rr.atajo}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => eliminarRespuesta(rr.id, rr.atajo)}
                        className="flex h-8 min-h-[44px] w-8 min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        title="Eliminar respuesta rápida"
                        aria-label={`Eliminar respuesta ${rr.atajo}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="mt-2 text-xs font-bold text-neutral-900 dark:text-white">
                    {rr.titulo}
                  </h3>

                  {/* Contenido (Plantilla o Vista Previa) */}
                  <div className="mt-2 rounded-xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
                    {enPreview ? (
                      <div>
                        <div className="text-acento-700 dark:text-acento-400 mb-1 flex items-center justify-between text-[10px] font-semibold">
                          <span>👁️ Vista previa ({viajeroPrueba}):</span>
                        </div>
                        <p className="whitespace-pre-wrap">{textoInterpolado}</p>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{rr.contenido}</p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-[10px] text-neutral-400 dark:border-neutral-800">
                  <span>Disparador: Escribe «/{rr.atajo}» en el chat</span>
                  {rr.actualizadoEn && (
                    <span>{new Date(rr.actualizadoEn).toLocaleDateString('es-CO')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Creación / Edición */}
      {modalAbierto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-modal-rr"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <span className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 flex h-7 w-7 items-center justify-center rounded-lg">
                  <Zap className="h-4 w-4" />
                </span>
                <h3
                  id="titulo-modal-rr"
                  className="text-sm font-bold text-neutral-900 dark:text-white"
                >
                  {modoEdicion ? 'Editar Respuesta Rápida' : 'Nueva Respuesta Rápida'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                className="flex h-8 min-h-[44px] w-8 min-w-[44px] items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                aria-label="Cerrar modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={guardarFormulario} className="mt-4 space-y-4">
              {/* Atajo */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Atajo disparador (sin espacios ni caracteres especiales)
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-xs font-bold text-neutral-400">
                    /
                  </span>
                  <input
                    type="text"
                    value={formAtajo}
                    onChange={(e) => setFormAtajo(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="ej. cuenta, requisitos, saludo"
                    className="min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2 pr-3 pl-7 font-mono text-xs focus:border-neutral-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-white"
                  />
                </div>
                {erroresForm.atajo && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {erroresForm.atajo}
                  </p>
                )}
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Título descriptivo
                </label>
                <input
                  type="text"
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  placeholder="ej. Datos de cuenta para pagos COP"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs focus:border-neutral-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-white"
                />
                {erroresForm.titulo && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {erroresForm.titulo}
                  </p>
                )}
              </div>

              {/* Categoría */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Categoría
                </label>
                <select
                  value={formCategoria}
                  onChange={(e) => setFormCategoria(e.target.value as CategoriaRespuestaRapida)}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs focus:border-neutral-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-white"
                >
                  {CATEGORIAS_RESPUESTA_RAPIDA.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icono} {cat.etiqueta}
                    </option>
                  ))}
                </select>
              </div>

              {/* Contenido con botones de variables */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Contenido del mensaje
                  </label>
                  <span className="text-[10px] text-neutral-400">Variables disponibles:</span>
                </div>

                {/* Botones de inserción de variables */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {[
                    { tag: '{nombre}', label: 'Nombre Viajero' },
                    { tag: '{asesor}', label: 'Asesor Activo' },
                    { tag: '{agencia}', label: 'Nombre Agencia' },
                    { tag: '{destino}', label: 'Destino Cotizado' },
                  ].map((v) => (
                    <button
                      key={v.tag}
                      type="button"
                      onClick={() => insertarTagEnContenido(v.tag)}
                      className="min-h-[32px] rounded-lg border border-neutral-200 bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-700 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      + {v.tag}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={4}
                  value={formContenido}
                  onChange={(e) => setFormContenido(e.target.value)}
                  placeholder="Escribe el mensaje. Las variables entre llaves se reemplazarán automáticamente en el chat..."
                  className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs focus:border-neutral-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:border-white"
                />
                {erroresForm.contenido && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                    {erroresForm.contenido}
                  </p>
                )}
              </div>

              {/* Botones de acción del modal */}
              <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setModalAbierto(false)}
                  className="flex min-h-[44px] items-center rounded-xl px-4 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-acento-700 hover:bg-acento-800 flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-2xs transition-colors"
                >
                  <Save className="h-4 w-4" />
                  <span>{modoEdicion ? 'Guardar Cambios' : 'Crear Respuesta'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
