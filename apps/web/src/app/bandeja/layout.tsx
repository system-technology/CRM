'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { ListaConversaciones } from '../../components/bandeja/lista-conversaciones';

export default function BandejaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esDetalleMovil = pathname !== '/bandeja' && pathname.startsWith('/bandeja/');

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-neutral-100 font-sans dark:bg-neutral-950">
      {/* Columna 1: Barra lateral de módulos (56px) */}
      <div className={`shrink-0 ${esDetalleMovil ? 'hidden md:flex' : 'flex'}`}>
        <BarraModulos />
      </div>

      {/* Contenedor de lista + hilo central */}
      <div className="flex flex-1 overflow-hidden">
        {/* Columna 2: Lista de conversaciones (conserva su estado y scroll) */}
        <div
          className={`w-full shrink-0 md:w-80 xl:w-[340px] ${
            esDetalleMovil ? 'hidden md:flex' : 'flex'
          } flex-col overflow-hidden`}
        >
          <ListaConversaciones />
        </div>

        {/* Columna 3: Hilo del chat o Estado vacío central */}
        <main
          className={`min-w-0 flex-1 flex-col overflow-hidden ${
            !esDetalleMovil ? 'hidden md:flex' : 'flex'
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
