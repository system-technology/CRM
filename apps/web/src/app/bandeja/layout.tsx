'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { ConversacionResumen } from '@viajapro/contracts';
import { BarraModulos } from '../../components/bandeja/barra-modulos';
import { ListaConversaciones } from '../../components/bandeja/lista-conversaciones';
import { ModalAyudaAtajos } from '../../components/bandeja/modal-ayuda-atajos';
import {
  BandejaAtajosContext,
  calcularSiguienteConversacionId,
  usePreferenciaAtajosTeclado,
} from '../../lib/atajos-teclado-bandeja';

export default function BandejaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const esDetalleMovil = pathname !== '/bandeja' && pathname.startsWith('/bandeja/');

  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const { atajosHabilitados, setAtajosHabilitados } = usePreferenciaAtajosTeclado();

  const irASiguiente = useCallback(
    (idActual: string) => {
      const siguienteId = calcularSiguienteConversacionId(conversaciones, idActual, 'siguiente');
      if (siguienteId && siguienteId !== idActual) {
        router.push(`/bandeja/${siguienteId}`);
      }
      return siguienteId;
    },
    [conversaciones, router],
  );

  const irAAnterior = useCallback(
    (idActual: string) => {
      const anteriorId = calcularSiguienteConversacionId(conversaciones, idActual, 'anterior');
      if (anteriorId && anteriorId !== idActual) {
        router.push(`/bandeja/${anteriorId}`);
      }
      return anteriorId;
    },
    [conversaciones, router],
  );

  const contextValue = useMemo(
    () => ({
      conversaciones,
      setConversaciones,
      modalAyudaAbierto,
      setModalAyudaAbierto,
      irASiguiente,
      irAAnterior,
      atajosHabilitados,
      setAtajosHabilitados,
    }),
    [
      conversaciones,
      modalAyudaAbierto,
      irASiguiente,
      irAAnterior,
      atajosHabilitados,
      setAtajosHabilitados,
    ],
  );

  return (
    <BandejaAtajosContext.Provider value={contextValue}>
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

      {/* Modal accesible de ayuda de atajos de teclado (T-127) */}
      <ModalAyudaAtajos abierto={modalAyudaAbierto} onCerrar={() => setModalAyudaAbierto(false)} />
    </BandejaAtajosContext.Provider>
  );
}
