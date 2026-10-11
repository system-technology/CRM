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
} from 'lucide-react';

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const guardado = localStorage.getItem('viajapro_tema');
      if (guardado === 'dark' || document.documentElement.classList.contains('dark')) {
        setModoOscuro(true);
        document.documentElement.classList.add('dark');
      }
    }
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
      activo: false,
      disponible: false,
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
      activo: false,
      disponible: false,
    },
  ];

  return (
    <aside
      className="flex h-full w-14 flex-col items-center justify-between border-r border-neutral-200 bg-white py-3 select-none dark:border-neutral-800 dark:bg-neutral-900"
      aria-label="Barra de módulos"
    >
      {/* Top: Logo & Módulos */}
      <div className="flex w-full flex-col items-center space-y-4">
        {/* Logo */}
        <Link
          href="/bandeja"
          title="ViajaPro — CRM Turístico"
          className="bg-acento-700 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform hover:scale-105"
        >
          <Plane className="h-5 w-5" />
        </Link>

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
                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                  m.activo
                    ? 'bg-acento-50 text-acento-700 dark:bg-acento-950/60 dark:text-acento-400'
                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200'
                }`}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom: Meta de Cierres + Tema + Perfil */}
      <div className="flex w-full flex-col items-center space-y-3 px-1">
        {/* Meta de cierres compacta */}
        <div
          title="Meta de cierres: $42.5M de $60M COP (71% completado)"
          className="group border-ok-200 bg-ok-50/50 dark:border-ok-900/50 dark:bg-ok-950/30 relative flex h-10 w-10 cursor-help flex-col items-center justify-center rounded-lg border p-1 text-center transition-colors"
        >
          <TrendingUp className="text-ok-600 dark:text-ok-400 h-3.5 w-3.5" />
          <span className="cifra text-ok-700 dark:text-ok-300 text-[9px] font-bold">71%</span>
        </div>

        {/* Interruptor modo oscuro */}
        <button
          type="button"
          onClick={alternarTema}
          title={modoOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
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
          <span>CA</span>
          <span className="bg-ok-500 absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-3 border-white dark:border-neutral-900" />
        </div>
      </div>
    </aside>
  );
}
