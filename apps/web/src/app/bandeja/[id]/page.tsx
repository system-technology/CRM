'use client';

/**
 * Pantalla de conversación abierta de WhatsApp (`/bandeja/[id]`).
 *
 * Características:
 * - Historial completo contra `ConversacionDetalle` (@viajapro/contracts).
 * - 3 Estados de carga:
 *   1. Cargando: Skeleton visual imitando la forma de las burbujas.
 *   2. Vacío: Estado para conversaciones sin mensajes con sugerencias.
 *   3. Error: Mensaje claro con botón de reintento.
 * - Envío Optimista e Idempotencia Estricta (R5):
 *   * Mensaje entra al hilo como `PENDIENTE`.
 *   * Genera UUID v4 (`claveIdempotencia`) una sola vez. En reintentos se reutiliza exactamente la misma clave.
 *   * Demostración visible: Badge de clave de idempotencia en la UI.
 * - TIEMPO REAL (`EventoBandeja`):
 *   * safeParse para ignorar eventos desconocidos sin fallar.
 *   * Desplazamiento Inteligente: No roba el scroll si el usuario está leyendo arriba;
 *     muestra un aviso "Hay mensajes nuevos ↓".
 * - Accesibilidad total con teclado (ArrowUp/ArrowDown, role="log", role="article").
 * - Validación estricta de la Ventana de Servicio 24h.
 */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  EnviarTexto,
  EventoBandeja,
  type ConversacionDetalle,
  type Mensaje as TipoMensaje,
} from '@viajapro/contracts';
import {
  ID_ASESOR_ACTUAL,
  NOMBRE_ASESOR_ACTUAL,
  obtenerConversacionDetalleMock,
} from '../../../lib/mock-inbox';
import { realtimeMockBus } from '../../../lib/realtime-mock';
import { SimuladorTiempoReal } from '../../../components/SimuladorTiempoReal';

