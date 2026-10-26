'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MessageSquare,
  Kanban,
  FileText,
  Briefcase,
  Users,
  Package,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Plane,
  TrendingUp,
  Search,
  Bell,
  Building2,
  Check,
  LogOut,
} from 'lucide-react';
import type { SesionActual } from '@viajapro/contracts';
import { ModalBusquedaGlobal } from '../busqueda/modal-busqueda-global';
import { PanelNotificaciones } from '../notificaciones/panel-notificaciones';
import {
  generarAlertasOperativas,
  marcarAlertaLeida,
  contarAlertasNoLeidas,
  type AlertaOperativa,
} from '../../lib/notificaciones-logica';
import { usePermisos } from '../../lib/permisos';
import { useModoDemo } from '../../lib/modo-demo';
import { cambiarAgenciaActivaApi, cerrarSesionApi } from '../../lib/auth-api';
import { inboxSocketManager } from '../../lib/inbox-socket';
import { useFocoModal } from '../../lib/use-foco-modal';

interface ModuloItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activo: boolean;
  disponible: boolean;
}

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

  const [modoOscuro, setModoOscuro] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [panelNotifAbierto, setPanelNotifAbierto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaOperativa[]>([]);
  const [menuSesionAbierto, setMenuSesionAbierto] = useState(false);
  const [cambiandoAgencia, setCambiandoAgencia] = useState<string | null>(null);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  // Trampa de foco accesible y cierre con Esc para el popover de sesión
  const menuRef = useFocoModal({
    abierto: menuSesionAbierto,
    alCerrar: () => setMenuSesionAbierto(false),
  });

  const esDetalleMovil = Boolean(
    pathname && pathname !== '/bandeja' && pathname.startsWith('/bandeja/'),
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const guardado = localStorage.getItem('viajapro_tema');
      if (guardado === 'dark' || document.documentElement.classList.contains('dark')) {
        setModoOscuro(true);
        document.documentElement.classList.add('dark');
      }
    }
    // Inicializar alertas operativas
    setAlertas(generarAlertasOperativas());
  }, []);

  // Atajo global Cmd+K / Ctrl+K
  useEffect(() => {
    const manejarAtajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBusquedaAbierta((prev) => !prev);
      }
    };
    window.addEventListener('keydown', manejarAtajo);
    return () => window.removeEventListener('keydown', manejarAtajo);
  }, []);

  const alternarTema = () => {
    const nuevo = !modoOscuro;
    setModoOscuro(nuevo);
    if (nuevo) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('viajapro_tema', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('viajapro_tema', 'light');
    }
  };

  const manejarMarcarLeida = (id: string) => {
    setAlertas((prev) => marcarAlertaLeida(prev, id));
  };

  const manejarMarcarTodasLeidas = () => {
    setAlertas((prev) => prev.map((a) => ({ ...a, leida: true })));
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

  const conteoNoLeidas = contarAlertasNoLeidas(alertas);

  const nombreUsuario = sesion?.identidad?.nombre ?? 'Asesor ViajaPro';
  const correoUsuario = sesion?.identidad?.correo ?? 'asesor@viajapro.com';
  const rolUsuario = sesion?.acceso?.rol ?? 'Asesor Comercial';
  const iniciales = calcularIniciales(sesion?.identidad?.nombre, sesion?.identidad?.correo);
  const agenciaActiva =
    sesion?.agencias?.find((a) => a.id === sesion.tenantActivoId) ?? sesion?.agencias?.[0];
  const nombreAgenciaActiva = agenciaActiva?.nombre ?? 'ViajaPro';

  const modulos: ModuloItem[] = [
    {
      id: 'bandeja',
      label: 'Bandeja de WhatsApp',
      href: '/bandeja',
      icon: MessageSquare,
      activo: pathname.startsWith('/bandeja'),
      disponible: true,
    },
    {
      id: 'pipeline',
      label: 'Pipeline / Oportunidades',
      href: '/pipeline',
      icon: Kanban,
      activo: pathname === '/pipeline',
      disponible: true,
    },
    {
      id: 'cotizador',
      label: 'Cotizador de Paquetes',
      href: '/cotizador',
      icon: FileText,
      activo: pathname === '/cotizador',
      disponible: true,
    },
    {
      id: 'viajes',
      label: 'Archivos de Viaje (TravelFiles)',
      href: '/viajes',
      icon: Briefcase,
      activo: pathname.startsWith('/viajes'),
      disponible: true,
    },
    {
      id: 'contactos',
      label: 'Contactos y Viajeros',
      href: '/contactos',
      icon: Users,
      activo: pathname.startsWith('/contactos'),
      disponible: true,
    },
    {
      id: 'catalogo',
      label: 'Catálogo de Mayoristas',
      href: '/catalogo',
      icon: Package,
      activo: pathname.startsWith('/catalogo'),
      disponible: true,
    },
    {
      id: 'reportes',
      label: 'Reportes y Cierres',
      href: '/reportes',
      icon: BarChart3,
      activo: pathname.startsWith('/reportes'),
      disponible: true,
    },
    {
      id: 'configuracion',
      label: 'Configuración de Agencia',
      href: '/configuracion',
      icon: Settings,
      activo: pathname.startsWith('/configuracion'),
      disponible: true,
    },
  ];

  return (
    <>
      {/* 1. Barra Lateral de Escritorio (>=768px, ancho 56px fijo) */}
      <aside
        className="hidden h-full w-14 shrink-0 flex-col items-center justify-between border-r border-neutral-200 bg-white py-3 select-none md:flex dark:border-neutral-800 dark:bg-neutral-900"
        aria-label="Barra de módulos lateral"
      >
        {/* Top: Logo & Módulos */}
        <div className="flex w-full flex-col items-center space-y-3">
          {/* Logo */}
          <Link
            href="/bandeja"
            title="ViajaPro — CRM Turístico"
            className="bg-acento-700 focus-visible:ring-acento-600 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none"
          >
            <Plane className="h-5 w-5" />
          </Link>

          {/* Botón Buscador Global (Cmd+K) */}
          <button
            type="button"
            onClick={() => setBusquedaAbierta(true)}
            title="Búsqueda Global omnicanal (Cmd+K / Ctrl+K)"
            aria-label="Abrir buscador global (Cmd+K)"
            className="group focus-visible:ring-acento-600 relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Search className="h-4 w-4" />
          </button>

          {/* Indicador de Estado: Modo Real vs Modo Demo */}
          {esDemo ? (
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
          <div className="h-px w-8 bg-neutral-200 dark:bg-neutral-800" />

          {/* Lista de Módulos */}
          <nav className="flex w-full flex-col items-center space-y-1 px-1">
            {modulos.map((m) => {
              const Icon = m.icon;
              if (!m.disponible) {
                return (
                  <div
                    key={m.id}
                    title={m.label + ' (Próximamente)'}
                    className="group relative flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg text-neutral-400 opacity-60 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                );
              }

              return (
                <Link
                  key={m.id}
                  href={m.href}
                  title={m.label}
                  aria-label={m.label}
                  className={
                    'focus-visible:ring-acento-600 flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
                    (m.activo
                      ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200')
                  }
                >
                  <Icon className="h-5 w-5" />
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Campana + Meta de Cierres + Tema + Perfil */}
        <div className="flex w-full flex-col items-center space-y-2.5 px-1">
          {/* Botón Campana Notificaciones */}
          <button
            type="button"
            onClick={() => setPanelNotifAbierto(true)}
            title={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
            aria-label={'Alertas operativas (' + conteoNoLeidas + ' pendientes)'}
            className="focus-visible:ring-acento-600 relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Bell className="h-4 w-4" />
            {conteoNoLeidas > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
            )}
          </button>

          {/* Meta de cierres compacta */}
          <div
            title="Meta de cierres: $42.5M de $60M COP (71% completado)"
            className="group border-ok-200 bg-ok-50/50 dark:border-ok-900/50 dark:bg-ok-950/30 relative flex h-9 w-9 cursor-help flex-col items-center justify-center rounded-lg border p-0.5 text-center transition-colors"
          >
            <TrendingUp className="text-ok-600 dark:text-ok-400 h-3 w-3" />
            <span className="cifra text-ok-700 dark:text-ok-300 text-[8px] leading-none font-bold">
              71%
            </span>
          </div>

          {/* Interruptor modo oscuro */}
          <button
            type="button"
            onClick={alternarTema}
            title={modoOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={modoOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="focus-visible:ring-acento-600 flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            {modoOscuro ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
              className="focus-visible:ring-acento-600 relative flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:outline-none dark:bg-neutral-700 dark:text-neutral-200"
            >
              {iniciales}
              <span className="bg-ok-500 absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-900" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Barra de Navegación Inferior Móvil (<768px, WCAG 2.5.5 Touch Target >= 44px) */}
      {!esDetalleMovil && (
        <nav
          aria-label="Navegación móvil inferior"
          className="fixed right-0 bottom-0 left-0 z-40 flex h-14 items-center justify-around border-t border-neutral-200 bg-white/95 px-2 shadow-lg backdrop-blur-md md:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
        >
          {/* P0: Bandeja */}
          <Link
            href="/bandeja"
            title="Bandeja de WhatsApp"
            aria-label="Bandeja de WhatsApp"
            className={
              'focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
              (pathname.startsWith('/bandeja')
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800')
            }
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Bandeja</span>
          </Link>

          {/* P0: Pipeline */}
          <Link
            href="/pipeline"
            title="Pipeline de Oportunidades"
            aria-label="Pipeline de Oportunidades"
            className={
              'focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
              (pathname === '/pipeline'
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800')
            }
          >
            <Kanban className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Pipeline</span>
          </Link>

          {/* P0: Cotizador */}
          <Link
            href="/cotizador"
            title="Cotizador de Paquetes"
            aria-label="Cotizador de Paquetes"
            className={
              'focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
              (pathname === '/cotizador'
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800')
            }
          >
            <FileText className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Cotizar</span>
          </Link>

          {/* P1: Viajes */}
          <Link
            href="/viajes"
            title="Archivos de Viaje"
            aria-label="Archivos de Viaje"
            className={
              'focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ' +
              (pathname.startsWith('/viajes')
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800')
            }
          >
            <Briefcase className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Viajes</span>
          </Link>

          {/* Buscador / Más */}
          <button
            type="button"
            onClick={() => setBusquedaAbierta(true)}
            title="Buscar o abrir menú (Cmd+K)"
            aria-label="Buscar o abrir menú global"
            className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <Search className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Buscar</span>
          </button>

          {/* Perfil Móvil */}
          <button
            type="button"
            onClick={() => setMenuSesionAbierto(true)}
            title={'Perfil y sesión (' + nombreUsuario + ')'}
            aria-label={'Perfil y sesión (' + nombreUsuario + ')'}
            data-testid="boton-perfil-movil"
            className="focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            <div className="relative flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
              {iniciales}
            </div>
            <span className="text-[9px] leading-tight font-medium">Perfil</span>
          </button>
        </nav>
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

            {/* Acciones: Cerrar Sesión */}
            <div className="mt-3">
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
        alertas={alertas}
        alMarcarLeida={manejarMarcarLeida}
        alMarcarTodasLeidas={manejarMarcarTodasLeidas}
      />
    </>
  );
}
