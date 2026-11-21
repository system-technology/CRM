'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  Send,
  AlertTriangle,
  RotateCcw,
  Check,
  CheckCheck,
  PanelRight,
  Sparkles,
  FileText,
  Calculator,
  Zap,
  Lock,
} from 'lucide-react';
import { inboxApi } from '../../../../lib/inbox-api';
import { useInboxSocket } from '../../../../lib/inbox-socket';
import { usePermisos, explicacionFaltaPermiso } from '../../../../lib/permisos';
import { obtenerFichaDeContacto } from '../../../../lib/crm-api';
import {
  EsqueletoConversacion,
  AvisoErrorAccionable,
} from '../../../../components/comun/esqueletos';
import { MigasDePan } from '../../../../components/comun/migas-de-pan';
import {
  construirMensajeErrorAccionable,
  formatearErrorAmigable,
} from '../../../../lib/estados-ui-logica';
import {
  calcularTiempoRestanteVentana,
  calcularPermisosAsignacion,
  claveDeReintento,
  debeBajarElScroll,
  evaluarTransicionVentanaBorrador,
  type AvisoBorradorVentana,
  generarColorAvatar,
  obtenerIniciales,
} from '../../../../lib/bandeja-logica';
import { FichaCliente } from '../../../../components/bandeja/ficha-cliente';
import {
  InsigniaCuentaRegresiva24h,
  BannerAvisoVentana24h,
  CompositorVentanaCerrada24h,
} from '../../../../components/bandeja/cuenta-regresiva-ventana-24h';
import { calcularCuentaRegresivaVentana24h } from '../../../../lib/ventana-24h';
import { obtenerMockPlantillasDisponibles } from '../../../../lib/mock-plantillas';
import { EnviarPlantilla, type CotizacionResumen } from '@viajapro/contracts';
import {
  listarCotizacionesApi,
  obtenerCotizacionGuardadaApi,
} from '../../../../lib/cotizaciones-api';
import { useViajesBandeja } from '../../../../lib/viajes-bandeja';
import {
  componerViaje,
  cotizacionVigente,
  enlaceParaCotizar,
  type CotizacionParaViaje,
} from '../../../../lib/viaje-solicitado-logica';
import { TarjetaCotizacionEnviada } from '../../../../components/bandeja/tarjeta-cotizacion-enviada';
import { PanelSugerencias } from '../../../../components/bandeja/panel-sugerencias';
import { MenuRespuestasRapidas } from '../../../../components/bandeja/menu-respuestas-rapidas';
import { useBandejaAtajos, debeProcesarAtajo } from '../../../../lib/atajos-teclado-bandeja';
import { AlertaErrorEnvio } from '../../../../components/bandeja/alerta-error-envio';
import { interpretarErrorDeEnvio, type DetalleErrorEnvio } from '../../../../lib/errores-de-envio';
import {
  detectarDisparadorSlash,
  filtrarRespuestasRapidas,
  interpolarVariables,
  obtenerRespuestasRapidas,
  reemplazarComandoSlash,
  type ContextoInterpolacion,
  type RespuestaRapida,
} from '../../../../lib/respuestas-rapidas-logica';
import { formatearFecha } from '../../../../lib/formato';
import { EtiquetasDelChat } from '../../../../components/etiquetas/etiquetas-del-chat';
import { hrefConFiltro, soloFiltroDeEtiquetas } from '../../../../lib/etiquetas-logica';

// Carga diferida de modales secundarios de la bandeja (T-130)
const ModalReasignar = dynamic(
  () => import('../../../../components/bandeja/modal-reasignar').then((m) => m.ModalReasignar),
  { ssr: false },
);

const MOTIVO_PLANTILLAS_NO_DISPONIBLES = {
  titulo: 'Plantillas aún no disponibles',
  mensaje: 'El envío de plantillas llega con las plantillas aprobadas por Meta.',
  accionSugerida: 'Mientras tanto, espera a que el cliente escriba para responderle.',
  reintentable: false,
} as const;

const ModalPlantillas = dynamic(
  () => import('../../../../components/bandeja/modal-plantillas').then((m) => m.ModalPlantillas),
  { ssr: false },
);

const ModalEnviarCotizacion = dynamic(
  () =>
    import('../../../../components/bandeja/modal-enviar-cotizacion').then(
      (m) => m.ModalEnviarCotizacion,
    ),
  { ssr: false },
);

const ModalCrearOportunidad = dynamic(
  () =>
    import('../../../../components/bandeja/modal-crear-oportunidad').then(
      (m) => m.ModalCrearOportunidad,
    ),
  { ssr: false },
);

