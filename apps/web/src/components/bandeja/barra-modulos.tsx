'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Sun,
  Moon,
  Laptop,
  Plane,
  Search,
  Bell,
  Building2,
  Check,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { CONFIGURACION_MODULOS, type ModuloViajaPro } from '../comun/iconos-modulos';
import type { Permiso, SesionActual } from '@viajapro/contracts';
import { ModalBusquedaGlobal } from '../busqueda/modal-busqueda-global';
import { PanelNotificaciones } from '../notificaciones/panel-notificaciones';
import { SelectorTemaDensidad } from '../comun/selector-tema-densidad';
import { BarraInferiorMovil } from '../comun/barra-inferior-movil';
import { HojaMas } from '../comun/hoja-mas';
import { EVENTO_ABRIR_BUSQUEDA_GLOBAL } from '../../lib/busqueda-global-evento';
import {
  type ModoTema,
  type DensidadVisual,
  cargarPreferenciasTema,
  guardarModoTema,
  suscribirCambiosSistema,
  resolverTemaEfectivo,
  consultarPreferenciaSistemaOscuro,
} from '../../lib/tema-y-densidad';
import {
  type NotificacionWeb,
  generarNotificacionesIniciales,
  crearNotificacionSeguimientoVencido,
  procesarEventoSocketNotificacion,
  archivoIdDeHref,
  resumirNotificaciones,
  soloConArchivoExistente,
  archivosDesconocidos,
  marcarNotificacionLeida,
  marcarTodasNotificacionesLeidas,
  descartarNotificacion,
} from '../../lib/notificaciones-web';
import { generarAlertasOperativas } from '../../lib/notificaciones-logica';
import { useAvisosDePlazo } from '../../lib/use-avisos-de-plazo';
import {
  adaptarAvisoANotificacionWeb,
  esAvisoDePlazo,
  idDeAviso,
} from '../../lib/avisos-plazo-logica';
import { obtenerAjustesAgenciaApi } from '../../lib/agencia-api';
import { estaUsandoApiReal } from '../../lib/crm-api';
import { zonaOPorDefecto } from '../../lib/archivos-logica';
import { obtenerPendientesDelDiaApi } from '../../lib/crm-api';
import { LIMITE_LISTA_ARCHIVOS, listarArchivos } from '../../lib/archivos-api';
import { useContadoresDeMenu } from '../../lib/use-contadores-de-menu';
import { nombreAccesibleConContador } from '../../lib/inicio-logica';
import { tienePermiso, usePermisos } from '../../lib/permisos';
import { useModoDemo, esModoDemo } from '../../lib/modo-demo';
import { cambiarAgenciaActivaApi, cerrarSesionApi } from '../../lib/auth-api';
import { inboxSocketManager } from '../../lib/inbox-socket';
import { useFocoModal } from '../../lib/use-foco-modal';
import { fijarZonaAgencia } from '../../lib/formato';
import {
  entradasDeHojaMas,
  entradaParaUsuario,
  entradasDelMenu,
  esDetalleMovilDeBandeja,
  esVisiblePara,
  etiquetaDeBarra,
  moduloActivo,
  type IdDeModulo,
} from '../../lib/navegacion';

/** Color e icono suave por módulo (iconos-modulos) del menú lateral expandido. */
const CLAVE_DE_COLOR: Partial<Record<IdDeModulo, ModuloViajaPro>> = {
  conversaciones: 'bandeja',
  oportunidades: 'pipeline',
  cotizaciones: 'cotizaciones',
  archivos: 'viajes',
  contactos: 'contactos',
  catalogo: 'catalogo',
  reportes: 'reportes',
  configuracion: 'configuracion',
};

/**
 * Calcula iniciales legibles del usuario activo.
 */
export function calcularIniciales(nombre?: string | null, correo?: string | null): string {
  if (nombre && nombre.trim().length > 0) {
    const partes = nombre.trim().split(/\s+/);
    const primero = partes[0];
    const segundo = partes[1];
    if (primero && segundo && primero.length > 0 && segundo.length > 0) {
      return ((primero[0] ?? '') + (segundo[0] ?? '')).toUpperCase();
    }
    if (primero && primero.length > 0) {
      return primero.slice(0, 2).toUpperCase();
    }
  }
  if (correo && correo.includes('@')) {
    const usuario = correo.split('@')[0];
    if (usuario && usuario.length > 0) {
      return usuario.slice(0, 2).toUpperCase();
    }
  }
  return 'VP';
}

export interface BarraModulosProps {
  sesionInicial?: SesionActual | null;
}