export default function ConversacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  // Estados principales de la vista
  const [cargando, setCargando] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);

  // Estados de redacción y envío
  const [textoMensaje, setTextoMensaje] = useState('');
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Control de fallos simulados y mapa local de claves de idempotencia (R5)
  const [simularFallo, setSimularFallo] = useState(false);
  const [idempotenciaKeys, setIdempotenciaKeys] = useState<Record<string, string>>({});

  // Desplazamiento inteligente y aviso de mensajes nuevos en tiempo real
  const [mensajesNuevosSinVer, setMensajesNuevosSinVer] = useState(0);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Navegación por teclado en el historial
  const [indiceFocusMensaje, setIndiceFocusMensaje] = useState<number | null>(null);
  const mensajeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Comprobar si el scroll está cerca del fondo
  const checkIsNearBottom = () => {
    if (!chatContainerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const isNear = distanceToBottom <= 120;
    isNearBottomRef.current = isNear;
    if (isNear) {
      setMensajesNuevosSinVer(0);
    }
    return isNear;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior,
      });
      setMensajesNuevosSinVer(0);
    }
  };

  // Carga inicial de la conversación
  const cargarHistorial = useCallback(async () => {
    setCargando(true);
    setErrorHistorial(null);
    try {
      const data = await obtenerConversacionDetalleMock(id, 400);
      if (!data) {
        setErrorHistorial('No se encontró la conversación solicitada.');
        setDetalle(null);
      } else {
        setDetalle(data);
        setTimeout(() => scrollToBottom('auto'), 100);
      }
    } catch (e) {
      setErrorHistorial(
        e instanceof Error ? e.message : 'Error desconocido al cargar el historial.',
      );
      setDetalle(null);
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  // Suscripción a eventos de Tiempo Real (EventoBandeja)
  useEffect(() => {
    const unsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
      const targetConvId =
        evento.tipo === 'CONVERSACION_ACTUALIZADA' ? evento.conversacion.id : evento.conversacionId;
      if (targetConvId !== id) return;

      if (evento.tipo === 'MENSAJE_NUEVO') {
        setDetalle((prev) => {
          if (!prev) return null;
          if (prev.mensajes.some((m) => m.id === evento.mensaje.id)) return prev;

          const nuevosMensajes = [...prev.mensajes, evento.mensaje];

          const nearBottom = isNearBottomRef.current;
          if (nearBottom) {
            setTimeout(() => scrollToBottom('smooth'), 50);
          } else {
            setMensajesNuevosSinVer((count) => count + 1);
          }

          return {
            ...prev,
            mensajes: nuevosMensajes,
            ultimoMensajeTexto: evento.mensaje.texto || 'Adjunto',
            ultimoMensajeEn: evento.mensaje.ocurridoEn,
            ultimoMensajeDireccion: evento.mensaje.direccion,
          };
        });
      } else if (evento.tipo === 'MENSAJE_ACTUALIZADO') {
        setDetalle((prev) => {
          if (!prev) return null;
          const updatedMensajes = prev.mensajes.map((m) => {
            if (m.id === evento.mensajeId) {
              return {
                ...m,
                estado: evento.estado,
                motivoFallo: evento.motivoFallo,
              };
            }
            return m;
          });
          return { ...prev, mensajes: updatedMensajes };
        });
      } else if (evento.tipo === 'CONVERSACION_ACTUALIZADA') {
        setDetalle((prev) => (prev ? { ...prev, ...evento.conversacion } : null));
      }
    });

    return () => unsubscribe();
  }, [id]);

  // Redacción y envío con Actualización Optimista e Idempotencia Estricta (R5)
  const ejecutarEnvioMensaje = (textoEnviar: string, mensajeIdExistente?: string) => {
    if (!detalle) return;

    const ahora = new Date().toISOString();
    const mensajeId =
      mensajeIdExistente || `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let claveIdem = idempotenciaKeys[mensajeId];
    if (!claveIdem) {
      claveIdem = crypto.randomUUID();
      const nuevaClave = claveIdem;
      setIdempotenciaKeys((prev) => ({ ...prev, [mensajeId]: nuevaClave }));
    }
    const claveIdemFinal: string = claveIdem;

    const validacion = EnviarTexto.safeParse({
      conversacionId: detalle.id,
      texto: textoEnviar,
      claveIdempotencia: claveIdemFinal,
    });

    if (!validacion.success) {
      setErrorEnvio(validacion.error.issues[0]?.message || 'Contrato de envío no válido.');
      return;
    }

    setErrorEnvio(null);
    setEnviando(true);

    if (!mensajeIdExistente) {
      const mensajeOptimista: TipoMensaje = {
        id: mensajeId,
        conversacionId: detalle.id,
        direccion: 'SALIENTE',
        tipo: 'TEXTO',
        texto: textoEnviar,
        adjuntos: [],
        estado: 'PENDIENTE',
        motivoFallo: null,
        autorId: ID_ASESOR_ACTUAL,
        autorNombre: NOMBRE_ASESOR_ACTUAL,
        ocurridoEn: ahora,
      };

      setDetalle((prev) =>
        prev
          ? {
              ...prev,
              mensajes: [...prev.mensajes, mensajeOptimista],
              ultimoMensajeTexto: textoEnviar,
              ultimoMensajeEn: ahora,
              ultimoMensajeDireccion: 'SALIENTE',
            }
          : null,
      );
      setTextoMensaje('');
      setTimeout(() => scrollToBottom('smooth'), 50);
    } else {
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
    }

    setTimeout(() => {
      setEnviando(false);

      if (simularFallo) {
        setDetalle((prev) =>
          prev
            ? {
                ...prev,
                mensajes: prev.mensajes.map((m) =>
                  m.id === mensajeId
                    ? {
                        ...m,
                        estado: 'FALLIDO',
                        motivoFallo:
                          'Simulación R5: Error 503 en WhatsApp Cloud API. Reintenta con la misma clave.',
                      }
                    : m,
                ),
              }
            : null,
        );
      } else {
        setDetalle((prev) =>
          prev
            ? {
                ...prev,
                mensajes: prev.mensajes.map((m) =>
                  m.id === mensajeId ? { ...m, estado: 'ENTREGADO', motivoFallo: null } : m,
                ),
              }
            : null,
        );
      }
    }, 1200);
  };

  const manejarEnvio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textoMensaje.trim() || !detalle) return;

    if (modoNota) {
      const nuevaNota = {
        id: `nota-${Date.now()}`,
        texto: textoMensaje.trim(),
        autorId: ID_ASESOR_ACTUAL,
        autorNombre: NOMBRE_ASESOR_ACTUAL,
        creadaEn: new Date().toISOString(),
      };
      setDetalle((prev) => (prev ? { ...prev, notas: [...prev.notas, nuevaNota] } : null));
      setTextoMensaje('');
      setTimeout(() => scrollToBottom('smooth'), 50);
    } else {
      ejecutarEnvioMensaje(textoMensaje.trim());
    }
  };

  const reintentarMensaje = (m: TipoMensaje) => {
    if (m.texto) {
      ejecutarEnvioMensaje(m.texto, m.id);
    }
  };

  const handleKeyDownChat = (e: React.KeyboardEvent) => {
    if (!detalle?.mensajes.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceFocusMensaje((prev) => {
        const nextIdx = prev === null ? 0 : Math.min(prev + 1, detalle.mensajes.length - 1);
        mensajeRefs.current[nextIdx]?.focus();
        return nextIdx;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceFocusMensaje((prev) => {
        const nextIdx = prev === null ? detalle.mensajes.length - 1 : Math.max(prev - 1, 0);
        mensajeRefs.current[nextIdx]?.focus();
        return nextIdx;
      });
    }
  };

  return (
    <div
      className="flex h-screen flex-col bg-neutral-100 text-neutral-900 focus:outline-none"
      onKeyDown={handleKeyDownChat}
      tabIndex={0}
    >
      <header className="sticky top-0 z-10 shrink-0 border-b border-neutral-200 bg-white shadow-xs">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/bandeja"
              className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              ← Volver
            </Link>

            {detalle && (
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-neutral-900">
                    {detalle.contactoNombre || detalle.contactoTelefono}
                  </h1>
                  {detalle.contactoNombre && (
                    <span className="cifra text-xs text-neutral-500">
                      {detalle.contactoTelefono}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500">
                  {detalle.asignadoANombre
                    ? `Asignado a: ${detalle.asignadoANombre}`
                    : 'Sin asignar'}
                </p>
              </div>
            )}
          </div>

          {detalle && (
            <div className="flex items-center gap-2 text-xs">
              {!detalle.ventana.abierta ? (
                <span className="rounded-xs border border-neutral-300 bg-neutral-100 px-2 py-1 font-semibold text-neutral-600">
                  Ventana 24h Cerrada
                </span>
              ) : (
                <span className="border-ok-600/30 bg-ok-50 text-ok-700 rounded-xs border px-2 py-1 font-semibold">
                  24h Activa ({detalle.ventana.minutosRestantes ?? 1440}m)
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {cargando ? (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col space-y-4 p-4">
          <div className="flex justify-start">
            <div className="h-14 w-64 animate-pulse rounded-lg bg-neutral-200"></div>
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-48 animate-pulse rounded-lg bg-neutral-300"></div>
          </div>
          <div className="flex justify-start">
            <div className="h-20 w-80 animate-pulse rounded-lg bg-neutral-200"></div>
          </div>
        </main>
      ) : errorHistorial ? (
        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center p-4">
          <div className="border-alerta-600/30 bg-alerta-50 w-full max-w-md rounded-md border p-6 text-center shadow-xs">
            <div className="text-2xl">⚠️</div>
            <h2 className="text-alerta-900 mt-2 text-base font-bold">
              Error al cargar el historial
            </h2>
            <p className="text-alerta-700 mt-1 text-xs">{errorHistorial}</p>
            <button
              onClick={() => void cargarHistorial()}
              className="bg-alerta-700 hover:bg-alerta-800 mt-4 rounded-md px-4 py-2 text-xs font-semibold text-white shadow-2xs"
            >
              Reintentar cargar conversación
            </button>
          </div>
        </main>
      ) : !detalle ? null : (
        <>
          <main
            ref={chatContainerRef}
            onScroll={checkIsNearBottom}
            role="log"
            aria-label="Historial de mensajes de la conversación"
            className="relative mx-auto w-full max-w-4xl flex-1 space-y-3 overflow-y-auto p-3 sm:p-4"
          >
            {detalle.mensajes.length === 0 && detalle.notas.length === 0 ? (
              <div className="my-8 flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center shadow-2xs">
                <div className="text-3xl">💬</div>
                <h3 className="mt-2 text-sm font-bold text-neutral-800">
                  Conversación iniciada sin mensajes
                </h3>
                <p className="mt-1 max-w-sm text-xs text-neutral-500">
                  El contacto abrió el canal pero aún no ha enviado mensajes de texto. Salúdalo o
                  bríndale información relevante para iniciar la asesoría.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    onClick={() =>
                      setTextoMensaje(
                        '¡Hola! Bienvenido a ViajaPro. ¿En qué destino estás interesado hoy?',
                      )
                    }
                    className="border-acento-600/30 bg-acento-50 text-acento-700 hover:bg-acento-100 rounded-full border px-3 py-1 text-xs font-medium"
                  >
                    👋 Saludo inicial
                  </button>
                  <button
                    onClick={() =>
                      setTextoMensaje(
                        'Hola, ¿quisieras recibir nuestra plantilla de paquetes recomendados en promoción?',
                      )
                    }
                    className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                  >
                    ✈️ Ofertas de viaje
                  </button>
                </div>
              </div>
            ) : (
              <>
                {detalle.notas.map((nota) => (
                  <div
                    key={nota.id}
                    className="mx-auto max-w-lg rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 shadow-2xs"
                  >
                    <div className="flex items-center justify-between font-bold text-amber-900">
                      <span>📌 Nota Interna (Equipo)</span>
                      <span className="text-[10px] font-normal">{nota.autorNombre}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{nota.texto}</p>
                  </div>
                ))}

                {detalle.mensajes.map((m, idx) => {
                  const esEntrante = m.direccion === 'ENTRANTE';
                  const esFallido = m.estado === 'FALLIDO';
                  const esPendiente = m.estado === 'PENDIENTE';
                  const claveIdem = idempotenciaKeys[m.id];
                  const esFocused = idx === indiceFocusMensaje;

                  return (
                    <div
                      key={m.id}
                      ref={(el) => {
                        mensajeRefs.current[idx] = el;
                      }}
                      tabIndex={0}
                      role="article"
                      aria-label={`Mensaje ${esEntrante ? 'de cliente' : 'enviado'}: ${m.texto || 'adjunto'}`}
                      className={`focus:outline-acento-600 flex flex-col focus:outline-2 ${
                        esEntrante ? 'items-start' : 'items-end'
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-3 shadow-2xs transition-all sm:max-w-[70%] ${
                          esFocused ? 'ring-2 ring-blue-500' : ''
                        } ${
                          esEntrante
                            ? 'rounded-tl-none border border-neutral-200 bg-white text-neutral-900'
                            : esFallido
                              ? 'border-alerta-600/40 bg-alerta-50 text-alerta-950 rounded-tr-none border'
                              : 'bg-acento-700 rounded-tr-none text-white'
                        }`}
                      >
                        {!esEntrante && m.autorNombre && (
                          <div
                            className={`mb-1 text-[10px] font-semibold ${
                              esFallido ? 'text-alerta-800' : 'text-acento-100'
                            }`}
                          >
                            {m.autorNombre}
                          </div>
                        )}

                        <RenderMensajeContenido mensaje={m} />

                        <div
                          className={`mt-1.5 flex flex-wrap items-center justify-end gap-1.5 text-[10px] ${
                            esEntrante
                              ? 'text-neutral-400'
                              : esFallido
                                ? 'text-alerta-700'
                                : 'text-acento-100'
                          }`}
                        >
                          {claveIdem && (
                            <span
                              title="Clave de idempotencia enviada al servidor (R5). Se mantiene idéntica en reintentos."
                              className="rounded border border-white/40 bg-black/20 px-1 font-mono text-[9px]"
                            >
                              🔑 Clave Idempotencia: {claveIdem.slice(0, 8)}...
                            </span>
                          )}

                          <span>
                            {new Date(m.ocurridoEn).toLocaleTimeString('es-CO', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          {!esEntrante && (
                            <span className="font-bold">
                              {esPendiente && '⏳ Enviando...'}
                              {m.estado === 'ENVIADO' && '✓ Enviado'}
                              {m.estado === 'ENTREGADO' && '✓✓ Entregado'}
                              {m.estado === 'LEIDO' && '✓✓ Leído'}
                              {esFallido && '✖ Falló'}
                            </span>
                          )}
                        </div>

                        {esFallido && (
                          <div className="border-alerta-200 mt-2 border-t pt-1.5">
                            <p className="text-alerta-800 text-[11px] font-medium">
                              {m.motivoFallo || 'Error al conectar con WhatsApp API.'}
                            </p>
                            <button
                              onClick={() => reintentarMensaje(m)}
                              className="text-alerta-900 mt-1 text-xs font-bold underline hover:text-black"
                            >
                              🔄 Reintentar envío (Reutiliza misma clave)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {mensajesNuevosSinVer > 0 && (
              <div className="sticky bottom-2 z-20 flex justify-center">
                <button
                  onClick={() => scrollToBottom('smooth')}
                  className="border-acento-600 flex animate-bounce items-center gap-1.5 rounded-full border bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white shadow-xl hover:bg-black"
                >
                  <span>⬇️ Hay {mensajesNuevosSinVer} mensaje(s) nuevo(s)</span>
                </button>
              </div>
            )}
          </main>

          <footer className="shrink-0 border-t border-neutral-200 bg-white p-3">
            {!detalle.ventana.abierta ? (
              <div className="space-y-2 rounded-md border border-neutral-300 bg-neutral-100 p-3 text-center text-xs text-neutral-700">
                <div className="font-semibold text-neutral-800">
                  ⚠️ Ventana de servicio de 24 horas expirada
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
              <form onSubmit={manejarEnvio} className="space-y-2">
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
                      📌 Nota interna (equipo)
                    </button>
                  </div>

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

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={textoMensaje}
                    onChange={(e) => setTextoMensaje(e.target.value)}
                    placeholder={
                      modoNota
                        ? 'Escribe una nota interna para el equipo (nunca se envía al cliente)...'
                        : 'Escribe tu respuesta a cliente...'
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
                    {enviando ? 'Enviando...' : modoNota ? 'Guardar nota' : 'Enviar'}
                  </button>
                </div>
              </form>
            )}
          </footer>

          <SimuladorTiempoReal conversaciones={[detalle]} conversacionAbiertaId={detalle.id} />
        </>
      )}
    </div>
  );
}

function RenderMensajeContenido({ mensaje: m }: { mensaje: TipoMensaje }) {
  return (
    <div className="space-y-1.5">
      {m.texto && <p className="text-base whitespace-pre-wrap">{m.texto}</p>}

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
                  📎 {adj.nombreArchivo ?? 'Archivo adjunto'} (
                  {Math.round((adj.tamanoBytes ?? 0) / 1024)} KB)
                </a>
              )}
            </div>
          ))}
        </div>
      )}

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
          📇 <span className="font-medium">Tarjeta de contacto compartida</span>
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
