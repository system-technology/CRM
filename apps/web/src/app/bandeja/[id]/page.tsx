'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type {
  ConversacionDetalle,
  EventoBandeja,
  FichaDeContacto,
  Mensaje,
} from '@viajapro/contracts';
import {
  ArrowLeft,
  Clock,
  Send,
  AlertTriangle,
  RotateCcw,
  Check,
  CheckCheck,
  PlusCircle,
  PanelRight,
} from 'lucide-react';
import { inboxApi, InboxErrorApi } from '../../../lib/inbox-api';
import { realtimeMockBus } from '../../../lib/realtime-mock';
import { obtenerMockFichaDeContacto } from '../../../lib/mock-crm';
import {
  calcularTiempoRestanteVentana,
  claveDeReintento,
  debeBajarElScroll,
  generarColorAvatar,
  obtenerIniciales,
} from '../../../lib/bandeja-logica';
import { FichaCliente } from '../../../components/bandeja/ficha-cliente';
import { ModalPlantillas, PlantillaHSM } from '../../../components/bandeja/modal-plantillas';
import { TarjetaCotizacion } from '../../../components/bandeja/tarjeta-cotizacion';

export default function BandejaConversacionPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [fichaContacto, setFichaContacto] = useState<FichaDeContacto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  // Redacción y envío
  const [textoMensaje, setTextoMensaje] = useState('');
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Modal de plantillas Meta HSM
  const [modalPlantillasAbierto, setModalPlantillasAbierto] = useState(false);

  // Panel lateral de ficha del viajero en pantallas medianas / pequeñas
  const [mostrarFichaLateral, setMostrarFichaLateral] = useState(false);

  // Atajos de teclado

  // Control de scroll y avisos de mensajes nuevos
  const chatContainerRef = useRef<HTMLElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [mensajesNuevosSinVer, setMensajesNuevosSinVer] = useState(0);

  // Mapa de claves de idempotencia para garantizar R5
  const idempotenciaMapRef = useRef<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mensajeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Tiempo restante de la ventana de 24h
  const [tiempoVentana, setTiempoVentana] = useState<{
    minutos: number;
    horas: number;
    cerrada: boolean;
    texto: string;
  }>({ minutos: 0, horas: 0, cerrada: false, texto: '' });

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior,
      });
      setMensajesNuevosSinVer(0);
      setIsNearBottom(true);
    }
  }, []);

  const checkIsNearBottom = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    const near = debeBajarElScroll(distanceToBottom, 100);
    setIsNearBottom(near);
    if (near) {
      setMensajesNuevosSinVer(0);
    }
  };

  // Cargar historial de conversación
  const cargarHistorial = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setErrorHistorial(null);
    try {
      const data = await inboxApi.obtenerConversacionDetalle(id);
      if (!data) {
        setErrorHistorial('No se encontró la conversación solicitada.');
        setDetalle(null);
      } else {
        setDetalle(data);
        setFichaContacto(obtenerMockFichaDeContacto(data.id));
        setTiempoVentana(calcularTiempoRestanteVentana(data.ventana.expiraEn));
        setTimeout(() => scrollToBottom('auto'), 50);
      }
    } catch (e) {
      if (e instanceof InboxErrorApi) {
        setErrorHistorial(`[${e.code}] ${e.message}`);
      } else {
        setErrorHistorial(e instanceof Error ? e.message : 'Error al cargar la conversación');
      }
    } finally {
      setCargando(false);
    }
  }, [id, scrollToBottom]);

  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  // Recalcular tiempo de ventana cada minuto
  useEffect(() => {
    const timer = setInterval(() => {
      if (detalle?.ventana?.expiraEn) {
        setTiempoVentana(calcularTiempoRestanteVentana(detalle.ventana.expiraEn));
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [detalle?.ventana?.expiraEn]);

  // Suscripción a eventos en tiempo real para esta conversación
  useEffect(() => {
    if (!id) return;
    const unsubscribe = realtimeMockBus.subscribe((evento: EventoBandeja) => {
      if (evento.tipo === 'MENSAJE_NUEVO' && evento.conversacionId === id) {
        setDetalle((prev) => {
          if (!prev) return prev;
          if (prev.mensajes.some((m) => m.id === evento.mensaje.id)) return prev;
          return {
            ...prev,
            mensajes: [...prev.mensajes, evento.mensaje],
            ultimoMensajeTexto: evento.mensaje.texto || 'Archivo adjunto',
            ultimoMensajeEn: evento.mensaje.ocurridoEn,
            ultimoMensajeDireccion: evento.mensaje.direccion,
          };
        });

        if (isNearBottom) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        } else {
          setMensajesNuevosSinVer((prev) => prev + 1);
        }
      } else if (evento.tipo === 'MENSAJE_ACTUALIZADO' && evento.conversacionId === id) {
        setDetalle((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            mensajes: prev.mensajes.map((m) =>
              m.id === evento.mensajeId
                ? {
                    ...m,
                    estado: evento.estado,
                    motivoFallo: evento.motivoFallo ?? null,
                  }
                : m,
            ),
          };
        });
      }
    });

    return () => unsubscribe();
  }, [id, isNearBottom, scrollToBottom]);

  // Manejar envío de mensaje o nota interna
  const manejarEnvio = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!detalle || !textoMensaje.trim() || enviando) return;

    const texto = textoMensaje.trim();
    setTextoMensaje('');
    setErrorEnvio(null);
    setEnviando(true);

    if (modoNota) {
      try {
        const notaCreada = await inboxApi.crearNota({
          conversacionId: detalle.id,
          texto,
        });
        setDetalle((prev) => (prev ? { ...prev, notas: [...prev.notas, notaCreada] } : null));
        setTimeout(() => scrollToBottom('smooth'), 50);
      } catch (err) {
        setErrorEnvio(err instanceof Error ? err.message : 'Error al guardar nota interna');
      } finally {
        setEnviando(false);
      }
      return;
    }

    // Envío de mensaje regular con optimismo y regla R5
    const tempId = crypto.randomUUID();
    const { clave: claveIdem } = claveDeReintento(idempotenciaMapRef.current, tempId);

    const mensajeOptimista: Mensaje = {
      id: tempId,
      conversacionId: detalle.id,
      direccion: 'SALIENTE',
      tipo: 'TEXTO',
      texto,
      adjuntos: [],
      estado: 'PENDIENTE',
      motivoFallo: null,
      autorId: '00000000-0000-4000-8000-000000000001',
      autorNombre: 'Carlos Asesor',
      ocurridoEn: new Date().toISOString(),
      cotizacionId: null,
    };

    setDetalle((prev) =>
      prev ? { ...prev, mensajes: [...prev.mensajes, mensajeOptimista] } : null,
    );
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      const enviado = await inboxApi.enviarTexto({
        conversacionId: detalle.id,
        texto,
        claveIdempotencia: claveIdem,
      });

      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((m) => (m.id === tempId ? enviado : m)),
        };
      });
    } catch (err) {
      const msgError = err instanceof Error ? err.message : 'Error al enviar mensaje por Meta API';
      setErrorEnvio(msgError);
      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((m) =>
            m.id === tempId ? { ...m, estado: 'FALLIDO', motivoFallo: msgError } : m,
          ),
        };
      });
    } finally {
      setEnviando(false);
    }
  };

  const reintentarMensaje = async (m: Mensaje) => {
    if (!detalle) return;
    const { clave: claveIdem } = claveDeReintento(idempotenciaMapRef.current, m.id);

    setDetalle((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        mensajes: prev.mensajes.map((msg) =>
          msg.id === m.id ? { ...msg, estado: 'PENDIENTE', motivoFallo: null } : msg,
        ),
      };
    });

    try {
      const res = await inboxApi.enviarTexto({
        conversacionId: detalle.id,
        texto: m.texto || '',
        claveIdempotencia: claveIdem,
      });

      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((msg) => (msg.id === m.id ? res : msg)),
        };
      });
    } catch (err) {
      const msgError = err instanceof Error ? err.message : 'Fallo en reintento';
      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((msg) =>
            msg.id === m.id ? { ...msg, estado: 'FALLIDO', motivoFallo: msgError } : msg,
          ),
        };
      });
    }
  };

  const manejarEnvioPlantilla = (plantilla: PlantillaHSM) => {
    setTextoMensaje(plantilla.texto);
    setModoNota(false);
    setTimeout(() => {
      void manejarEnvio();
    }, 50);
  };

  if (cargando) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-neutral-400">
        <div className="border-acento-600 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"></div>
        <p className="mt-3 text-xs">Cargando conversación...</p>
      </div>
    );
  }

  if (errorHistorial || !detalle) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="text-alerta-600 h-8 w-8" />
        <h3 className="mt-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">
          No se pudo cargar la conversación
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          {errorHistorial || 'Conversación no encontrada'}
        </p>
        <button
          onClick={() => void cargarHistorial()}
          className="bg-acento-700 hover:bg-acento-800 mt-4 rounded-lg px-4 py-1.5 text-xs font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const avatarColores = generarColorAvatar(detalle.contactoId);
  const iniciales = obtenerIniciales(detalle.contactoNombre, detalle.contactoTelefono);

  return (
    <div className="flex h-full w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      {/* Columna Central: Conversación (Chat) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-900">
        {/* Cabecera de la conversación (Tarea 0b.6) */}
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-3">
            {/* Botón volver a lista (móvil) */}
            <Link
              href="/bandeja"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
              title="Volver a lista de conversaciones"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* Avatar determinista */}
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColores.bg} ${avatarColores.text}`}
            >
              {iniciales}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  {detalle.contactoNombre || detalle.contactoTelefono}
                </h2>
                <span className="cifra text-[11px] text-neutral-400">
                  {detalle.contactoTelefono}
                </span>
              </div>
              <p className="text-[10px] text-neutral-400">
                {detalle.asignadoANombre ? `Asignado a: ${detalle.asignadoANombre}` : 'Sin asignar'}
              </p>
            </div>
          </div>

          {/* Estado de 24h + SLA + Acción Primaria «Nueva Cotización» */}
          <div className="flex items-center gap-2">
            {/* Cuenta atrás viva de 24h */}
            {tiempoVentana.cerrada ? (
              <span className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                <Clock className="h-3 w-3 text-neutral-400" />
                <span>24h Cerrada</span>
              </span>
            ) : (
              <span
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                  tiempoVentana.minutos <= 120
                    ? 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-ok-50 text-ok-800 border-ok-200 dark:bg-ok-950/40 dark:text-ok-300 dark:border-ok-900 border'
                }`}
              >
                <Clock className="h-3 w-3" />
                <span>Ventana 24h · {tiempoVentana.texto}</span>
              </span>
            )}

            {/* SLA Badge */}
            {detalle.slaVenceEn && (
              <span className="bg-alerta-50 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-300 rounded-md px-2 py-1 text-[11px] font-semibold">
                SLA Activo
              </span>
            )}

            {/* Acción Primaria Prominente: Nueva Cotización */}
            <Link
              href="/cotizador"
              className="bg-acento-700 hover:bg-acento-800 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-2xs"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva cotización</span>
            </Link>

            {/* Alternar Ficha del Viajero (< xl) */}
            <button
              type="button"
              onClick={() => setMostrarFichaLateral((p) => !p)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 xl:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              title="Ver ficha del viajero"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Historial de Mensajes: único contenedor con scroll propio */}
        <main
          ref={chatContainerRef}
          onScroll={checkIsNearBottom}
          role="log"
          aria-label="Historial de mensajes"
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        >
          {/* Notas internas del CRM */}
          {detalle.notas.map((nota) => (
            <div
              key={nota.id}
              className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                <span>📌 Nota Interna (Equipo)</span>
                <span className="text-[10px] font-normal">{nota.autorNombre}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{nota.texto}</p>
            </div>
          ))}

          {/* Burbujas de mensajes */}
          {detalle.mensajes.map((m, idx) => {
            const esEntrante = m.direccion === 'ENTRANTE';
            const esFallido = m.estado === 'FALLIDO';
            const esPendiente = m.estado === 'PENDIENTE';

            return (
              <div
                key={m.id}
                ref={(el) => {
                  mensajeRefs.current[idx] = el;
                }}
                className={`flex flex-col ${esEntrante ? 'items-start' : 'items-end'}`}
              >
                {/* Renderizado de tarjeta de cotización si tiene referencia */}
                {m.cotizacionId ? (
                  <TarjetaCotizacion
                    id={m.cotizacionId}
                    titulo="Paquete Turístico Cancún Todo Incluido"
                    destino="Cancún, México"
                    unidades="1250000000"
                    moneda="COP"
                    vigenteHasta="2026-10-20"
                    version={1}
                  />
                ) : (
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-2xs sm:max-w-[70%] ${
                      esEntrante
                        ? 'rounded-tl-xs border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                        : esFallido
                          ? 'border-alerta-300 bg-alerta-50 text-alerta-950 dark:border-alerta-800 dark:bg-alerta-950/60 dark:text-alerta-200 rounded-tr-xs border'
                          : 'bg-acento-700 rounded-tr-xs text-white'
                    }`}
                  >
                    {!esEntrante && m.autorNombre && (
                      <div className="text-acento-100 mb-1 text-[10px] font-semibold opacity-80">
                        {m.autorNombre}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{m.texto}</p>

                    <div
                      className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] ${
                        esEntrante
                          ? 'text-neutral-400'
                          : esFallido
                            ? 'text-alerta-700 dark:text-alerta-300'
                            : 'text-acento-100'
                      }`}
                    >
                      <span>
                        {new Date(m.ocurridoEn).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {!esEntrante && (
                        <span>
                          {esPendiente && '⏳'}
                          {m.estado === 'ENVIADO' && <Check className="inline h-3 w-3" />}
                          {m.estado === 'ENTREGADO' && (
                            <CheckCheck className="inline h-3 w-3 text-neutral-300" />
                          )}
                          {m.estado === 'LEIDO' && (
                            <CheckCheck className="inline h-3 w-3 text-cyan-300" />
                          )}
                          {esFallido && '✖ Falló'}
                        </span>
                      )}
                    </div>

                    {esFallido && (
                      <div className="border-alerta-200 dark:border-alerta-900 mt-2 border-t pt-1.5">
                        <p className="text-alerta-800 dark:text-alerta-300 text-[11px] font-medium">
                          {m.motivoFallo || 'Error al conectar con WhatsApp API.'}
                        </p>
                        <button
                          onClick={() => void reintentarMensaje(m)}
                          className="mt-1 flex items-center gap-1 font-bold underline hover:text-black dark:hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reintentar envío (Clave R5)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {mensajesNuevosSinVer > 0 && (
            <div className="sticky bottom-2 z-20 flex justify-center">
              <button
                onClick={() => scrollToBottom('smooth')}
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white shadow-xl hover:bg-black"
              >
                <span>⬇️ Hay {mensajesNuevosSinVer} mensaje(s) nuevo(s)</span>
              </button>
            </div>
          )}
        </main>

        {/* Pie de redacción */}
        <footer className="shrink-0 border-t border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          {!detalle.ventana.abierta ? (
            <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-center text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                ⚠️ Ventana de 24 horas cerrada
              </p>
              <p className="text-neutral-500 dark:text-neutral-400">
                Solo es posible reanudar la conversación mediante una plantilla aprobada por Meta.
              </p>
              <button
                type="button"
                onClick={() => setModalPlantillasAbierto(true)}
                className="bg-acento-700 hover:bg-acento-800 rounded-lg px-4 py-2 font-semibold text-white shadow-sm"
              >
                Seleccionar plantilla aprobada
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void manejarEnvio(e)} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => setModoNota(false)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      !modoNota
                        ? 'bg-white font-semibold text-neutral-900 shadow-2xs dark:bg-neutral-700 dark:text-neutral-100'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400'
                    }`}
                  >
                    💬 Mensaje
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoNota(true)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      modoNota
                        ? 'bg-amber-400 font-bold text-amber-950 shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400'
                    }`}
                  >
                    📌 Nota interna
                  </button>
                </div>
              </div>

              {errorEnvio && (
                <div className="border-alerta-200 bg-alerta-50 text-alerta-800 dark:border-alerta-900 dark:bg-alerta-950/40 dark:text-alerta-300 rounded-lg border p-2 text-xs">
                  {errorEnvio}
                </div>
              )}

              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={textoMensaje}
                  onChange={(e) => setTextoMensaje(e.target.value)}
                  placeholder={
                    modoNota
                      ? 'Escribe una nota interna para el equipo (nunca se envía al cliente)...'
                      : 'Escribe tu respuesta a cliente...'
                  }
                  className={`flex-1 rounded-lg border p-2.5 text-xs focus:outline-none ${
                    modoNota
                      ? 'border-amber-300 bg-amber-50/50 focus:border-amber-500 dark:border-amber-900/60 dark:bg-amber-950/20'
                      : 'focus:border-acento-600 border-neutral-200 bg-neutral-50 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                  }`}
                />
                <button
                  type="submit"
                  disabled={enviando || !textoMensaje.trim()}
                  className={`self-end rounded-lg px-4 py-2.5 text-xs font-semibold text-white shadow-2xs disabled:opacity-50 ${
                    modoNota
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-acento-700 hover:bg-acento-800'
                  }`}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </form>
          )}
        </footer>
      </div>

      {/* Columna Derecha: Ficha del Viajero permanente en pantallas xl */}
      {fichaContacto && (
        <aside className="hidden w-[340px] shrink-0 border-l border-neutral-200 xl:block dark:border-neutral-800">
          <FichaCliente ficha={fichaContacto} />
        </aside>
      )}

      {/* Ficha lateral como Drawer en pantallas medianas (< xl) */}
      {mostrarFichaLateral && fichaContacto && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40 xl:hidden"
          onClick={() => setMostrarFichaLateral(false)}
        >
          <div
            className="w-full max-w-sm bg-white shadow-2xl dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <FichaCliente ficha={fichaContacto} onCerrar={() => setMostrarFichaLateral(false)} />
          </div>
        </div>
      )}

      {/* Modal de Plantillas HSM */}
      <ModalPlantillas
        abierto={modalPlantillasAbierto}
        onCerrar={() => setModalPlantillasAbierto(false)}
        onSeleccionarPlantilla={manejarEnvioPlantilla}
      />
    </div>
  );
}
