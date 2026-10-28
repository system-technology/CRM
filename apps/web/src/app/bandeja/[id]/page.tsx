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
  UserPlus,
  UserMinus,
  UserCheck,
  Clock,
  Send,
  AlertTriangle,
  RotateCcw,
  Check,
  CheckCheck,
  Lock,
  PlusCircle,
  PanelRight,
  Sparkles,
  FileText,
} from 'lucide-react';
import { inboxApi } from '../../../lib/inbox-api';
import { useInboxSocket } from '../../../lib/inbox-socket';
import { usePermisos } from '../../../lib/permisos';
import { ModalReasignar } from '../../../components/bandeja/modal-reasignar';
import { obtenerFichaDeContacto } from '../../../lib/crm-api';
import { EsqueletoConversacion, AvisoErrorAccionable } from '../../../components/comun/esqueletos';
import {
  construirMensajeErrorAccionable,
  formatearErrorAmigable,
} from '../../../lib/estados-ui-logica';
import {
  calcularTiempoRestanteVentana,
  calcularPermisosAsignacion,
  claveDeReintento,
  debeBajarElScroll,
  evaluarTransicionVentanaBorrador,
  type AvisoBorradorVentana,
  generarColorAvatar,
  obtenerIniciales,
} from '../../../lib/bandeja-logica';
import { FichaCliente } from '../../../components/bandeja/ficha-cliente';
import { ModalPlantillas } from '../../../components/bandeja/modal-plantillas';
import { EnviarPlantilla } from '@viajapro/contracts';
import { TarjetaCotizacion } from '../../../components/bandeja/tarjeta-cotizacion';
import { PanelSugerencias } from '../../../components/bandeja/panel-sugerencias';
import { ModalEnviarCotizacion } from '../../../components/bandeja/modal-enviar-cotizacion';
import { ModalCrearOportunidad } from '../../../components/bandeja/modal-crear-oportunidad';
import { ModalEditarContacto } from '../../../components/bandeja/modal-editar-contacto';

