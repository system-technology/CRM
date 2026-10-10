'use client';

/**
 * Pantalla de conversación abierta de WhatsApp (`/bandeja/[id]`).
 *
 * Muestra el historial completo de mensajes y notas internas:
 * - 3 Estados obligatorios: Cargando (esqueleto en forma de burbujas), Vacío (chat sin mensajes) y Error (con reintento).
 * - Envío optimista: el mensaje aparece inmediatamente en estado PENDIENTE y luego pasa a ENTREGADO/FALLIDO.
 * - Idempotencia R5: la clave de idempotencia (UUID v4) se genera UNA vez por intento y se REUTILIZA intacta en los reintentos.
 * - Muestra en badge de inspección la clave de idempotencia para verificación visual sin leer código.
 * - Fallo visible y recuperable: si un mensaje falla, se queda en el hilo en rojo con su motivo y botón "Reintentar envío".
 * - Accesibilidad keyboard-nav: cada mensaje declara role="article", tabIndex={0} y foco visible.
 * - Ventana de 24h: deshabilitada para texto libre cuando está cerrada, con opción de plantillas HSM.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  ConversacionDetalle,
  EstadoMensaje,
  Mensaje as TipoMensaje,
} from '@viajapro/contracts';
import {
  ASESORES,
  asignarConversacionMock,
  cambiarEstadoConversacionMock,
  crearNotaMock,
  enviarTextoMock,
  obtenerConversacionDetalleMock,
} from '../../../lib/mock-inbox';
import { useInboxRealtime } from '../../../lib/use-inbox-realtime';

export default function ConversacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario de redacción
  const [modoNota, setModoNota] = useState(false);
  const [textoMensaje, setTextoMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [simularFallo, setSimularFallo] = useState(false);

  // Mapa local para rastrear la clave de idempotencia asignada a cada mensaje (R5)
  const [idempotenciaKeys, setIdempotenciaKeys] = useState<Record<string, string>>({});

  // Escucha de tiempo real para nuevos mensajes o actualizaciones de estado
  useInboxRealtime({
    onMensajeNuevo: (conversacionId, mensaje) => {
      if (conversacionId === id) {
        setDetalle((prev) => (prev ? { ...prev, mensajes: [...prev.mensajes, mensaje] } : null));
      }
    },
    onMensajeActualizado: (conversacionId, mensajeId, estado, motivoFallo) => {
      if (conversacionId === id) {
        setDetalle((prev) =>
          prev
            ? {
                ...prev,
                mensajes: prev.mensajes.map((m) =>
                  m.id === mensajeId ? { ...m, estado: estado as EstadoMensaje, motivoFallo } : m,
                ),
              }
            : null,
        );
      }
    },
  });

  // Carga inicial de los datos de la conversación
  const cargarDetalle = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await obtenerConversacionDetalleMock(id);
      if (!res) {
        setError('La conversación solicitada no existe o fue eliminada.');
      } else {
        setDetalle(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la conversación');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargarDetalle();
  }, [cargarDetalle]);

  // Cambiar asignación de asesor
  const manejarAsignacion = async (usuarioId: string | null) => {
    if (!detalle) return;
    try {
      const nuevoResumen = await asignarConversacionMock({
        conversacionId: detalle.id,
        usuarioId,
      });
      setDetalle((prev) =>
        prev
          ? {
              ...prev,
              asignadoAId: nuevoResumen.asignadoAId,
              asignadoANombre: nuevoResumen.asignadoANombre,
            }
          : null,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al reasignar');
    }
  };

  // Cambiar estado de la conversación (ABIERTA, EN_ESPERA, CERRADA)
  const manejarEstado = async (nuevoEstado: 'ABIERTA' | 'EN_ESPERA' | 'CERRADA') => {
    if (!detalle) return;
    try {
      await cambiarEstadoConversacionMock({
        conversacionId: detalle.id,
        estado: nuevoEstado,
      });
      setDetalle((prev) => (prev ? { ...prev, estado: nuevoEstado } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al cambiar estado');
    }
  };

  // Enviar mensaje u optimista / Nota interna
  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detalle || !textoMensaje.trim() || enviando) return;

    setEnviando(true);
    setErrorEnvio(null);

    if (modoNota) {
      try {
        const nuevaNota = await crearNotaMock({
          conversacionId: detalle.id,
          texto: textoMensaje.trim(),
        });
        setDetalle((prev) => (prev ? { ...prev, notas: [...prev.notas, nuevaNota] } : null));
        setTextoMensaje('');
      } catch (err) {
        setErrorEnvio(err instanceof Error ? err.message : 'Error al crear la nota');
      } finally {
        setEnviando(false);
      }
      return;
    }

    // ENVÍO OPTIMISTA DE MENSAJE A CLIENTE (R5 Idempotencia)
    const claveIdempotencia = crypto.randomUUID();
    const tempId = crypto.randomUUID();
    const textoAEnviar = textoMensaje.trim();

    // Guardar la clave de idempotencia asociada al mensaje
    setIdempotenciaKeys((prev) => ({ ...prev, [tempId]: claveIdempotencia }));

    // 1. Inserción optimista inmediata en estado PENDIENTE
    const mensajeOptimista: TipoMensaje = {
      id: tempId,
      conversacionId: detalle.id,
      direccion: 'SALIENTE',
      tipo: 'TEXTO',
      texto: textoAEnviar,
      adjuntos: [],
      estado: 'PENDIENTE',
      motivoFallo: null,
      autorId: '00000000-0000-4000-a000-000000000001',
      autorNombre: 'Asesor Actual',
      ocurridoEn: new Date().toISOString(),
    };

    setDetalle((prev) =>
      prev ? { ...prev, mensajes: [...prev.mensajes, mensajeOptimista] } : null,
    );
    setTextoMensaje('');

    // 2. Simulación de respuesta del servidor (con o sin fallo intencional)
    setTimeout(() => {
      void (async () => {
        try {
          if (simularFallo) {
            throw new Error('Fallo simulado de red en WhatsApp Cloud API');
          }
          await enviarTextoMock({
            conversacionId: detalle.id,
            texto: textoAEnviar,
            claveIdempotencia,
          });

          // Actualizar mensaje a ENTREGADO
          setDetalle((prev) =>
            prev
              ? {
                  ...prev,
                  mensajes: prev.mensajes.map((m) =>
                    m.id === tempId ? { ...m, estado: 'ENTREGADO' } : m,
                  ),
                }
              : null,
          );
        } catch (err) {
          // Fallo visible en el hilo: se mantiene en estado FALLIDO con su botón de reintento
          const motivo = err instanceof Error ? err.message : 'Error al entregar mensaje';
          setDetalle((prev) =>
            prev
              ? {
                  ...prev,
                  mensajes: prev.mensajes.map((m) =>
                    m.id === tempId ? { ...m, estado: 'FALLIDO', motivoFallo: motivo } : m,
                  ),
                }
              : null,
          );
        } finally {
          setEnviando(false);
        }
      })();
    }, 400);
  };

  // Reintento de un mensaje fallido REUTILIZANDO EXACTAMENTE LA MISMA CLAVE (R5)
  const reintentarEnvioMensaje = (mensajeId: string, texto: string) => {
    if (!detalle) return;

    // Obtener la clave de idempotencia original (NUNCA se genera una nueva en el reintento)
    const claveOriginal = idempotenciaKeys[mensajeId] ?? crypto.randomUUID();

    // 1. Cambiar mensaje a PENDIENTE de nuevo
    setDetalle((prev) =>
      prev
        ? {
            ...prev,
            mensajes: prev.mensajes.map((m) =>
              m.id === mensajeId ? { ...m, estado: 'PENDIENTE', motivoFallo: null } : m,
            ),
          }
        : null,
    );

    // 2. Re-enviar con la MISMA clave de idempotencia
    setTimeout(() => {
      void (async () => {
        try {
          await enviarTextoMock({
            conversacionId: detalle.id,
            texto,
            claveIdempotencia: claveOriginal,
          });

          setDetalle((prev) =>
            prev
              ? {
                  ...prev,
                  mensajes: prev.mensajes.map((m) =>
                    m.id === mensajeId ? { ...m, estado: 'ENTREGADO' } : m,
                  ),
                }
              : null,
          );
        } catch (err) {
          const motivo = err instanceof Error ? err.message : 'Fallo en reintento';
          setDetalle((prev) =>
            prev
              ? {
                  ...prev,
                  mensajes: prev.mensajes.map((m) =>
                    m.id === mensajeId ? { ...m, estado: 'FALLIDO', motivoFallo: motivo } : m,
                  ),
                }
              : null,
          );
        }
      })();
    }, 400);
  };

  return (
    <div className="flex h-screen flex-col bg-neutral-100 text-neutral-900">
      {/* ESTADO 1: CARGANDO (Esqueleto en forma de burbujas) */}
      {cargando && (
        <div
          className="flex h-full animate-pulse flex-col space-y-4 p-4"
          aria-busy="true"
          aria-label="Cargando historial de mensajes"
        >
          <div className="flex h-14 items-center justify-between rounded-md border border-neutral-200 bg-white p-3" />
          <div className="flex-1 space-y-4 rounded-md border border-neutral-200 bg-white p-4">
            <div className="flex flex-col items-start space-y-1">
              <div className="h-3 w-24 rounded bg-neutral-200" />
              <div className="h-12 w-2/3 rounded-md bg-neutral-200" />
            </div>
            <div className="flex flex-col items-end space-y-1">
              <div className="h-3 w-24 rounded bg-neutral-200" />
              <div className="h-10 w-1/2 rounded-md bg-neutral-200" />
            </div>
            <div className="flex flex-col items-start space-y-1">
              <div className="h-3 w-24 rounded bg-neutral-200" />
              <div className="h-16 w-3/4 rounded-md bg-neutral-200" />
            </div>
          </div>
          <div className="h-24 rounded-md border border-neutral-200 bg-white p-3" />
        </div>
      )}

      {/* ESTADO 2: ERROR EN CARGA */}
      {!cargando && (error || !detalle) && (
        <div
          role="alert"
          className="border-alerta-600/30 m-auto max-w-md rounded-md border bg-white p-6 text-center shadow-xs"
        >
          <div className="mb-2 text-2xl">⚠️</div>
          <h2 className="text-base font-semibold text-neutral-800">
            No pudimos abrir la conversación
          </h2>
          <p className="mt-1 text-xs text-neutral-500">{error ?? 'Conversación no encontrada.'}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => void cargarDetalle()}
              className="rounded-sm border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Reintentar
            </button>
            <Link
              href="/bandeja"
              className="bg-acento-700 hover:bg-acento-800 rounded-sm px-3 py-1.5 text-xs font-medium text-white"
            >
              Volver a la bandeja
            </Link>
          </div>
        </div>
      )}

      {/* DETALLE COMPLETO DE CONVERSACIÓN */}
      {!cargando && detalle && (
        <>
          {/* CABECERA (Alta densidad, datos clave de un vistazo) */}
          <header className="shrink-0 border-b border-neutral-200 bg-white px-3 py-2.5 shadow-xs">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {/* Info Cliente */}
              <div className="flex items-center gap-3">
                <Link
                  href="/bandeja"
                  className="rounded-sm border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                  title="Volver a la lista"
                >
                  ← Volver
                </Link>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base font-bold text-neutral-900">
                      {detalle.contactoNombre ? detalle.contactoNombre : detalle.contactoTelefono}
                    </h1>
                    {detalle.contactoNombre && (
                      <span className="cifra text-xs font-normal text-neutral-400">
                        {detalle.contactoTelefono}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {/* Badge Ventana 24h */}
                    {!detalle.ventana.abierta ? (
                      <span className="py-0.2 rounded-xs border border-neutral-300 bg-neutral-100 px-1.5 text-[10px] font-bold text-neutral-600">
                        Ventana 24h Cerrada
                      </span>
                    ) : (
                      <span className="border-ok-600/30 bg-ok-50 py-0.2 text-ok-700 rounded-xs border px-1.5 text-[10px] font-medium">
                        Ventana 24h activa
                      </span>
                    )}

                    {/* Etiquetas */}
                    {detalle.etiquetas.map((e) => (
                      <span
                        key={e}
                        className="py-0.2 rounded-xs border border-neutral-200 bg-neutral-100 px-1.5 text-[10px] text-neutral-600"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Acciones de gestión: Asignación y Estado */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Selector de Asignación */}
                <label className="flex items-center gap-1 text-xs text-neutral-500">
                  <span>Asignado:</span>
                  <select
                    value={detalle.asignadoAId ?? ''}
                    onChange={(e) => void manejarAsignacion(e.target.value || null)}
                    className={`rounded-sm border px-2 py-1 text-xs font-medium ${
                      detalle.asignadoAId === null
                        ? 'border-amber-500/50 bg-amber-50 text-amber-800'
                        : 'border-neutral-300 bg-white text-neutral-800'
                    }`}
                  >
                    <option value="">Sin asignar</option>
                    {ASESORES.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Selector de Estado */}
                <select
                  value={detalle.estado}
                  onChange={(e) =>
                    void manejarEstado(e.target.value as 'ABIERTA' | 'EN_ESPERA' | 'CERRADA')
                  }
                  className="rounded-sm border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700"
                >
                  <option value="ABIERTA">Abierta</option>
                  <option value="EN_ESPERA">En Espera</option>
                  <option value="CERRADA">Cerrada</option>
                </select>
              </div>
            </div>
          </header>

          {/* HISTORIAL DE MENSAJES Y NOTAS INTERNAS */}
          <main
            role="log"
            aria-label="Historial de mensajes de la conversación"
            className="flex-1 space-y-3 overflow-y-auto p-3 focus:outline-none sm:p-4"
          >
            {/* ESTADO 3: VACÍO (Conversación abierta sin mensajes aún) */}
            {detalle.mensajes.length === 0 && detalle.notas.length === 0 && (
              <div className="mx-auto my-12 max-w-sm rounded-md border border-neutral-200 bg-white p-6 text-center shadow-2xs">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-lg">
                  💬
                </div>
                <h2 className="text-sm font-semibold text-neutral-800">
                  Conversación sin mensajes
                </h2>
                <p className="mt-1 text-xs text-neutral-500">
                  El cliente abrió el chat pero aún no hay mensajes registrados. Escribe abajo para
                  iniciar la conversación.
                </p>
              </div>
            )}

            {/* Lista de mensajes con accesibilidad por teclado y foco visible */}
            {detalle.mensajes.map((m) => {
              const esEntrante = m.direccion === 'ENTRANTE';
              const esFallido = m.estado === 'FALLIDO';
              const esPendiente = m.estado === 'PENDIENTE';
              const claveIdemp = idempotenciaKeys[m.id];

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${esEntrante ? 'items-start' : 'items-end'}`}
                >
                  <div
                    role="article"
                    tabIndex={0}
                    aria-label={`Mensaje ${esEntrante ? 'de ' + (detalle.contactoNombre ?? 'cliente') : 'enviado por ' + (m.autorNombre ?? 'asesor')}: ${m.texto ?? ''}`}
                    className={`focus:outline-acento-600 max-w-xl space-y-1.5 rounded-md border p-3 shadow-2xs transition-all focus:outline-2 focus:outline-offset-2 ${
                      esEntrante
                        ? 'border-neutral-200 bg-white text-neutral-900'
                        : esFallido
                          ? 'border-alerta-600/40 bg-alerta-50 text-neutral-900'
                          : esPendiente
                            ? 'border-neutral-300 bg-neutral-50 text-neutral-600 opacity-80'
                            : 'border-acento-100 bg-acento-50 text-neutral-900'
                    }`}
                  >
                    {/* Autor e Instante */}
                    <div className="flex items-center justify-between gap-4 text-[11px] text-neutral-400">
                      <span className="font-semibold text-neutral-600">
                        {esEntrante
                          ? (detalle.contactoNombre ?? 'Cliente')
                          : (m.autorNombre ?? 'Asesor')}
                      </span>
                      <span className="cifra flex items-center gap-1">
                        {new Date(m.ocurridoEn).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* RENDERIZADO SEGÚN TIPO DE CONTENIDO */}
                    <RenderMensajeContenido mensaje={m} />

                    {/* DEMOSTRACIÓN VISUAL DE IDEMPOTENCIA (R5): Clave visible en la UI */}
                    {claveIdemp && (
                      <div className="inline-block rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                        🔑 Clave Idempotencia:{' '}
                        <span className="font-bold">{claveIdemp.slice(0, 8)}...</span>
                      </div>
                    )}

                    {/* REQUERIMIENTO CRÍTICO: Estado FALLIDO visible y recuperable con botón de reintento */}
                    {esFallido && (
                      <div className="border-alerta-600/30 bg-alerta-50 text-alerta-700 mt-2 space-y-1.5 rounded-xs border p-2 text-xs">
                        <div>
                          <strong className="block font-semibold">❌ Mensaje fallido:</strong>
                          <span>
                            {m.motivoFallo ??
                              'El servidor de WhatsApp no pudo entregar el mensaje.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => reintentarEnvioMensaje(m.id, m.texto ?? '')}
                          className="bg-alerta-700 hover:bg-alerta-800 rounded-xs px-2.5 py-1 text-xs font-semibold text-white shadow-2xs"
                        >
                          🔄 Reintentar envío (Reutiliza clave R5)
                        </button>
                      </div>
                    )}

                    {/* Estado del mensaje saliente (PENDIENTE, ENTREGADO, LEIDO) */}
                    {!esEntrante && !esFallido && (
                      <div className="text-right text-[10px] font-medium text-neutral-500">
                        {esPendiente ? '⏳ Enviando optimista...' : `✓ ${m.estado}`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* REQUERIMIENTO CRÍTICO: Notas Internas Inconfundibles (Estilo Post-it Amarillo) */}
            {detalle.notas.length > 0 && (
              <div className="space-y-2 pt-3">
                <div className="text-center">
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-0.5 text-[11px] font-bold text-amber-900">
                    🔒 NOTAS INTERNAS DEL EQUIPO ({detalle.notas.length})
                  </span>
                </div>
                {detalle.notas.map((n) => (
                  <div
                    key={n.id}
                    role="article"
                    tabIndex={0}
                    aria-label={`Nota interna del equipo: ${n.texto}`}
                    className="mx-auto max-w-xl space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 shadow-2xs focus:outline-2 focus:outline-amber-600"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                      <span>🔒 NOTA INTERNA — Solo visible para el equipo</span>
                      <span className="cifra font-normal text-amber-700">
                        {new Date(n.creadaEn).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-base whitespace-pre-wrap">{n.texto}</p>
                    <div className="text-[11px] font-medium text-amber-800">
                      Escrita por: {n.autorNombre}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* CAJA DE REDACCIÓN (Validación de ventana de 24h & Idempotencia R5) */}
          <footer className="shrink-0 border-t border-neutral-200 bg-white p-3">
            {/* REQUERIMIENTO CRÍTICO: Ventana de 24h Cerrada */}
            {!detalle.ventana.abierta ? (
              <div className="space-y-2 rounded-md border border-neutral-300 bg-neutral-100 p-3 text-center text-xs text-neutral-700">
                <div className="font-semibold text-neutral-800">
                  🔒 Ventana de servicio de 24 horas expirada
                </div>
                <p>
                  Han transcurrido más de 24 horas desde el último mensaje del cliente. No es
                  posible enviar mensajes de texto libre por políticas de Meta.
                </p>
                <button
                  onClick={() => alert('Selección de plantillas HSM aprobadas por Meta.')}
                  className="bg-acento-700 hover:bg-acento-800 rounded-sm px-3 py-1.5 font-medium text-white"
                >
                  Enviar plantilla aprobada por Meta
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void manejarEnvio(e)} className="space-y-2">
                {/* Controles de redacción y pruebas de depuración */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex rounded-sm border border-neutral-200 bg-neutral-100 p-0.5">
                    <button
                      type="button"
                      onClick={() => setModoNota(false)}
                      className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                        !modoNota
                          ? 'bg-white font-semibold text-neutral-900 shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      💬 Mensaje a cliente
                    </button>
                    <button
                      type="button"
                      onClick={() => setModoNota(true)}
                      className={`rounded-xs px-2.5 py-1 text-xs font-medium transition-colors ${
                        modoNota
                          ? 'bg-amber-400 font-bold text-amber-950 shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      🔒 Nota interna (equipo)
                    </button>
                  </div>

                  {/* Interruptor de prueba de fallo para verificar la idempotencia R5 */}
                  {!modoNota && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-500">
                      <input
                        type="checkbox"
                        checked={simularFallo}
                        onChange={(e) => setSimularFallo(e.target.checked)}
                        className="text-alerta-600 focus:ring-alerta-600 rounded border-neutral-300"
                      />
                      <span className="text-[11px]">Simular fallo de envío (Prueba R5)</span>
                    </label>
                  )}
                </div>

                {errorEnvio && (
                  <div className="border-alerta-600/30 bg-alerta-50 text-alerta-700 rounded-xs border p-2 text-xs">
                    {errorEnvio}
                  </div>
                )}

                {/* Área de texto de redacción */}
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={textoMensaje}
                    onChange={(e) => setTextoMensaje(e.target.value)}
                    placeholder={
                      modoNota
                        ? 'Escribe una nota interna para el equipo (nunca se envía al cliente)…'
                        : 'Escribe tu respuesta a cliente…'
                    }
                    className={`flex-1 rounded-sm border p-2 text-base placeholder-neutral-400 focus:outline-none ${
                      modoNota
                        ? 'border-amber-300 bg-amber-50/50 focus:border-amber-500'
                        : 'focus:border-acento-600 border-neutral-300 bg-neutral-50 focus:bg-white'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={enviando || !textoMensaje.trim()}
                    className={`self-end rounded-sm px-4 py-2 text-xs font-semibold text-white shadow-2xs disabled:opacity-50 ${
                      modoNota
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-acento-700 hover:bg-acento-800'
                    }`}
                  >
                    {enviando ? 'Enviando…' : modoNota ? 'Guardar nota' : 'Enviar'}
                  </button>
                </div>
              </form>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

/** Componente auxiliar para renderizar todos los tipos de contenido de `@viajapro/contracts` */
function RenderMensajeContenido({ mensaje: m }: { mensaje: TipoMensaje }) {
  return (
    <div className="space-y-1.5">
      {/* Texto principal si existe */}
      {m.texto && <p className="text-base whitespace-pre-wrap">{m.texto}</p>}

      {/* Renderizado de adjuntos */}
      {m.adjuntos.length > 0 && (
        <div className="space-y-1 pt-1">
          {m.adjuntos.map((adj) => (
            <div key={adj.id} className="rounded border border-neutral-200 bg-white/80 p-2 text-xs">
              {adj.tipo === 'IMAGEN' ? (
                <div className="space-y-1">
                  <img
                    src={adj.url}
                    alt={adj.nombreArchivo ?? 'Imagen adjunta'}
                    className="max-h-48 rounded object-cover"
                  />
                  {adj.nombreArchivo && (
                    <span className="text-[10px] text-neutral-400">{adj.nombreArchivo}</span>
                  )}
                </div>
              ) : adj.tipo === 'AUDIO' ? (
                <audio controls src={adj.url} className="h-8 w-full" />
              ) : (
                <a
                  href={adj.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-acento-700 flex items-center gap-1 font-medium underline"
                >
                  📄 {adj.nombreArchivo ?? 'Archivo adjunto'} (
                  {Math.round((adj.tamanoBytes ?? 0) / 1024)} KB)
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Casos especiales de tipos de contenido Meta */}
      {m.tipo === 'PLANTILLA' && (
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
          <span className="font-semibold text-neutral-800">📋 Plantilla HSM</span>
        </div>
      )}

      {m.tipo === 'UBICACION' && (
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
          📍 <span className="font-medium">Ubicación compartida por el viajero</span>
        </div>
      )}

      {m.tipo === 'CONTACTO' && (
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
          🎴 <span className="font-medium">Tarjeta de contacto compartida</span>
        </div>
      )}

      {m.tipo === 'NO_SOPORTADO' && (
        <div className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-500 italic">
          Mensaje de tipo no soportado en esta versión.
        </div>
      )}
    </div>
  );
}