const ModalEditarContacto = dynamic(
  () =>
    import('../../../../components/bandeja/modal-editar-contacto').then(
      (m) => m.ModalEditarContacto,
    ),
  { ssr: false },
);

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
  const [errorEnvio, setErrorEnvio] = useState<DetalleErrorEnvio | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Modal de plantillas Meta HSM
  const [modalPlantillasAbierto, setModalPlantillasAbierto] = useState(false);

  // Panel lateral de ficha del viajero en pantallas medianas / pequeñas
  const [mostrarFichaLateral, setMostrarFichaLateral] = useState(false);

  // Asistente de Sugerencias (reglas)
  const [sugerenciasAbierto, setSugerenciasAbierto] = useState(false);

  // Estado de conversación retirada (0c.35)
  const [conversacionRetirada, setConversacionRetirada] = useState(false);
  const [modalReasignarAbierto, setModalReasignarAbierto] = useState(false);
  const [menuRespuestasAbierto, setMenuRespuestasAbierto] = useState(false);

  // Modales de Cotización y CRM (T-074, T-076)
  const [modalEnviarCotizacionAbierto, setModalEnviarCotizacionAbierto] = useState(false);
  /**
   * Cotizaciones del contacto, pedidas a `quoting`. La ficha de `crm` las trae vacías a propósito
   * (R4: `crm` no lee de `quoting`), así que el modal de envío no tendría nada que elegir.
   */
  const [cotizacionesContacto, setCotizacionesContacto] = useState<CotizacionResumen[]>([]);
  /**
   * La cotización vigente con lo que solo trae su detalle (pasajeros, vigencia, destino). Es UNA
   * petición para la conversación abierta, no una por fila de la lista.
   */
  const [cotizacionDelViaje, setCotizacionDelViaje] = useState<CotizacionParaViaje | null>(null);
  const contactoDeCotizacionesRef = useRef<string>('');
  const indiceDeViajes = useViajesBandeja();
  const [modalCrearOportunidadAbierto, setModalCrearOportunidadAbierto] = useState(false);
  const [modalEditarContactoAbierto, setModalEditarContactoAbierto] = useState(false);

  // Permisos de sesión para visibilidad, asignación y etiquetas (0c.35, T-118, T-326)
  const { sesion, puedeVerTodasConversaciones, puedeOperarBandeja, puedeAdministrarEtiquetas } =
    usePermisos();

  // Selector de etiquetas de la conversación (T-326): lo abre «+ Etiqueta» o el atajo `e`
  const [etiquetasAbierto, setEtiquetasAbierto] = useState(false);

  // Atajos de teclado en la bandeja (T-127 y T-024)
  const { irASiguiente, irAAnterior, modalAyudaAbierto, setModalAyudaAbierto, atajosHabilitados } =
    useBandejaAtajos();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Atajos con modificador Alt (T-024)
      if (e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setModalPlantillasAbierto((prev) => !prev);
        return;
      } else if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        setModalReasignarAbierto((prev) => !prev);
        return;
      } else if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setMostrarFichaLateral((prev) => !prev);
        return;
      } else if (e.key === 'Escape') {
        if (modalAyudaAbierto) setModalAyudaAbierto(false);
        else if (menuRespuestasAbierto) setMenuRespuestasAbierto(false);
        else if (modalPlantillasAbierto) setModalPlantillasAbierto(false);
        else if (modalReasignarAbierto) setModalReasignarAbierto(false);
        else if (modalEnviarCotizacionAbierto) setModalEnviarCotizacionAbierto(false);
        else if (modalCrearOportunidadAbierto) setModalCrearOportunidadAbierto(false);
        else if (modalEditarContactoAbierto) setModalEditarContactoAbierto(false);
        else if (mostrarFichaLateral) setMostrarFichaLateral(false);
        return;
      }

      // Atajos de un solo carácter para navegación y acciones rápidas (T-127)
      if (!debeProcesarAtajo(e, atajosHabilitados)) {
        return;
      }

      const key = e.key;

      if (key === 'r' || key === 'R') {
        e.preventDefault();
        textareaRef.current?.focus();
      } else if (key === 'c' || key === 'C') {
        e.preventDefault();
        setModalEnviarCotizacionAbierto(true);
      } else if (key === 's' || key === 'S') {
        e.preventDefault();
        setModalCrearOportunidadAbierto(true);
      } else if (key === 'e' || key === 'E') {
        e.preventDefault();
        if (puedeOperarBandeja && !conversacionRetirada) setEtiquetasAbierto(true);
      } else if (key === '?' || (key === '/' && e.shiftKey)) {
        e.preventDefault();
        setModalAyudaAbierto(true);
      } else if (key === 'j' || key === 'J') {
        e.preventDefault();
        irASiguiente(id);
      } else if (key === 'k' || key === 'K') {
        e.preventDefault();
        irAAnterior(id);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    modalPlantillasAbierto,
    modalReasignarAbierto,
    mostrarFichaLateral,
    menuRespuestasAbierto,
    modalEnviarCotizacionAbierto,
    modalCrearOportunidadAbierto,
    modalEditarContactoAbierto,
    modalAyudaAbierto,
    atajosHabilitados,
    puedeOperarBandeja,
    conversacionRetirada,
    id,
    irASiguiente,
    irAAnterior,
    setModalAyudaAbierto,
  ]);
  const [asignando, setAsignando] = useState(false);

  // Permisos de sesión: ver arriba, junto a los atajos (T-326 los necesita antes).
  const miUsuarioId = sesion?.acceso?.usuarioId ?? null;
  const permisosAsignacion = calcularPermisosAsignacion(
    detalle,
    miUsuarioId,
    puedeVerTodasConversaciones,
  );

  // Respuestas rápidas (T-104)
  const [catalogoRespuestas, setCatalogoRespuestas] = useState<RespuestaRapida[]>(() =>
    obtenerRespuestasRapidas(sesion?.tenantActivoId),
  );
  const [querySlash, setQuerySlash] = useState('');
  const [disparadorSlashInfo, setDisparadorSlashInfo] = useState<{
    indiceInicio: number;
    longitudComando: number;
  } | null>(null);
  const [indiceSeleccionadoRR, setIndiceSeleccionadoRR] = useState(0);

  useEffect(() => {
    setCatalogoRespuestas(obtenerRespuestasRapidas(sesion?.tenantActivoId));
  }, [sesion?.tenantActivoId]);

  const nombreAgenciaActiva =
    sesion?.agencias?.find((a) => a.id === sesion?.tenantActivoId)?.nombre || 'Nuestra Agencia';

  const contextoInterpolacion: ContextoInterpolacion = useMemo(
    () => ({
      nombreCliente: detalle?.contactoNombre ?? null,
      nombreAsesor: sesion?.identidad?.nombre ?? null,
      nombreAgencia: nombreAgenciaActiva,
      destino: fichaContacto?.oportunidadActual?.destino ?? null,
    }),
    [
      detalle?.contactoNombre,
      sesion?.identidad?.nombre,
      nombreAgenciaActiva,
      fichaContacto?.oportunidadActual?.destino,
    ],
  );

  const respuestasFiltradas = useMemo(
    () => filtrarRespuestasRapidas(catalogoRespuestas, querySlash),
    [catalogoRespuestas, querySlash],
  );

  const insertarRespuestaRapida = useCallback(
    (rr: RespuestaRapida, textoInterpolado: string) => {
      if (disparadorSlashInfo) {
        const { nuevoTexto, nuevaPosCursor } = reemplazarComandoSlash(
          textoMensaje,
          disparadorSlashInfo.indiceInicio,
          disparadorSlashInfo.longitudComando,
          textoInterpolado,
        );
        setTextoMensaje(nuevoTexto);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(nuevaPosCursor, nuevaPosCursor);
          }
        }, 10);
      } else {
        const nuevoTexto = textoMensaje.trim()
          ? `${textoMensaje} ${textoInterpolado}`
          : textoInterpolado;
        setTextoMensaje(nuevoTexto);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const fin = nuevoTexto.length;
            textareaRef.current.setSelectionRange(fin, fin);
          }
        }, 10);
      }

      setMenuRespuestasAbierto(false);
      setDisparadorSlashInfo(null);
    },
    [disparadorSlashInfo, textoMensaje],
  );

  const manejarCambioTexto = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setTextoMensaje(val);

    if (!modoNota) {
      const cursorPos = e.target.selectionStart;
      const disparador = detectarDisparadorSlash(val, cursorPos);
      if (disparador && disparador.activo) {
        setMenuRespuestasAbierto(true);
        setQuerySlash(disparador.query);
        setDisparadorSlashInfo({
          indiceInicio: disparador.indiceInicio,
          longitudComando: disparador.longitudComando,
        });
        setIndiceSeleccionadoRR(0);
      } else {
        setMenuRespuestasAbierto(false);
        setDisparadorSlashInfo(null);
      }
    }
  };

  const manejarKeyDownTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuRespuestasAbierto && respuestasFiltradas.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndiceSeleccionadoRR((prev) => (prev + 1) % respuestasFiltradas.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndiceSeleccionadoRR(
          (prev) => (prev - 1 + respuestasFiltradas.length) % respuestasFiltradas.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const seleccionada = respuestasFiltradas[indiceSeleccionadoRR];
        if (seleccionada) {
          const texto = interpolarVariables(seleccionada.contenido, contextoInterpolacion);
          insertarRespuestaRapida(seleccionada, texto);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuRespuestasAbierto(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void manejarEnvio();
    }
  };

  // Atajos de teclado

  // Control de scroll y avisos de mensajes nuevos
  const chatContainerRef = useRef<HTMLElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [mensajesNuevosSinVer, setMensajesNuevosSinVer] = useState(0);

  // Mapa de claves de idempotencia para garantizar R5
  const idempotenciaMapRef = useRef<Record<string, string>>({});
  const mensajeRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Tiempo restante de la ventana de 24h
  const [tiempoVentana, setTiempoVentana] = useState<{
    minutos: number;
    horas: number;
    cerrada: boolean;
    texto: string;
  }>({ minutos: 0, horas: 0, cerrada: false, texto: '' });

  const estadoVentana24h = useMemo(() => {
    // La fuente de verdad es `detalle.ventana` (VentanaServicio de la API, T-198). Con la API real
    // NO se recalcula desde los mensajes: `expiraEn` nulo significa que el cliente nunca escribió.
    // El respaldo desde el último mensaje entrante (24 h propias) solo vale en modo maqueta.
    const ultimoEntrante = inboxApi.isModoReal()
      ? undefined
      : detalle?.mensajes?.filter((m) => m.direccion === 'ENTRANTE').slice(-1)[0]?.ocurridoEn;
    return calcularCuentaRegresivaVentana24h({
      expiraEn: detalle?.ventana?.expiraEn ?? null,
      ultimoMensajeClienteEn: ultimoEntrante ?? null,
      abiertaServidor: detalle?.ventana ? detalle.ventana.abierta && !tiempoVentana.cerrada : false,
    });
  }, [detalle?.ventana, detalle?.mensajes, tiempoVentana]);

  // Con la API real aún no hay endpoint de plantillas aprobadas por Meta (T-185).
  const plantillasNoDisponibles = inboxApi.isModoReal();
  const plantillasDisponibles = useMemo(() => obtenerMockPlantillasDisponibles().plantillas, []);

  /**
   * La ficha de `crm` trae las cotizaciones vacías a propósito (R4: no lee de `quoting`); aquí se
   * le ponen las que la bandeja ya pidió a `quoting`.
   */
  const fichaDelPanel = useMemo(
    () => (fichaContacto ? { ...fichaContacto, cotizaciones: cotizacionesContacto } : null),
    [fichaContacto, cotizacionesContacto],
  );
  const viajeDelPanel = useMemo(
    () =>
      fichaContacto
        ? componerViaje({
            oportunidad: fichaContacto.oportunidadActual,
            archivo: indiceDeViajes.archivos.get(fichaContacto.contacto.id) ?? null,
            cotizacion: cotizacionDelViaje,
          })
        : null,
    [fichaContacto, indiceDeViajes, cotizacionDelViaje],
  );

  // «Cotizar» desde el compositor: lleva el contacto, esta conversación y lo que ya se sabe del viaje.
  const hrefCotizarDesdeElChat = useMemo(
    () =>
      enlaceParaCotizar({
        contactoId: detalle?.contactoId ?? fichaContacto?.contacto.id ?? '',
        conversacionId: id,
        oportunidadId: viajeDelPanel?.oportunidadId ?? null,
        paqueteId: viajeDelPanel?.paqueteId ?? null,
        destino: viajeDelPanel?.destino ?? null,
        fechaSalida: viajeDelPanel?.fechaSalida ?? null,
        pasajeros: viajeDelPanel?.pasajeros ?? null,
      }),
    [detalle?.contactoId, fichaContacto, id, viajeDelPanel],
  );

  // Llegada desde «Enviar en esta conversación» (detalle de la cotización): abre el MISMO diálogo de
  // envío por el canal con esa cotización elegida. Se consume una vez y se quita de la URL.
  const router = useRouter();
  const searchParams = useSearchParams();
  const cotizacionParaEnviar = searchParams.get('enviarCotizacion');
  // Volver a la lista conserva el filtro por etiqueta que viaja en la URL (T-326).
  const hrefLista = hrefConFiltro('/bandeja', soloFiltroDeEtiquetas(searchParams));
  const [cotizacionInicialId, setCotizacionInicialId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!cotizacionParaEnviar || !detalle) return;
    if (!cotizacionesContacto.some((c) => c.id === cotizacionParaEnviar)) return;
    setCotizacionInicialId(cotizacionParaEnviar);
    setModalEnviarCotizacionAbierto(true);
    router.replace(`/bandeja/${id}`, { scroll: false });
  }, [cotizacionParaEnviar, detalle, cotizacionesContacto, id, router]);

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
  const cargarCotizacionesDelContacto = useCallback(async (contactoId: string) => {
    contactoDeCotizacionesRef.current = contactoId;
    // Lo del contacto anterior no se queda a la vista mientras llega lo de este.
    setCotizacionDelViaje(null);
    try {
      const pagina = await listarCotizacionesApi({ contactoId, limite: 50 });
      if (contactoDeCotizacionesRef.current !== contactoId) return;
      const vigente = cotizacionVigente(pagina.datos);
      if (vigente) {
        let ultima = null;
        try {
          ultima = (await obtenerCotizacionGuardadaApi(vigente.id)).versiones.at(-1) ?? null;
        } catch (e) {
          // Sin el detalle se muestra la cotización sin pasajeros ni vigencia; no tumba el panel.
          console.warn('[bandeja] No se pudo leer el detalle de la cotización vigente:', e);
        }
        if (contactoDeCotizacionesRef.current !== contactoId) return;
        setCotizacionDelViaje({
          id: vigente.id,
          titulo: vigente.titulo,
          version: ultima?.numero ?? vigente.numeroDeVersiones,
          venta: ultima?.venta ?? vigente.venta,
          vigenteHasta: ultima?.vigenteHasta ?? null,
          estado: vigente.estado,
          destino: ultima?.destino ?? null,
          fechaSalida: ultima?.fechaSalida ?? vigente.fechaSalida,
          pasajeros: ultima
            ? { adultos: ultima.adultos, ninos: ultima.ninos, infantes: ultima.infantes }
            : null,
        });
      }
      setCotizacionesContacto(
        pagina.datos.map((fila) => ({
          id: fila.id,
          version: fila.numeroDeVersiones,
          titulo: fila.titulo,
          precioVenta: fila.venta,
          vigenteHasta: null,
          enviadaEn: fila.enviadaEn,
        })),
      );
    } catch (e) {
      // No tumba la conversación: el modal mostrará «No hay cotizaciones guardadas».
      console.error('[bandeja] No se pudieron cargar las cotizaciones del contacto:', e);
      setCotizacionesContacto([]);
      setCotizacionDelViaje(null);
    }
  }, []);

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
        if (data.contactoId) void cargarCotizacionesDelContacto(data.contactoId);
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
  }, [id, scrollToBottom, cargarCotizacionesDelContacto]);

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
    // Sin identidad de usuario no se toma: nunca se inventa un id (T-185).
    if (!miUsuarioId) {
      setErrorEnvio(interpretarErrorDeEnvio({ code: 'SIN_USUARIO' }));
      return;
    }
    setErrorEnvio(null);
    setAsignando(true);
    try {
      const res = await inboxApi.asignarConversacion({
        conversacionId: detalle.id,
        usuarioId: miUsuarioId,
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
      setErrorEnvio(
        interpretarErrorDeEnvio(e, {
          titulo: 'No se pudo tomar la conversación',
          mensaje: 'La conversación no quedó asignada a ti.',
          accionSugerida: 'Vuelve a intentarlo; si persiste, actualiza la bandeja.',
        }),
      );
    } finally {
      setAsignando(false);
    }
  };

  const manejarSoltar = async () => {
    if (!detalle || asignando) return;
    setErrorEnvio(null);
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
      setErrorEnvio(
        interpretarErrorDeEnvio(e, {
          titulo: 'No se pudo soltar la conversación',
          mensaje: 'La conversación sigue asignada.',
          accionSugerida: 'Vuelve a intentarlo; si persiste, actualiza la bandeja.',
        }),
      );
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
          interpretarErrorDeEnvio(err, {
            mensaje: 'No fue posible guardar la nota interna en este momento.',
          }),
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
      const errorDetalle = interpretarErrorDeEnvio(err);
      setErrorEnvio(errorDetalle);
      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((m) =>
            m.id === tempId
              ? { ...m, estado: 'FALLIDO', motivoFallo: errorDetalle.textoParaMostrar }
              : m,
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
    setErrorEnvio(null);

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
      const errorDetalle = interpretarErrorDeEnvio(err);
      setErrorEnvio(errorDetalle);
      setDetalle((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          mensajes: prev.mensajes.map((msg) =>
            msg.id === m.id
              ? { ...msg, estado: 'FALLIDO', motivoFallo: errorDetalle.textoParaMostrar }
              : msg,
          ),
        };
      });
    }
  };

  const manejarEnvioPlantilla = async (envio: EnviarPlantilla, textoInterpolado: string) => {
    if (plantillasNoDisponibles) {
      setErrorEnvio(
        interpretarErrorDeEnvio(
          { code: 'PLANTILLAS_NO_DISPONIBLES' },
          MOTIVO_PLANTILLAS_NO_DISPONIBLES,
        ),
      );
      return;
    }
    try {
      setEnviando(true);
      setErrorEnvio(null);
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
          // La ventana de 24 h solo la abre un mensaje del cliente (el servidor la informa).
        };
      });

      setTextoMensaje('');
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (e) {
      setErrorEnvio(interpretarErrorDeEnvio(e));
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
      <div className="flex h-full w-full flex-col">
        {/* Sin barra inferior en la conversación a pantalla completa: la salida es esta flecha (T-320). */}
        <div className="flex h-14 shrink-0 items-center border-b border-neutral-200 bg-white px-2.5 md:hidden dark:border-neutral-800 dark:bg-neutral-900">
          <Link
            href={hrefLista}
            data-testid="volver-a-conversaciones"
            className="focus-visible:ring-acento-600 flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Volver a lista de conversaciones"
            aria-label="Volver a lista de conversaciones"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <AvisoErrorAccionable
            error={errorDetallado}
            onReintentar={() => void cargarHistorial()}
          />
        </div>
      </div>
    );
  }

  const avatarColores = generarColorAvatar(detalle.contactoId);
  const iniciales = obtenerIniciales(detalle.contactoNombre, detalle.contactoTelefono);

  return (
    <div className="flex h-full w-full overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      {/* Columna Central: Conversación (Chat) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-900">
        {/* Migas de pan de turismo (T-034) */}
        <div className="hidden border-b border-neutral-100 bg-neutral-50/50 px-4 py-1 sm:block dark:border-neutral-800/60 dark:bg-neutral-950/40">
          <MigasDePan
            elementos={[
              { etiqueta: 'Hoy', href: '/' },
              { etiqueta: 'Bandeja', href: hrefLista },
              { etiqueta: detalle.contactoNombre || detalle.contactoTelefono || 'Conversación' },
            ]}
          />
        </div>

        {/* Cabecera de la conversación (Tarea 0b.6) */}
        <header className="flex min-w-0 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-2.5 py-2 sm:px-4 sm:py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* Botón volver a lista (móvil) */}
            <Link
              href={hrefLista}
              className="flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100 md:hidden dark:hover:bg-neutral-800"
              title="Volver a lista de conversaciones"
              aria-label="Volver a lista de conversaciones"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* Avatar determinista */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold sm:h-9 sm:w-9 ${avatarColores.bg} ${avatarColores.text}`}
            >
              {iniciales}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  {detalle.contactoNombre || detalle.contactoTelefono}
                </h2>
                <span className="cifra hidden text-sm text-neutral-400 sm:inline">
                  {detalle.contactoTelefono}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm text-neutral-400">
                  {detalle.asignadoANombre
                    ? `Asignado a: ${detalle.asignadoANombre}`
                    : 'Sin asignar'}
                </p>
                {/* Botones de Asignación (0c.35) */}
                {permisosAsignacion.puedeTomar && (
                  <button
                    type="button"
                    onClick={() => void manejarTomar()}
                    disabled={asignando || conversacionRetirada || !puedeOperarBandeja}
                    data-testid="boton-tomar"
                    className="bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-950/40 dark:text-primary-300 flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[28px] md:min-w-0"
                    title={
                      !puedeOperarBandeja
                        ? explicacionFaltaPermiso('bandeja.operar')
                        : 'Asignarme esta conversación'
                    }
                  >
                    <UserPlus className="h-3 w-3" />
                    <span className="sr-only md:not-sr-only">Tomar</span>
                  </button>
                )}
                {permisosAsignacion.puedeSoltar && (
                  <button
                    type="button"
                    onClick={() => void manejarSoltar()}
                    disabled={asignando || conversacionRetirada || !puedeOperarBandeja}
                    data-testid="boton-soltar"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[28px] md:min-w-0 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title={
                      !puedeOperarBandeja
                        ? explicacionFaltaPermiso('bandeja.operar')
                        : 'Devolver a la cola común'
                    }
                  >
                    <UserMinus className="h-3 w-3" />
                    <span className="sr-only md:not-sr-only">Soltar</span>
                  </button>
                )}
                {permisosAsignacion.puedeReasignar && (
                  <button
                    type="button"
                    onClick={() => setModalReasignarAbierto(true)}
                    disabled={asignando || conversacionRetirada || !puedeOperarBandeja}
                    data-testid="boton-reasignar"
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-md border border-neutral-200 px-2 py-0.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[28px] md:min-w-0 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    title={
                      !puedeOperarBandeja
                        ? explicacionFaltaPermiso('bandeja.operar')
                        : 'Reasignar a otro asesor de la agencia'
                    }
                  >
                    <UserCheck className="h-3 w-3" />
                    <span className="sr-only md:not-sr-only">Reasignar</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Estado de 24h + SLA. Cotizar vive en la solicitud de viaje del panel derecho */}
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Cuenta atrás viva de 24h (T-113) */}
            <InsigniaCuentaRegresiva24h estado={estadoVentana24h} />

            {/* SLA Badge (visible a partir de sm) */}
            {detalle.slaVenceEn && (
              <span className="bg-alerta-50 text-alerta-700 dark:bg-alerta-950/40 dark:text-alerta-300 hidden shrink-0 rounded-md px-2 py-1 text-sm font-semibold sm:inline-flex">
                SLA Activo
              </span>
            )}

            {/* Alternar Ficha del Viajero (< xl) */}
            <button
              type="button"
              onClick={() => setMostrarFichaLateral((p) => !p)}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 px-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 xl:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              title="Ver la solicitud de viaje y la ficha del viajero"
              aria-label="Alternar ficha de cliente"
            >
              <PanelRight className="h-4 w-4" aria-hidden="true" />
              <span>Viaje</span>
            </button>
          </div>
        </header>

        {/* Etiquetas de la conversación: poner y quitar con un toque (T-326, HU-inbox-1 §4.2) */}
        <EtiquetasDelChat
          conversacionId={detalle.id}
          etiquetas={detalle.etiquetas}
          alCambiar={(etiquetas) => setDetalle((prev) => (prev ? { ...prev, etiquetas } : prev))}
          puedeOperar={puedeOperarBandeja}
          puedeAdministrar={puedeAdministrarEtiquetas}
          deshabilitado={conversacionRetirada}
          abierto={etiquetasAbierto}
          alCambiarAbierto={setEtiquetasAbierto}
        />

        {/* Aviso de conversación retirada sin perder borrador (0c.35) */}
        {conversacionRetirada && (
          <div
            role="alert"
            data-testid="aviso-conversacion-retirada"
            className="flex shrink-0 items-center justify-between border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Esta conversación se asignó a otra persona</p>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Ya no tienes acceso para enviar mensajes. Tu borrador sigue aquí para que no
                  pierdas lo que escribiste.
                </p>
              </div>
            </div>
            <Link
              href="/bandeja"
              className="flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-amber-200 px-3.5 py-1.5 text-sm font-semibold text-amber-900 hover:bg-amber-300 dark:bg-amber-900 dark:text-amber-100"
            >
              Ir a mi bandeja
            </Link>
          </div>
        )}

        {/* Historial de Mensajes: único contenedor con scroll propio */}
        {/* Banner de advertencia si la ventana está por cerrar (<2h) (T-113) */}
        <BannerAvisoVentana24h
          estado={estadoVentana24h}
          onAbrirPlantillas={() => setModalPlantillasAbierto(true)}
        />

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
              className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
            >
              <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                <span>📌 Nota Interna (Equipo)</span>
                <span className="text-sm font-normal">{nota.autorNombre}</span>
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
                  <TarjetaCotizacionEnviada
                    cotizacionId={m.cotizacionId}
                    conversacionId={id}
                    texto={m.texto}
                  />
                ) : (
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 text-sm shadow-2xs sm:max-w-[70%] ${
                      esEntrante
                        ? 'rounded-tl-xs border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                        : esFallido
                          ? 'border-alerta-300 bg-alerta-50 text-alerta-950 dark:border-alerta-800 dark:bg-alerta-950/60 dark:text-alerta-200 rounded-tr-xs border'
                          : 'bg-acento-700 rounded-tr-xs text-white'
                    }`}
                  >
                    {!esEntrante && m.autorNombre && (
                      <div className="text-acento-100 mb-1 text-sm font-semibold opacity-80">
                        {m.autorNombre}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{m.texto}</p>

                    <div
                      className={`mt-1.5 flex items-center justify-end gap-1.5 text-sm ${
                        esEntrante
                          ? 'text-neutral-400'
                          : esFallido
                            ? 'text-alerta-700 dark:text-alerta-300'
                            : 'text-acento-100'
                      }`}
                    >
                      <span>{formatearFecha(m.ocurridoEn, { estilo: 'hora' })}</span>

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
                        <p className="text-alerta-800 dark:text-alerta-300 text-sm font-medium">
                          {
                            interpretarErrorDeEnvio(
                              m.motivoFallo || 'Error al conectar con WhatsApp API.',
                            ).textoParaMostrar
                          }
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
                className="flex items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-bold text-white shadow-xl hover:bg-black"
              >
                <span>⬇️ Hay {mensajesNuevosSinVer} mensaje(s) nuevo(s)</span>
              </button>
            </div>
          )}
        </main>

        {/* Pie de redacción */}
        <footer className="min-w-0 shrink-0 border-t border-neutral-200 bg-white p-3 pb-24 md:pb-3 dark:border-neutral-800 dark:bg-neutral-900">
          {!detalle.ventana.abierta || tiempoVentana.cerrada || estadoVentana24h.cerrada ? (
            <div className="space-y-2">
              {errorEnvio && (
                <AlertaErrorEnvio
                  error={errorEnvio}
                  onDescartar={() => setErrorEnvio(null)}
                  onAbrirPlantillas={() => setModalPlantillasAbierto(true)}
                  onRecargar={() => void cargarHistorial()}
                  onReintentar={() => setErrorEnvio(null)}
                />
              )}
              <CompositorVentanaCerrada24h
                estado={estadoVentana24h}
                plantillas={plantillasDisponibles}
                textoBorrador={textoMensaje}
                mostrarAvisoBorrador={avisoBorrador.debeMostrar}
                onAbrirPlantillas={() => setModalPlantillasAbierto(true)}
              />
              {/* Con la ventana cerrada también se cotiza: enviarla es lo que exige plantilla */}
              <Link
                href={hrefCotizarDesdeElChat}
                data-testid="boton-cotizar-desde-chat"
                className="boton-primario flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1 text-sm font-bold shadow-2xs"
              >
                <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cotizar</span>
              </Link>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-800">
                      <button
                        type="button"
                        onClick={() => setModoNota(false)}
                        className={`flex min-h-[44px] items-center rounded-md px-2.5 py-1 text-sm font-medium transition-colors sm:min-h-[32px] ${
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
                        className={`flex min-h-[44px] items-center rounded-md px-2.5 py-1 text-sm font-medium transition-colors sm:min-h-[32px] ${
                          modoNota
                            ? 'bg-amber-400 font-bold text-amber-950 shadow-2xs'
                            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400'
                        }`}
                      >
                        📌 Nota interna
                      </button>
                    </div>

                    {/* «Cotizar» a un toque, con el contexto de este chat (para quién y desde dónde) */}
                    <Link
                      href={hrefCotizarDesdeElChat}
                      data-testid="boton-cotizar-desde-chat"
                      className="boton-primario flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 py-1 text-sm font-bold shadow-2xs sm:min-h-[32px]"
                    >
                      <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Cotizar</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => setSugerenciasAbierto((p) => !p)}
                      className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors sm:min-h-[32px] ${
                        sugerenciasAbierto
                          ? 'border-acento-300 bg-acento-100 text-acento-900 dark:border-acento-800 dark:bg-acento-950 dark:text-acento-200'
                          : 'border-acento-200 bg-acento-50 text-acento-700 hover:bg-acento-100 dark:border-acento-900/60 dark:bg-acento-950/40 dark:text-acento-300'
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
                      disabled={conversacionRetirada || !puedeOperarBandeja}
                      className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[32px] dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      title={
                        !puedeOperarBandeja
                          ? explicacionFaltaPermiso('bandeja.operar')
                          : 'Enviar cotización por WhatsApp'
                      }
                      aria-label="Enviar cotización por WhatsApp"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      <span>Enviar cotización</span>
                    </button>

                    <button
                      type="button"
                      id="btn-respuestas-rapidas"
                      data-testid="btn-respuestas-rapidas"
                      onClick={() => {
                        setMenuRespuestasAbierto((p) => !p);
                        setQuerySlash('');
                        setDisparadorSlashInfo(null);
                        setIndiceSeleccionadoRR(0);
                      }}
                      className={`flex min-h-[44px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-semibold transition-colors sm:min-h-[32px] ${
                        menuRespuestasAbierto
                          ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'
                          : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                      }`}
                      title="Respuestas Rápidas (o escribe «/» en el chat)"
                      aria-label="Abrir respuestas rápidas"
                    >
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span className="hidden sm:inline">Respuestas</span>
                      <span className="rounded bg-amber-100 px-1 font-mono text-sm text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                        /
                      </span>
                    </button>
                  </div>
                </div>

                {errorEnvio && (
                  <AlertaErrorEnvio
                    error={errorEnvio}
                    onDescartar={() => setErrorEnvio(null)}
                    onAbrirPlantillas={() => setModalPlantillasAbierto(true)}
                    onRecargar={() => void cargarHistorial()}
                    onReintentar={() => void manejarEnvio()}
                  />
                )}

                {!puedeOperarBandeja && (
                  <div
                    data-testid="aviso-solo-lectura-bandeja"
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100/90 p-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-300"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                    <span>
                      Modo solo lectura: Tu rol no cuenta con el permiso «Operar bandeja»
                      (bandeja.operar).
                    </span>
                  </div>
                )}

                <div className="relative flex gap-2">
                  {menuRespuestasAbierto && (
                    <MenuRespuestasRapidas
                      respuestas={respuestasFiltradas}
                      query={querySlash}
                      contexto={contextoInterpolacion}
                      indiceSeleccionado={indiceSeleccionadoRR}
                      onSeleccionar={insertarRespuestaRapida}
                      onCerrar={() => setMenuRespuestasAbierto(false)}
                    />
                  )}

                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={textoMensaje}
                    onChange={manejarCambioTexto}
                    onKeyDown={manejarKeyDownTextarea}
                    placeholder={
                      !puedeOperarBandeja
                        ? 'Modo solo lectura: Requiere permiso «bandeja.operar» para responder...'
                        : modoNota
                          ? 'Escribe una nota interna para el equipo (nunca se envía al cliente)...'
                          : 'Escribe tu respuesta a cliente o «/» para respuestas rápidas...'
                    }
                    disabled={enviando || conversacionRetirada || !puedeOperarBandeja}
                    className={`flex-1 rounded-lg border p-2.5 text-sm focus:outline-none ${
                      modoNota
                        ? 'border-amber-300 bg-amber-50/50 focus:border-amber-500 dark:border-amber-900/60 dark:bg-amber-950/20'
                        : 'focus:border-acento-600 border-neutral-200 bg-neutral-50 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={
                      enviando ||
                      conversacionRetirada ||
                      !puedeOperarBandeja ||
                      !textoMensaje.trim()
                    }
                    title={
                      !puedeOperarBandeja
                        ? explicacionFaltaPermiso('bandeja.operar')
                        : modoNota
                          ? 'Guardar nota interna'
                          : 'Enviar mensaje'
                    }
                    aria-label={modoNota ? 'Guardar nota interna' : 'Enviar mensaje'}
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center self-end rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-2xs disabled:cursor-not-allowed disabled:opacity-50 ${
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
      {fichaContacto && fichaDelPanel && viajeDelPanel && (
        <aside className="hidden w-[340px] shrink-0 border-l border-neutral-200 xl:block dark:border-neutral-800">
          <FichaCliente
            ficha={fichaDelPanel}
            viaje={viajeDelPanel}
            conversacionId={id}
            onEditarContacto={() => setModalEditarContactoAbierto(true)}
            onCrearOportunidad={() => setModalCrearOportunidadAbierto(true)}
          />
        </aside>
      )}

      {/* Ficha lateral como Drawer en pantallas medianas (< xl) */}
      {mostrarFichaLateral && fichaContacto && fichaDelPanel && viajeDelPanel && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/40 xl:hidden"
          onClick={() => setMostrarFichaLateral(false)}
        >
          <div
            className="w-full max-w-sm bg-white shadow-2xl dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <FichaCliente
              ficha={fichaDelPanel}
              viaje={viajeDelPanel}
              conversacionId={id}
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
        envioDeshabilitadoMotivo={
          plantillasNoDisponibles ? MOTIVO_PLANTILLAS_NO_DISPONIBLES.mensaje : undefined
        }
        onCerrar={() => setModalPlantillasAbierto(false)}
        onEnviarPlantilla={(envio, texto) => {
          void manejarEnvioPlantilla(envio, texto);
        }}
      />

      {/* Modal Enviar Cotización por WhatsApp */}
      {modalEnviarCotizacionAbierto && detalle && (
        <ModalEnviarCotizacion
          conversacionId={detalle.id}
          cotizacionInicialId={cotizacionInicialId}
          contactoNombre={detalle.contactoNombre}
          contactoTelefono={detalle.contactoTelefono}
          ventanaAbierta={detalle.ventana.abierta && !tiempoVentana.cerrada}
          cotizaciones={
            cotizacionesContacto.length > 0
              ? cotizacionesContacto
              : (fichaContacto?.cotizaciones ?? [])
          }
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
                    // T-325: `detalle.etiquetas` ya no son las del contacto sino las de la agencia
                    // puestas en la conversación (id, nombre, color): editar al contacto no las toca.
                  }
                : null,
            );
          }}
        />
      )}
    </div>
  );
}
