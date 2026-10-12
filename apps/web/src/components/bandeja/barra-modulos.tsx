'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { ModalBusquedaGlobal } from '../busqueda/modal-busqueda-global';
import { PanelNotificaciones } from '../notificaciones/panel-notificaciones';
import {
  generarAlertasOperativas,
  marcarAlertaLeida,
  contarAlertasNoLeidas,
  type AlertaOperativa,
} from '../../lib/notificaciones-logica';

interface ModuloItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  activo: boolean;
  disponible: boolean;
}

export function BarraModulos() {
  const pathname = usePathname();
  const [modoOscuro, setModoOscuro] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [panelNotifAbierto, setPanelNotifAbierto] = useState(false);
  const [alertas, setAlertas] = useState<AlertaOperativa[]>([]);

  const esDetalleMovil = pathname !== '/bandeja' && pathname.startsWith('/bandeja/');

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

  const conteoNoLeidas = contarAlertasNoLeidas(alertas);

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
                    title={`${m.label} (Próximamente)`}
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
                  className={`focus-visible:ring-acento-600 flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:ring-2 focus-visible:outline-none ${
                    m.activo
                      ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                  }`}
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
            title={`Alertas operativas (${conteoNoLeidas} pendientes)`}
            aria-label={`Alertas operativas (${conteoNoLeidas} pendientes)`}
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

          {/* Avatar Asesor */}
          <div
            title="Carlos Asesor (En línea)"
            className="relative flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700 select-none dark:bg-neutral-700 dark:text-neutral-200"
          >
            CA
            <span className="bg-ok-500 absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-neutral-900" />
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
            className={`focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              pathname.startsWith('/bandeja')
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Bandeja</span>
          </Link>

          {/* P0: Pipeline */}
          <Link
            href="/pipeline"
            title="Pipeline de Oportunidades"
            aria-label="Pipeline de Oportunidades"
            className={`focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              pathname === '/pipeline'
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            <Kanban className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Pipeline</span>
          </Link>

          {/* P0: Cotizador */}
          <Link
            href="/cotizador"
            title="Cotizador de Paquetes"
            aria-label="Cotizador de Paquetes"
            className={`focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              pathname === '/cotizador'
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            <FileText className="h-5 w-5" />
            <span className="text-[9px] leading-tight font-medium">Cotizar</span>
          </Link>

          {/* P1: Viajes */}
          <Link
            href="/viajes"
            title="Archivos de Viaje"
            aria-label="Archivos de Viaje"
            className={`focus-visible:ring-acento-600 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:outline-none ${
              pathname.startsWith('/viajes')
                ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400 font-semibold'
                : 'text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
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
        </nav>
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