export default function BandejaConversacionPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  const [detalle, setDetalle] = useState<ConversacionDetalle | null>(null);
  const [fichaContacto, setFichaContacto] = useState<FichaDeContacto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  // Redacción y envío
  const [textoMensaje, setTextoMensaje] = useState('');
  const [avisoBorrador, setAvisoBorrador] = useState<AvisoBorradorVentana>({
    debeMostrar: false,
    mensaje: '',
    borrador: '',
  });
  const ventanaPreviaRef = useRef<boolean>(true);

  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Modal de plantillas Meta HSM
  const [modalPlantillasAbierto, setModalPlantillasAbierto] = useState(false);

  // Panel lateral de ficha del viajero en pantallas medianas / pequeñas
  const [mostrarFichaLateral, setMostrarFichaLateral] = useState(false);

  // Asistente de Sugerencias (reglas)
  const [sugerenciasAbierto, setSugerenciasAbierto] = useState(false);

  // Estado de conversación retirada (0c.35)
  const [conversacionRetirada, setConversacionRetirada] = useState(false);
  const [modalReasignarAbierto, setModalReasignarAbierto] = useState(false);
  const [asignando, setAsignando] = useState(false);

  // Modales de Cotización y CRM (T-074, T-076)
  const [modalEnviarCotizacionAbierto, setModalEnviarCotizacionAbierto] = useState(false);
  const [modalCrearOportunidadAbierto, setModalCrearOportunidadAbierto] = useState(false);
  const [modalEditarContactoAbierto, setModalEditarContactoAbierto] = useState(false);

  // Permisos de sesión para visibilidad y asignación (0c.35)
  const { sesion, puedeVerTodasConversaciones } = usePermisos();
  const miUsuarioId = sesion?.acceso?.usuarioId ?? null;
  const permisosAsignacion = calcularPermisosAsignacion(
    detalle,
    miUsuarioId,
    puedeVerTodasConversaciones,
  );

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

  // Evaluar cierre de ventana con borrador (0c.19)
  useEffect(() => {
    if (!detalle) return;
    const ventanaEstaAbierta = detalle.ventana.abierta && !tiempoVentana.cerrada;
    const previa = ventanaPreviaRef.current;

    const evaluacion = evaluarTransicionVentanaBorrador(previa, ventanaEstaAbierta, textoMensaje);
    if (evaluacion.debeMostrar) {
      setAvisoBorrador(evaluacion);
    } else if (ventanaEstaAbierta || textoMensaje.trim().length === 0) {
      setAvisoBorrador({ debeMostrar: false, mensaje: '', borrador: '' });
    }

    ventanaPreviaRef.current = ventanaEstaAbierta;
  }, [detalle?.ventana?.abierta, tiempoVentana.cerrada, textoMensaje]);

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
        if (!data.ventana.abierta) {
          setTextoMensaje(
            'Estimado cliente, le comparto los detalles del paquete turístico para su confirmación.',
          );
        }
        const ficha = await obtenerFichaDeContacto(data.contactoId ?? data.id);
        setFichaContacto(ficha);
        setTiempoVentana(calcularTiempoRestanteVentana(data.ventana.expiraEn));
        setTimeout(() => scrollToBottom('auto'), 50);
      }
    } catch (e) {
      console.error('[bandeja] Error al cargar historial:', e);
      setErrorHistorial(
        formatearErrorAmigable(e, 'No se pudo cargar el historial de la conversación.'),
      );
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

  // Suscripción a eventos en tiempo real y reconexión REST (0c.35)
  useInboxSocket({
    onEvento: (evento: EventoBandeja) => {
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
      } else if (evento.tipo === 'CONVERSACION_ACTUALIZADA' && evento.conversacion.id === id) {
        setDetalle((prev) => (prev ? { ...prev, ...evento.conversacion } : prev));
      } else if (evento.tipo === 'CONVERSACION_RETIRADA' && evento.conversacionId === id) {
        // Conversación retirada del asesor: se avisa y bloquea sin perder borrador (0c.35)
        setConversacionRetirada(true);
      }
    },
    onReconexion: () => {
      // Re-consultar historial en reconexión porque los eventos perdidos no se reenvían (0c.35)
      void cargarHistorial();
    },
  });

  // Manejadores de asignación («Tomar», «Soltar», «Reasignar») (0c.35)
  const manejarTomar = async () => {
    if (!detalle || asignando) return;
    setAsignando(true);
    try {
      const res = await inboxApi.asignarConversacion({
        conversacionId: detalle.id,
        usuarioId: miUsuarioId ?? '00000000-0000-4000-a000-000000000001',
      });
      setDetalle((prev) =>
        prev
          ? {
              ...prev,
              asignadoAId: res.asignadoAId,
              asignadoANombre: res.asignadoANombre ?? sesion?.identidad.nombre ?? 'Asignado',
            }
          : prev,
      );
    } catch (e) {
      console.error('Error al tomar conversación:', e);
    } finally {
      setAsignando(false);
    }
  };

  const manejarSoltar = async () => {
    if (!detalle || asignando) return;
    setAsignando(true);
    try {
      await inboxApi.asignarConversacion({
        conversacionId: detalle.id,
        usuarioId: null,
      });
      setDetalle((prev) =>
        prev
          ? {
              ...prev,
              asignadoAId: null,
              asignadoANombre: null,
            }
          : prev,
      );
    } catch (e) {
      console.error('Error al soltar conversación:', e);
    } finally {
      setAsignando(false);
    }
  };

  const manejarReasignar = async (nuevoUsuarioId: string | null) => {
    if (!detalle) return;
    setAsignando(true);
    try {
      const resAsignada = await inboxApi.asignarConversacion({
        conversacionId: detalle.id,
        usuarioId: nuevoUsuarioId,
      });
      if (
        !puedeVerTodasConversaciones &&
        nuevoUsuarioId !== miUsuarioId &&
        nuevoUsuarioId !== null
      ) {
        setConversacionRetirada(true);
      } else {
        setDetalle((prev) =>
          prev
            ? {
                ...prev,
                asignadoAId: resAsignada.asignadoAId,
                asignadoANombre: resAsignada.asignadoANombre,
              }
            : prev,
        );
      }
    } finally {
      setAsignando(false);
    }
  };

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
        setErrorEnvio(
          formatearErrorAmigable(err, 'No fue posible guardar la nota interna en este momento.'),
        );
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
      const msgError = formatearErrorAmigable(
        err,
        'No fue posible enviar el mensaje a través de Meta.',
      );
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
      const msgError = formatearErrorAmigable(err, 'No fue posible reintentar el envío.');
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

  const manejarEnvioPlantilla = async (envio: EnviarPlantilla, textoInterpolado: string) => {
    try {
      setEnviando(true);
      const mensajeEnviado = await inboxApi.enviarTexto({
        conversacionId: envio.conversacionId,
        texto: textoInterpolado,
        claveIdempotencia: envio.claveIdempotencia,
      });

      setDetalle((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          mensajes: [...prev.mensajes, mensajeEnviado],
          ultimoMensajeTexto: textoInterpolado,
          ultimoMensajeEn: mensajeEnviado.ocurridoEn,
          ultimoMensajeDireccion: 'SALIENTE',
          ventana: {
            abierta: true,
            expiraEn: new Date(Date.now() + 24 * 3600000).toISOString(),
            minutosRestantes: 1440,
          },
        };
      });

      setTiempoVentana({
        minutos: 1440,
        horas: 24,
        cerrada: false,
        texto: '24 h 0 min',
      });

      setTextoMensaje('');
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (e) {
      console.error('Error al enviar plantilla:', e);
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) {
    return <EsqueletoConversacion />;
  }

  if (errorHistorial || !detalle) {
    const errorDetallado = construirMensajeErrorAccionable(
      errorHistorial || 'Conversación no encontrada',
      'BANDEJA_CONVERSACION',
    );
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <AvisoErrorAccionable error={errorDetallado} onReintentar={() => void cargarHistorial()} />
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
        <header className="flex min-w-0 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-2.5 py-2 sm:px-4 sm:py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Botón volver a lista (móvil) */}
            <Link
              href="/bandeja"
              className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
              title="Volver a lista de conversaciones"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* Avatar determinista */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-9 sm:w-9 ${avatarColores.bg} ${avatarColores.text}`}
            >
              {iniciales}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  {detalle.contactoNombre || detalle.contactoTelefono}
                </h2>
                <span className="cifra hidden text-[11px] text-neutral-400 sm:inline">
                  {detalle.contactoTelefono}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-[10px] text-neutral-400">
                  {detalle.asignadoANombre
                    ? `Asignado a: ${detalle.asignadoANombre}`
                    : 'Sin asignar'}
                </p>
                {/* Botones de Asignación (0c.35) */}
                {permisosAsignacion.puedeTomar && (
                  <button
                    type="button"
                    onClick={() => void manejarTomar()}
                    disabled={asignando || conversacionRetirada}
                    data-testid="boton-tomar"
                    className="bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950/40 dark:text-primary-300 flex min-h-[44px] items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold disabled:opacity-50 md:min-h-[28px]"
                    title="Asignarme esta conversación"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>Tomar</span>
                  </button>
                )}
                {permisosAsignacion.puedeSoltar && (
                  <button
                    type="button"
                    onClick={() => void manejarSoltar()}
                    disabled={asignando || conversacionRetirada}
                    data-testid="boton-soltar"
                    className="flex min-h-[44px] items-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 md:min-h-[28px] dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="Devolver a la cola común"
                  >
                    <UserMinus className="h-3 w-3" />
                    <span>Soltar</span>
                  </button>
                )}
                {permisosAsignacion.puedeReasignar && (
                  <button
                    type="button"
                    onClick={() => setModalReasignarAbierto(true)}
                    disabled={asignando || conversacionRetirada}
                    data-testid="boton-reasignar"
                    className="flex min-h-[44px] items-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 md:min-h-[28px] dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title="Reasignar a otro asesor de la agencia"
                  >
                    <UserCheck className="h-3 w-3" />
                    <span>Reasignar</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Estado de 24h + SLA + Acción Primaria «Nueva Cotización» */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Cuenta atrás viva de 24h */}
            {tiempoVentana.cerrada ? (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-1 text-[10px] font-semibold text-neutral-600 sm:text-[11px] dark:bg-neutral-800 dark:text-neutral-400">
                <Clock className="h-3 w-3 text-neutral-400" />
                <span className="hidden sm:inline">24h </span>
                <span>Cerrada</span>
              </span>
            ) : (
              <span
                className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold sm:text-[11px] ${
                  tiempoVentana.minutos <= 120
                    ? 'border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
                    : 'bg-ok-50 text-ok-800 border-ok-200 dark:bg-ok-950/40 dark:text-ok-300 dark:border-ok-900 border'
                }`}
              >
                <Clock className="h-3 w-3" />
                <span className="hidden sm:inline">Ventana 24h · </span>
                <span>{tiempoVentana.texto}</span>
              </span>
            )}

            {/* SLA Badge (visible a partir de sm) */}
            {detalle.slaVenceEn && (
              <span className="bg-alerta-50 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-300 hidden shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold sm:inline-flex">
                SLA Activo
              </span>
            )}

            {/* Acción Primaria Prominente: Nueva Cotización */}
            <Link
              href={`/cotizador?conversacion=${id}&contactoId=${detalle.contactoId}`}
              className="bg-acento-700 hover:bg-acento-800 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold text-white shadow-2xs sm:px-3.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nueva cotización</span>
            </Link>

            {/* Alternar Ficha del Viajero (< xl) */}
            <button
              type="button"
              onClick={() => setMostrarFichaLateral((p) => !p)}
              className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-100 xl:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              title="Ver ficha del viajero"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Aviso de conversación retirada sin perder borrador (0c.35) */}
        {conversacionRetirada && (
          <div
            role="alert"
            data-testid="aviso-conversacion-retirada"
            className="flex shrink-0 items-center justify-between border-b border-amber-300 bg-amber-100 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Esta conversación se asignó a otra persona</p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Ya no tienes acceso para enviar mensajes. Tu borrador sigue aquí para que no
                  pierdas lo que escribiste.
                </p>
              </div>
            </div>
            <Link
              href="/bandeja"
              className="flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-200 px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100"
            >
              Ir a mi bandeja
            </Link>
          </div>
        )}

        {/* Historial de Mensajes: único contenedor con scroll propio */}
        {/* Banner de advertencia si la ventana está por cerrar (<2h) */}
        {tiempoVentana.minutos <= 120 && !tiempoVentana.cerrada && (
          <div className="flex shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Ventana de Meta por cerrar: </strong>
                Quedan {tiempoVentana.texto}. Envía tu respuesta ahora o la reapertura exigirá una
                plantilla aprobada.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setModalPlantillasAbierto(true)}
              className="text-[11px] font-semibold underline hover:text-amber-950 dark:hover:text-amber-100"
            >
              Ver plantillas
            </button>
          </div>
        )}

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
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-xs font-bold text-white shadow-xl hover:bg-black"
              >
                <span>⬇️ Hay {mensajesNuevosSinVer} mensaje(s) nuevo(s)</span>
              </button>
            </div>
          )}
        </main>

        {/* Pie de redacción */}
        <footer className="min-w-0 shrink-0 border-t border-neutral-200 bg-white p-3 pb-24 md:pb-3 dark:border-neutral-800 dark:bg-neutral-900">
          {!detalle.ventana.abierta || tiempoVentana.cerrada ? (
            <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex items-center justify-center space-x-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
                <Lock className="h-4 w-4 text-neutral-500" />
                <span>Ventana de 24 horas cerrada por Meta</span>
              </div>
              <p className="text-center text-neutral-500 dark:text-neutral-400">
                No es posible enviar mensajes de texto libre pasadas 24 horas desde el último
                mensaje del viajero. Utiliza una plantilla HSM aprobada.
              </p>

              {/* Aviso visible de borrador preservado con aria-live (0c.19) */}
              {(avisoBorrador.debeMostrar || textoMensaje.trim().length > 0) && (
                <div
                  aria-live="polite"
                  className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-amber-950 dark:text-amber-100">
                        La ventana se cerró; tu borrador sigue aquí
                      </p>
                      <p className="mt-1 line-clamp-2 rounded bg-amber-100/70 p-1.5 text-[11px] text-amber-800 italic dark:bg-amber-900/40 dark:text-amber-300">
                        «{textoMensaje.trim()}»
                      </p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex w-full sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setModalPlantillasAbierto(true)}
                      className="flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs transition-colors hover:bg-amber-700 sm:w-auto"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Usar borrador en plantilla
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setModalPlantillasAbierto(true)}
                  className="bg-acento-700 hover:bg-acento-800 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-4 py-2 font-semibold text-white shadow-sm transition-colors"
                >
                  Seleccionar plantilla aprobada
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {sugerenciasAbierto && (
                <PanelSugerencias
                  mensajes={detalle.mensajes.map((m) => ({
                    texto: m.texto || '',
                    direccion: m.direccion,
                  }))}
                  contactoNombre={detalle.contactoNombre || 'Viajero'}
                  onInsertarRespuesta={(texto) => {
                    setTextoMensaje(texto);
                    textareaRef.current?.focus();
                  }}
                  onCerrar={() => setSugerenciasAbierto(false)}
                />
              )}

              <form onSubmit={(e) => void manejarEnvio(e)} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
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

                    <button
                      type="button"
                      onClick={() => setSugerenciasAbierto((p) => !p)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        sugerenciasAbierto
                          ? 'border-purple-300 bg-purple-100 text-purple-900 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200'
                          : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300'
                      }`}
                      title="Abrir Asistente de Cotización (reglas)"
                      aria-label="Abrir Asistente de Cotización (reglas)"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Sugerencias</span>
                    </button>

                    <button
                      type="button"
                      data-testid="boton-abrir-enviar-cotizacion"
                      onClick={() => setModalEnviarCotizacionAbierto(true)}
                      disabled={conversacionRetirada}
                      className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      title="Enviar cotización por WhatsApp (T-074)"
                      aria-label="Enviar cotización por WhatsApp"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Enviar cotización</span>
                    </button>
                  </div>
                </div>

                {errorEnvio && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="border-alerta-200 bg-alerta-50 text-alerta-800 dark:border-alerta-900 dark:bg-alerta-950/40 dark:text-alerta-300 rounded-lg border p-2 text-xs"
                  >
                    {errorEnvio}
                  </div>
                )}

                <div className="flex gap-2">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={textoMensaje}
                    onChange={(e) => setTextoMensaje(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void manejarEnvio();
                      }
                    }}
                    placeholder={
                      modoNota
                        ? 'Escribe una nota interna para el equipo (nunca se envía al cliente)...'
                        : 'Escribe tu respuesta a cliente...'
                    }
                    disabled={enviando || conversacionRetirada}
                    className={`flex-1 rounded-lg border p-2.5 text-xs focus:outline-none ${
                      modoNota
                        ? 'border-amber-300 bg-amber-50/50 focus:border-amber-500 dark:border-amber-900/60 dark:bg-amber-950/20'
                        : 'focus:border-acento-600 border-neutral-200 bg-neutral-50 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={enviando || conversacionRetirada || !textoMensaje.trim()}
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
            </div>
          )}
        </footer>
      </div>

      {/* Columna Derecha: Ficha del Viajero permanente en pantallas xl */}
      {fichaContacto && (
        <aside className="hidden w-[340px] shrink-0 border-l border-neutral-200 xl:block dark:border-neutral-800">
          <FichaCliente
            ficha={fichaContacto}
            onEditarContacto={() => setModalEditarContactoAbierto(true)}
            onCrearOportunidad={() => setModalCrearOportunidadAbierto(true)}
          />
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
            <FichaCliente
              ficha={fichaContacto}
              onCerrar={() => setMostrarFichaLateral(false)}
              onEditarContacto={() => setModalEditarContactoAbierto(true)}
              onCrearOportunidad={() => setModalCrearOportunidadAbierto(true)}
            />
          </div>
        </div>
      )}

      {/* Modal de Reasignar */}
      <ModalReasignar
        abierto={modalReasignarAbierto}
        conversacionId={id}
        asignadoActualId={detalle.asignadoAId}
        onCerrar={() => setModalReasignarAbierto(false)}
        onReasignar={manejarReasignar}
      />

      {/* Modal de Plantillas HSM */}
      <ModalPlantillas
        abierto={modalPlantillasAbierto}
        conversacionId={id}
        borradorPrevio={textoMensaje}
        onCerrar={() => setModalPlantillasAbierto(false)}
        onEnviarPlantilla={(envio, texto) => {
          void manejarEnvioPlantilla(envio, texto);
        }}
      />

      {/* Modal Enviar Cotización por WhatsApp (T-074) */}
      {modalEnviarCotizacionAbierto && detalle && (
        <ModalEnviarCotizacion
          conversacionId={detalle.id}
          contactoNombre={detalle.contactoNombre}
          contactoTelefono={detalle.contactoTelefono}
          ventanaAbierta={detalle.ventana.abierta && !tiempoVentana.cerrada}
          cotizaciones={fichaContacto?.cotizaciones ?? []}
          onCerrar={() => setModalEnviarCotizacionAbierto(false)}
          onCotizacionEnviada={(nuevoMensaje) => {
            setDetalle((prev) =>
              prev
                ? {
                    ...prev,
                    mensajes: [...prev.mensajes, nuevoMensaje],
                    ultimoMensajeTexto: nuevoMensaje.texto,
                    ultimoMensajeEn: nuevoMensaje.ocurridoEn,
                    ultimoMensajeDireccion: 'SALIENTE',
                  }
                : null,
            );
            scrollToBottom();
          }}
        />
      )}

      {/* Modal Crear Oportunidad en Pipeline (T-076) */}
      {modalCrearOportunidadAbierto && detalle && (
        <ModalCrearOportunidad
          conversacionId={detalle.id}
          contactoNombre={detalle.contactoNombre}
          onCerrar={() => setModalCrearOportunidadAbierto(false)}
          onOportunidadCreada={(nuevaOp) => {
            setFichaContacto((prev) =>
              prev
                ? {
                    ...prev,
                    oportunidadActual: nuevaOp,
                  }
                : null,
            );
          }}
        />
      )}

      {/* Modal Editar Contacto (T-076) */}
      {modalEditarContactoAbierto && fichaContacto && (
        <ModalEditarContacto
          contacto={fichaContacto.contacto}
          onCerrar={() => setModalEditarContactoAbierto(false)}
          onContactoActualizado={(contactoActualizado) => {
            setFichaContacto((prev) =>
              prev
                ? {
                    ...prev,
                    contacto: contactoActualizado,
                  }
                : null,
            );
            setDetalle((prev) =>
              prev
                ? {
                    ...prev,
                    contactoNombre: contactoActualizado.nombre,
                    contactoTelefono: contactoActualizado.telefono,
                    etiquetas: contactoActualizado.etiquetas,
                  }
                : null,
            );
          }}
        />
      )}
    </div>
  );
}