export function BarraModulos({ sesionInicial }: BarraModulosProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const { sesion } = usePermisos(sesionInicial);
  const { esDemo, alternarDemo, desactivarDemo } = useModoDemo();

  const [modoTema, setModoTema] = useState<ModoTema>('system');
  const [_densidadVisual, setDensidadVisual] = useState<DensidadVisual>('comoda');
  const [esOscuroEfectivo, setEsOscuroEfectivo] = useState(false);
  const [barraExpandida, setBarraExpandida] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [masAbierta, setMasAbierta] = useState(false);
  const [panelNotifAbierto, setPanelNotifAbierto] = useState(false);
  // Fuera del modo demostración la campana parte vacía: solo muestra lo que llega de la API.
  const [notificaciones, setNotificaciones] = useState<NotificacionWeb[]>(() =>
    esModoDemo() ? generarNotificacionesIniciales(null, undefined, generarAlertasOperativas()) : [],
  );
  const avisos = useAvisosDePlazo(esDemo);
  // Ids de los archivos de viaje que existen (misma fuente que /viajes). `null` = aún no se sabe.
  // `completa` = la lista trajo menos filas que el tope, así que no está truncada. `verificados` =
  // ids que siguieron ausentes tras volver a pedir la lista: solo esos se ocultan.
  const [archivos, setArchivos] = useState<{
    ids: ReadonlySet<string>;
    completa: boolean;
    verificados: ReadonlySet<string>;
  } | null>(null);
  // Zona horaria de la agencia (R9) para componer el plazo de cada aviso.
  const [zonaAgencia, setZonaAgencia] = useState<string>(zonaOPorDefecto(null));
  const [menuSesionAbierto, setMenuSesionAbierto] = useState(false);
  const [cambiandoAgencia, setCambiandoAgencia] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  // Trampa de foco accesible y cierre con Esc para el popover de sesión
  const menuRef = useFocoModal({
    abierto: menuSesionAbierto,
    alCerrar: () => setMenuSesionAbierto(false),
  });

  const esDetalleMovil = esDetalleMovilDeBandeja(pathname);
  const idActivo = moduloActivo(pathname)?.id ?? null;
  const contadoresMenu = useContadoresDeMenu(pathname);

  // Navegar (un enlace de la hoja, la barra o el botón atrás) cierra la hoja «Más».
  useEffect(() => {
    setMasAbierta(false);
  }, [pathname]);

  // La lupa fija de la cabecera móvil (marco) pide abrir esta misma paleta.
  useEffect(() => {
    const abrir = () => setBusquedaAbierta(true);
    window.addEventListener(EVENTO_ABRIR_BUSQUEDA_GLOBAL, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_BUSQUEDA_GLOBAL, abrir);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prefs = cargarPreferenciasTema();
      setModoTema(prefs.tema);
      setDensidadVisual(prefs.densidad);
      const sistemaOscuro = consultarPreferenciaSistemaOscuro();
      setEsOscuroEfectivo(resolverTemaEfectivo(prefs.tema, sistemaOscuro) === 'dark');

      // Preferencia guardada manda; sin ella, el menú parte expandido en escritorio (>= 1280 px) y
      // como riel con etiquetas en tablet (ADR-0032, T-440).
      const expandidaGuardada = localStorage.getItem('viajapro_sidebar_expandida');
      if (expandidaGuardada === 'true') {
        setBarraExpandida(true);
      } else if (
        expandidaGuardada === null &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(min-width: 1280px)').matches
      ) {
        setBarraExpandida(true);
      }
    }

    const desuscribirSistema = suscribirCambiosSistema((sistemaEsOscuro) => {
      const prefsActuales = cargarPreferenciasTema();
      setEsOscuroEfectivo(resolverTemaEfectivo(prefsActuales.tema, sistemaEsOscuro) === 'dark');
    });

    // 1. Cargar seguimientos pendientes del día de la API si está disponible
    void obtenerPendientesDelDiaApi()
      .then((pendientes) => {
        if (pendientes && !esModoDemo()) {
          setNotificaciones((prev) => {
            const nuevas = pendientes.vencidos.map((v) =>
              crearNotificacionSeguimientoVencido(v.id, v.descripcion),
            );
            const ids = new Set(nuevas.map((n) => n.id));
            return [...prev.filter((p) => !ids.has(p.id)), ...nuevas];
          });
        } else if (pendientes) {
          setNotificaciones((prev) => {
            const nuevas = generarNotificacionesIniciales(
              pendientes,
              undefined,
              generarAlertasOperativas(),
            );
            const idsNuevas = new Set(nuevas.map((n) => n.id));
            // Los seguimientos vencidos son los de `pendientes`: el de arranque ya no aplica.
            const previasSinDuplicados = prev.filter(
              (p) => !idsNuevas.has(p.id) && p.tipo !== 'seguimiento_vencido',
            );
            return [...previasSinDuplicados, ...nuevas];
          });
        }
      })
      .catch((err: unknown) => {
        console.warn('[campana] Sin seguimientos vencidos para avisar:', err);
      });

    // 2. Suscribirse a eventos Socket.IO en tiempo real (T-110)
    const desuscribir =
      typeof inboxSocketManager?.suscribirEvento === 'function'
        ? inboxSocketManager.suscribirEvento((evento) => {
            setNotificaciones((prev) => procesarEventoSocketNotificacion(evento, prev));
          })
        : () => {};

    return () => {
      desuscribirSistema();
      desuscribir();
    };
  }, []);

  useEffect(() => {
    if (esDemo || !estaUsandoApiReal()) return;
    let activo = true;
    void obtenerAjustesAgenciaApi().then((a) => {
      if (!activo) return;
      const zona = zonaOPorDefecto(a?.zonaHoraria);
      setZonaAgencia(zona);
      fijarZonaAgencia(zona);
    });
    return () => {
      activo = false;
    };
  }, [esDemo]);

  // Los avisos y alertas que apuntan a un archivo (`/viajes?id=`) solo valen si ese archivo existe.
  const hayEnlacesAArchivos =
    notificaciones.some((n) => archivoIdDeHref(n.href) !== null) ||
    (avisos.estado.tipo === 'listo' && avisos.estado.lista.datos.length > 0);
  useEffect(() => {
    if (!hayEnlacesAArchivos) return;
    let vigente = true;
    listarArchivos('TODOS')
      .then((lista) => {
        if (vigente) {
          setArchivos({
            ids: new Set(lista.map((a) => a.id)),
            completa: lista.length < LIMITE_LISTA_ARCHIVOS,
            verificados: new Set(),
          });
        }
      })
      .catch((err: unknown) => {
        // Sin la lista no se sabe qué existe: no se esconde nada (ver soloConArchivoExistente).
        console.warn('[campana] Sin lista de archivos para validar los avisos:', err);
      });
    return () => {
      vigente = false;
    };
  }, [hayEnlacesAArchivos, esDemo]);

  const abrirPanelNotificaciones = () => {
    setPanelNotifAbierto(true);
    avisos.refrescarSiEstaViejo();
  };

  const alternarSidebar = () => {
    setBarraExpandida((prev) => {
      const nuevo = !prev;
      if (typeof window !== 'undefined') {
        localStorage.setItem('viajapro_sidebar_expandida', String(nuevo));
      }
      return nuevo;
    });
  };

  // Atajo global Cmd+K / Ctrl+K y Alt+S para alternar barra lateral
  useEffect(() => {
    const manejarAtajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBusquedaAbierta((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        alternarSidebar();
      }
    };
    window.addEventListener('keydown', manejarAtajo);
    return () => window.removeEventListener('keydown', manejarAtajo);
  }, []);

  const alternarTema = () => {
    const orden: ModoTema[] = ['light', 'dark', 'system'];
    const idx = orden.indexOf(modoTema);
    const siguiente = orden[(idx + 1) % orden.length] ?? 'system';
    guardarModoTema(siguiente);
    setModoTema(siguiente);
    const sistemaOscuro = consultarPreferenciaSistemaOscuro();
    setEsOscuroEfectivo(resolverTemaEfectivo(siguiente, sistemaOscuro) === 'dark');
  };

  const manejarMarcarLeida = (id: string) => {
    if (esAvisoDePlazo(id)) {
      avisos.marcarLeido(idDeAviso(id));
      return;
    }
    setNotificaciones((prev) => marcarNotificacionLeida(prev, id));
  };

  const manejarMarcarTodasLeidas = () => {
    setNotificaciones((prev) => marcarTodasNotificacionesLeidas(prev));
    for (const a of avisosWeb) if (!a.leida) avisos.marcarLeido(idDeAviso(a.id));
  };

  const manejarDescartar = (id: string) => {
    // Un aviso del servidor no se borra: descartarlo es marcarlo leído.
    if (esAvisoDePlazo(id)) {
      avisos.marcarLeido(idDeAviso(id));
      return;
    }
    setNotificaciones((prev) => descartarNotificacion(prev, id));
  };

  const manejarCambioAgencia = async (tenantId: string) => {
    if (tenantId === sesion?.tenantActivoId) return;
    try {
      setCambiandoAgencia(tenantId);
      await cambiarAgenciaActivaApi(tenantId);
      setMenuSesionAbierto(false);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err) {
      console.error('Error al cambiar agencia', err);
    } finally {
      setCambiandoAgencia(null);
    }
  };

  const manejarCerrarSesion = async () => {
    try {
      setCerrandoSesion(true);
      inboxSocketManager.desconectar();
      await cerrarSesionApi();
      setMenuSesionAbierto(false);
      router.push('/ingresar');
    } catch (err) {
      console.error('Error al cerrar sesión', err);
    } finally {
      setCerrandoSesion(false);
    }
  };

  const avisosWeb: NotificacionWeb[] =
    avisos.estado.tipo === 'listo'
      ? avisos.estado.lista.datos.map((n) => adaptarAvisoANotificacionWeb(n, zonaAgencia))
      : [];
  // Una sola lista y una sola cuenta (T-322): la campana, el encabezado del desplegable y sus
  // pestañas leen `resumirNotificaciones` de esta misma lista, ya sin avisos de archivos que no existen.
  const todasLasNotificaciones = [...avisosWeb, ...notificaciones];
  const desconocidos = archivos?.completa
    ? archivosDesconocidos(todasLasNotificaciones, archivos.ids, archivos.verificados)
    : [];
  const claveDesconocidos = desconocidos.join('|');
  const notificacionesConAvisos = soloConArchivoExistente(
    todasLasNotificaciones,
    archivos?.completa ? archivos.ids : null,
    archivos?.verificados,
  );
  const conteoNoLeidas = resumirNotificaciones(notificacionesConAvisos).total;

  // Un archivo desconocido puede ser nuevo (creado tras la carga): se vuelve a pedir la lista UNA
  // vez por ráfaga y solo entonces se decide ocultarlo. Si la recarga falla o la lista resulta
  // truncada, se muestra todo (`completa: false`) y no se reintenta en bucle.
  useEffect(() => {
    if (!claveDesconocidos) return;
    const idsPorVerificar = claveDesconocidos.split('|');
    let vigente = true;
    listarArchivos('TODOS')
      .then((lista) => {
        if (!vigente) return;
        setArchivos((previo) =>
          previo
            ? {
                ids: new Set(lista.map((a) => a.id)),
                completa: lista.length < LIMITE_LISTA_ARCHIVOS,
                verificados: new Set([...previo.verificados, ...idsPorVerificar]),
              }
            : previo,
        );
      })
      .catch((err: unknown) => {
        console.warn(
          '[campana] No se pudo recargar la lista de archivos; se muestran los avisos:',
          err,
        );
        if (vigente) setArchivos((previo) => (previo ? { ...previo, completa: false } : previo));
      });
    return () => {
      vigente = false;
    };
  }, [claveDesconocidos]);

  const nombreUsuario = sesion?.identidad?.nombre ?? (esDemo ? 'Asesor ViajaPro' : 'Tu cuenta');
  const correoUsuario = sesion?.identidad?.correo ?? (esDemo ? 'asesor@viajapro.com' : '');
  const rolUsuario = sesion?.acceso?.rol ?? (esDemo ? 'Asesor Comercial' : '');
  const iniciales = calcularIniciales(sesion?.identidad?.nombre, sesion?.identidad?.correo);
  const agenciaActiva =
    sesion?.agencias?.find((a) => a.id === sesion.tenantActivoId) ?? sesion?.agencias?.[0];
  const nombreAgenciaActiva = agenciaActiva?.nombre ?? 'ViajaPro';

  // Solo oculta: la autorización real es de la API. Sin sesión (carga o demostración) se muestra todo.
  const tieneElPermiso = sesion ? (permiso: Permiso) => tienePermiso(sesion, permiso) : null;
  const modulos = entradasDelMenu()
    .filter((m) => !tieneElPermiso || esVisiblePara(m, tieneElPermiso))
    .map((m) => entradaParaUsuario(m, tieneElPermiso));
  const modulosDeLaHoja = entradasDeHojaMas()
    .filter((m) => !tieneElPermiso || esVisiblePara(m, tieneElPermiso))
    .map((m) => entradaParaUsuario(m, tieneElPermiso));

  return (
    <>
      {/* 1. Barra Lateral de Escritorio (>=768px, expandible/contraíble) */}
      <aside
        className={`hidden h-full shrink-0 flex-col justify-between gap-3 overflow-x-hidden overflow-y-auto border-r border-neutral-200 bg-white py-3 transition-[width] duration-300 ease-in-out select-none motion-reduce:transition-none md:flex dark:border-neutral-800 dark:bg-neutral-900 ${
          barraExpandida
            ? 'w-60 px-3'
            : // Riel con etiquetas (tablet y cualquier dispositivo táctil); solo icono con ratón en escritorio.
              'w-24 items-center px-1 [@media(pointer:fine)_and_(min-width:1280px)]:w-14'
        }`}
        aria-label="Barra de módulos lateral"
        data-testid="sidebar-escritorio"
        data-expandida={barraExpandida ? 'true' : 'false'}
      >
        {/* Top: Logo, Toggle, Buscador y Módulos */}
        <div className="flex w-full flex-col space-y-3">
          {/* Cabecera de la Barra: Logo + Botón Toggle */}
          {barraExpandida ? (
            <div className="flex w-full items-center justify-between px-1">
              <Link
                href="/"
                title="ViajaPro — CRM Turístico"
                className="focus-visible:ring-acento-600 flex items-center gap-2.5 overflow-hidden rounded-xl focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="bg-acento-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-xs">
                  <Plane className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    ViajaPro
                  </span>
                  <span className="block truncate text-[10px] text-neutral-400">
                    {nombreAgenciaActiva}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={alternarSidebar}
                data-testid="boton-toggle-sidebar"
                title="Contraer barra lateral (Alt+S)"
                aria-label="Contraer barra lateral"
                aria-expanded="true"
                className="focus-visible:ring-acento-600 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center space-y-2">
              <Link
                href="/"
                title="ViajaPro — CRM Turístico"
                className="bg-acento-700 focus-visible:ring-acento-600 flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
              >
                <Plane className="h-5 w-5" />
              </Link>
              <button
                type="button"
                onClick={alternarSidebar}
                data-testid="boton-toggle-sidebar"
                title="Expandir barra lateral (Alt+S)"
                aria-label="Expandir barra lateral"
                aria-expanded="false"
                className="focus-visible:ring-acento-600 flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Botón Buscador Global (Cmd+K) */}
          {barraExpandida ? (
            <button
              type="button"
              onClick={() => setBusquedaAbierta(true)}
              title="Búsqueda Global y Comandos (Cmd+K / Ctrl+K)"
              aria-label="Abrir paleta de comandos (Cmd+K)"
              className="focus-visible:ring-acento-600 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4 text-neutral-400" />
                <span>Buscar o comandos...</span>
              </span>
              <kbd className="rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
                ⌘K
              </kbd>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBusquedaAbierta(true)}
              title="Búsqueda Global omnicanal (Cmd+K / Ctrl+K)"
              aria-label="Abrir buscador global (Cmd+K)"
              className="group focus-visible:ring-acento-600 relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          {/* Indicador de Estado: Modo Real vs Modo Demo */}
          {esDemo ? (
            barraExpandida ? (
              <button
                type="button"
                onClick={() => desactivarDemo()}
                title="Modo Demostración activo. Haz clic para salir y conectar la API real."
                aria-label="Salir del modo demostración"
                data-testid="boton-modo-demo-barra"
                className="flex w-full items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-300"
              >
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                  <span className="text-[11px] font-semibold">Modo Demo</span>
                </span>
                <span className="text-[10px] underline">Salir</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => desactivarDemo()}
                title="Modo Demostración activo (datos simulados). Haz clic para salir y conectar la API real."
                aria-label="Salir del modo demostración"
                data-testid="boton-modo-demo-barra"
                className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/60 dark:text-amber-300"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              </button>
            )
          ) : barraExpandida ? (
            <div
              title={'API Conectada: ' + nombreAgenciaActiva}
              aria-label={'API Conectada: ' + nombreAgenciaActiva}
              data-testid="indicador-api-conectada"
              className="flex w-full items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-[11px] font-medium">API Conectada</span>
            </div>
          ) : (
            <div
              title={'API Conectada: ' + nombreAgenciaActiva}
              aria-label={'API Conectada: ' + nombreAgenciaActiva}
              data-testid="indicador-api-conectada"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          )}

          {/* Separador */}
          <div
            className={
              barraExpandida
                ? 'h-px w-full bg-neutral-200 dark:bg-neutral-800'
                : 'h-px w-8 bg-neutral-200 dark:bg-neutral-800'
            }
          />

          {/* Lista de Módulos */}
          <nav className="flex w-full flex-col space-y-1">
            {modulos.map((m) => {
              const Icon = m.icono;
              const claveColor = CLAVE_DE_COLOR[m.id];
              const config = claveColor ? CONFIGURACION_MODULOS[claveColor] : undefined;
              const nombre =
                m.id === 'hoy'
                  ? nombreAccesibleConContador(
                      m.etiqueta,
                      contadoresMenu?.hoy ?? 0,
                      'pendiente',
                      'pendientes',
                    )
                  : m.id === 'seguimientos'
                    ? nombreAccesibleConContador(
                        m.etiqueta,
                        contadoresMenu?.seguimientosVencidos ?? 0,
                        'vencido',
                        'vencidos',
                      )
                    : m.etiqueta;
              const cifra =
                m.id === 'hoy'
                  ? (contadoresMenu?.hoy ?? 0)
                  : m.id === 'seguimientos'
                    ? (contadoresMenu?.seguimientosVencidos ?? 0)
                    : 0;

              return (
                <Link
                  key={m.id}
                  href={m.ruta}
                  title={nombre}
                  aria-label={nombre}
                  aria-current={m.id === idActivo ? 'page' : undefined}
                  className={`focus-visible:ring-acento-600 relative flex items-center rounded-xl transition-all duration-200 focus-visible:ring-2 focus-visible:outline-none ${
                    barraExpandida
                      ? `objetivo h-10 w-full gap-2.5 px-2.5 ${
                          m.id === idActivo
                            ? 'border-l-4 border-[#c9a24b] bg-sky-50 font-semibold text-sky-950 shadow-2xs dark:bg-sky-950/60 dark:text-sky-100'
                            : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                        }`
                      : `min-h-[44px] w-full flex-col justify-center gap-0.5 py-1.5 [@media(pointer:fine)_and_(min-width:1280px)]:h-11 [@media(pointer:fine)_and_(min-width:1280px)]:w-11 [@media(pointer:fine)_and_(min-width:1280px)]:min-w-[44px] [@media(pointer:fine)_and_(min-width:1280px)]:py-0 ${
                          m.id === idActivo
                            ? 'bg-sky-50 font-semibold text-sky-700 shadow-xs ring-2 ring-[#c9a24b] dark:bg-sky-950/60 dark:text-sky-300'
                            : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                        }`
                  }`}
                >
                  <div
                    className={
                      barraExpandida
                        ? `flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            config
                              ? `${config.claseBgSuave} ${config.claseTexto}`
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                          }`
                        : 'shrink-0'
                    }
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  {barraExpandida ? (
                    <span className="truncate text-xs">{m.etiqueta}</span>
                  ) : (
                    <span
                      aria-hidden="true"
                      data-testid={`etiqueta-riel-${m.id}`}
                      className="block w-full truncate text-center text-xs leading-tight [@media(pointer:fine)_and_(min-width:1280px)]:hidden"
                    >
                      {etiquetaDeBarra(m)}
                    </span>
                  )}
                  {cifra > 0 && (
                    <span
                      aria-hidden="true"
                      data-testid={`contador-menu-${m.id}`}
                      className={`flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-bold text-white ${
                        barraExpandida ? 'ml-auto' : 'absolute -top-0.5 -right-0.5'
                      }`}
                    >
                      {cifra > 99 ? '99+' : cifra}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Campana + Meta + Tema + Perfil Asesor */}
        <div className="flex w-full flex-col space-y-2">
          {barraExpandida ? (
            <div className="flex w-full flex-col space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-800">
              {/* Acciones rápidas en fila: Notificaciones + Tema + Meta */}
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={abrirPanelNotificaciones}
                  title={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
                  aria-label={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
                  className="focus-visible:ring-acento-600 relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  <Bell className="h-4 w-4" />
                  {conteoNoLeidas > 0 && (
                    <span
                      data-testid="contador-campana"
                      className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] leading-none font-bold text-white"
                    >
                      {conteoNoLeidas > 99 ? '99+' : conteoNoLeidas}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={alternarTema}
                  data-testid="boton-alternar-tema"
                  title={
                    modoTema === 'dark'
                      ? 'Tema Oscuro (clic para cambiar a Sistema)'
                      : modoTema === 'light'
                        ? 'Tema Claro (clic para cambiar a Oscuro)'
                        : `Tema Sistema (${esOscuroEfectivo ? 'Oscuro' : 'Claro'})`
                  }
                  aria-label={
                    modoTema === 'dark'
                      ? 'Cambiar a modo sistema (tema oscuro activo)'
                      : modoTema === 'light'
                        ? 'Cambiar a modo oscuro (tema claro activo)'
                        : 'Cambiar a modo claro (tema del sistema activo)'
                  }
                  className="focus-visible:ring-acento-600 flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800"
                >
                  {modoTema === 'dark' ? (
                    <Moon className="h-4 w-4 text-indigo-400" />
                  ) : modoTema === 'light' ? (
                    <Sun className="h-4 w-4 text-amber-500" />
                  ) : (
                    <Laptop className="h-4 w-4 text-neutral-500" />
                  )}
                </button>
              </div>

              {/* Tarjeta de Perfil del Asesor */}
              <button
                type="button"
                onClick={() => setMenuSesionAbierto((prev) => !prev)}
                title={'Perfil y sesión: ' + nombreUsuario}
                aria-label={'Perfil y sesión: ' + nombreUsuario}
                aria-haspopup="dialog"
                aria-expanded={menuSesionAbierto}
                data-testid="boton-avatar-sesion"
                className="focus-visible:ring-acento-600 flex w-full items-center gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50/80 p-2 text-left transition hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:bg-neutral-800"
              >
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                  {iniciales}
                  <span className="bg-ok-500 absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-white dark:border-neutral-900" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-neutral-900 dark:text-neutral-100">
                    {nombreUsuario}
                  </span>
                  <span className="block truncate text-[10px] text-neutral-500 dark:text-neutral-400">
                    {rolUsuario}
                  </span>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center space-y-2.5 px-1">
              {/* Botón Campana Notificaciones */}
              <button
                type="button"
                onClick={abrirPanelNotificaciones}
                title={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
                aria-label={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
                className="focus-visible:ring-acento-600 relative flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                <Bell className="h-4 w-4" />
                {conteoNoLeidas > 0 && (
                  <span
                    data-testid="contador-campana"
                    className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] leading-none font-bold text-white"
                  >
                    {conteoNoLeidas > 99 ? '99+' : conteoNoLeidas}
                  </span>
                )}
              </button>

              {/* Interruptor modo oscuro y tema */}
              <button
                type="button"
                onClick={alternarTema}
                data-testid="boton-alternar-tema-colapsado"
                title={
                  modoTema === 'dark'
                    ? 'Tema Oscuro (clic para cambiar a Sistema)'
                    : modoTema === 'light'
                      ? 'Tema Claro (clic para cambiar a Oscuro)'
                      : `Tema Sistema (${esOscuroEfectivo ? 'Oscuro' : 'Claro'})`
                }
                aria-label={
                  modoTema === 'dark'
                    ? 'Cambiar a modo sistema (tema oscuro activo)'
                    : modoTema === 'light'
                      ? 'Cambiar a modo oscuro (tema claro activo)'
                      : 'Cambiar a modo claro (tema del sistema activo)'
                }
                className="focus-visible:ring-acento-600 flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                {modoTema === 'dark' ? (
                  <Moon className="h-4 w-4 text-indigo-400" />
                ) : modoTema === 'light' ? (
                  <Sun className="h-4 w-4 text-amber-500" />
                ) : (
                  <Laptop className="h-4 w-4 text-neutral-500" />
                )}
              </button>

              {/* Separador */}
              <div className="h-px w-8 bg-neutral-200 dark:bg-neutral-800" />

              {/* Avatar Asesor y Menú de Sesión */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuSesionAbierto((prev) => !prev)}
                  title={'Perfil y sesión: ' + nombreUsuario + ' (' + nombreAgenciaActiva + ')'}
                  aria-label={'Perfil y sesión: ' + nombreUsuario}
                  aria-haspopup="dialog"
                  aria-expanded={menuSesionAbierto}
                  data-testid="boton-avatar-sesion"
                  className="focus-visible:ring-acento-600 relative flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {iniciales}
                    <span className="bg-ok-500 absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-900" />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Barra inferior móvil (<768px): Hoy · Conversaciones · Cotizar · Archivos · Más (T-320) */}
      {!esDetalleMovil && (
        <BarraInferiorMovil
          idActivo={idActivo}
          pathname={pathname}
          contadorHoy={contadoresMenu?.hoy ?? null}
          masAbierta={masAbierta}
          alAbrirMas={() => setMasAbierta(true)}
        />
      )}

      {/* Hoja «Más»: el resto de módulos, la campana y el perfil. */}
      {!esDetalleMovil && (
        <HojaMas
          abierta={masAbierta}
          alCerrar={() => setMasAbierta(false)}
          modulos={modulosDeLaHoja}
          idActivo={idActivo}
          seguimientosVencidos={contadoresMenu?.seguimientosVencidos ?? null}
          noLeidas={conteoNoLeidas}
          nombreUsuario={nombreUsuario}
          iniciales={iniciales}
          alAbrirNotificaciones={() => {
            setMasAbierta(false);
            abrirPanelNotificaciones();
          }}
          alAbrirPerfil={() => {
            setMasAbierta(false);
            setMenuSesionAbierto(true);
          }}
        />
      )}

      {/* Popover / Menú Desplegable de Sesión y Agencia Activa (ADR-0011) */}
      {menuSesionAbierto && (
        <>
          {/* Telón de fondo */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setMenuSesionAbierto(false)}
            aria-hidden="true"
            data-testid="telon-perfil-sesion"
          />

          <div
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Perfil y sesión"
            data-testid="dialogo-perfil-sesion"
            className="fixed right-4 bottom-16 left-4 z-50 w-[calc(100%-2rem)] max-w-xs rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl transition-all md:bottom-3 md:left-16 md:w-80 dark:border-neutral-800 dark:bg-neutral-900"
          >
            {/* Cabecera de Usuario */}
            <div className="flex items-center space-x-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="bg-acento-100 text-acento-800 dark:bg-acento-950 dark:text-acento-300 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {iniciales}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100"
                  data-testid="nombre-usuario-sesion"
                >
                  {nombreUsuario}
                </p>
                <p
                  className="truncate text-xs text-neutral-500 dark:text-neutral-400"
                  data-testid="correo-usuario-sesion"
                >
                  {correoUsuario}
                </p>
                <div className="mt-1 flex items-center space-x-1.5">
                  <span
                    className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    data-testid="rol-usuario-sesion"
                  >
                    {rolUsuario}
                  </span>
                  <span className="bg-ok-50 text-ok-700 dark:bg-ok-950/60 dark:text-ok-400 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                    En línea
                  </span>
                </div>
              </div>
            </div>

            {/* Agencia Activa / Selector Multiagencia */}
            <div className="mt-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span className="flex items-center space-x-1 font-medium">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Agencia activa</span>
                </span>
                {sesion?.agencias && sesion.agencias.length > 1 && (
                  <span className="font-mono text-[10px] text-neutral-400">
                    ({sesion.agencias.length} disponibles)
                  </span>
                )}
              </div>

              {/* Si solo tiene 1 agencia */}
              {!sesion?.agencias || sesion.agencias.length <= 1 ? (
                <div
                  className="mt-1.5 flex items-center justify-between rounded-lg bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-200"
                  data-testid="indicador-agencia-unica"
                >
                  <span className="truncate">{nombreAgenciaActiva}</span>
                  <span className="bg-ok-500 h-1.5 w-1.5 rounded-full" />
                </div>
              ) : (
                /* Selector Multiagencia (ADR-0011 §2 / Rebanada 3) */
                <div
                  className="mt-2 space-y-1"
                  role="radiogroup"
                  aria-label="Seleccionar agencia activa"
                  data-testid="selector-agencias-sesion"
                >
                  {sesion.agencias.map((agencia) => {
                    const esActiva = agencia.id === sesion.tenantActivoId;
                    return (
                      <button
                        key={agencia.id}
                        type="button"
                        role="radio"
                        aria-checked={esActiva}
                        disabled={cambiandoAgencia !== null}
                        onClick={() => {
                          void manejarCambioAgencia(agencia.id);
                        }}
                        data-testid={'opcion-agencia-' + agencia.id}
                        className={
                          'focus-visible:ring-acento-600 flex min-h-[44px] w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
                          (esActiva
                            ? 'bg-acento-50 text-acento-800 dark:bg-acento-950/60 dark:text-acento-300 font-semibold'
                            : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800')
                        }
                      >
                        <span className="truncate">{agencia.nombre}</span>
                        {esActiva ? (
                          <Check className="text-acento-700 dark:text-acento-400 h-4 w-4 shrink-0" />
                        ) : cambiandoAgencia === agencia.id ? (
                          <span className="animate-pulse text-[10px] text-neutral-400">
                            Cambiando...
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Acciones: Cerrar Sesión y Onboarding */}
            <div className="mt-3 space-y-1">
              <button
                type="button"
                onClick={() => {
                  setMenuSesionAbierto(false);
                  abrirPanelNotificaciones();
                }}
                data-testid="boton-abrir-notificaciones-perfil"
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <span className="flex items-center gap-2">
                  <Bell className="text-acento-600 dark:text-acento-400 h-4 w-4" />
                  <span>Notificaciones y Alertas</span>
                </span>
                {conteoNoLeidas > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                    {conteoNoLeidas}
                  </span>
                )}
              </button>

              <Link
                href="/bienvenida"
                onClick={() => setMenuSesionAbierto(false)}
                data-testid="enlace-asistente-onboarding"
                className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <span>Asistente de Inicio</span>
                </span>
              </Link>

              {/* Selector de Tema y Densidad Visual (T-111) */}
              <div className="border-t border-neutral-100 py-3 dark:border-neutral-800">
                <SelectorTemaDensidad
                  compacto={true}
                  onCambio={(nuevoTema, nuevaDensidad) => {
                    setModoTema(nuevoTema);
                    setDensidadVisual(nuevaDensidad);
                    const sistemaOscuro = consultarPreferenciaSistemaOscuro();
                    setEsOscuroEfectivo(resolverTemaEfectivo(nuevoTema, sistemaOscuro) === 'dark');
                  }}
                />
              </div>

              {/* Interruptor explícito de Modo Demostración */}
              <div className="flex items-center justify-between border-t border-neutral-100 py-3 dark:border-neutral-800">
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    Modo Demostración
                  </span>
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {esDemo
                      ? 'Mostrando datos simulados'
                      : 'Conectado a la API real (' + nombreAgenciaActiva + ')'}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={esDemo}
                  aria-label="Alternar modo demostración"
                  onClick={() => alternarDemo()}
                  data-testid="boton-alternar-demo"
                  className={
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ' +
                    (esDemo ? 'bg-amber-500' : 'bg-neutral-300 dark:bg-neutral-700')
                  }
                >
                  <span
                    className={
                      'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ' +
                      (esDemo ? 'translate-x-4' : 'translate-x-0')
                    }
                  />
                </button>
              </div>

              <button
                type="button"
                disabled={cerrandoSesion}
                onClick={() => {
                  void manejarCerrarSesion();
                }}
                data-testid="boton-cerrar-sesion"
                className="flex min-h-[44px] w-full items-center justify-center space-x-2 rounded-xl text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <LogOut className="h-4 w-4" />
                <span>{cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar sesión'}</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal de Búsqueda Global (Cmd+K / Ctrl+K) */}
      <ModalBusquedaGlobal abierto={busquedaAbierta} alCerrar={() => setBusquedaAbierta(false)} />

      {/* Panel Desplegable de Notificaciones y Alertas Operativas */}
      <PanelNotificaciones
        abierto={panelNotifAbierto}
        alCerrar={() => setPanelNotifAbierto(false)}
        notificaciones={notificacionesConAvisos}
        estadoAvisos={avisos.estado.tipo}
        alReintentarAvisos={() => void avisos.refrescar()}
        alMarcarLeida={manejarMarcarLeida}
        alMarcarTodasLeidas={manejarMarcarTodasLeidas}
        alDescartar={manejarDescartar}
      />
    </>
  );
}
