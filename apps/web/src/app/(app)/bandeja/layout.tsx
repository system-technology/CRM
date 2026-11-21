'use client';

import React, { Suspense, useState, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ConversacionResumen } from '@viajapro/contracts';
import { ListaConversaciones } from '../../../components/bandeja/lista-conversaciones';
import { ModalAyudaAtajos } from '../../../components/bandeja/modal-ayuda-atajos';
import {
  BandejaAtajosContext,
  calcularSiguienteConversacionId,
  usePreferenciaAtajosTeclado,
} from '../../../lib/atajos-teclado-bandeja';
import { esDetalleMovilDeBandeja } from '../../../lib/navegacion';
import { useCargarIndiceDeViajes, ViajesBandejaProvider } from '../../../lib/viajes-bandeja';
import { ProveedorDeEtiquetas } from '../../../lib/use-catalogo-de-etiquetas';
import { hrefConFiltro, soloFiltroDeEtiquetas } from '../../../lib/etiquetas-logica';

/**
 * `useSearchParams` (el filtro por etiqueta vive en la URL, T-326) exige una frontera de Suspense
 * para que la ruta se pueda prerenderizar: el contenido se monta en el cliente con la URL real.
 */
export default function BandejaLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <BandejaLayoutContenido>{children}</BandejaLayoutContenido>
    </Suspense>
  );
}

function BandejaLayoutContenido({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const esDetalleMovil = esDetalleMovilDeBandeja(pathname);
  // Pasar de un chat al siguiente (j/k) conserva el filtro por etiqueta de la URL (T-326).
  const parametros = useSearchParams();
  const consultaDelFiltro = soloFiltroDeEtiquetas(parametros ?? new URLSearchParams());

  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const { atajosHabilitados, setAtajosHabilitados } = usePreferenciaAtajosTeclado();
  const indiceDeViajes = useCargarIndiceDeViajes();

  const irASiguiente = useCallback(
    (idActual: string) => {
      const siguienteId = calcularSiguienteConversacionId(conversaciones, idActual, 'siguiente');
      if (siguienteId && siguienteId !== idActual) {
        router.push(hrefConFiltro(`/bandeja/${siguienteId}`, consultaDelFiltro));
      }
      return siguienteId;
    },
    [conversaciones, router, consultaDelFiltro],
  );

  const irAAnterior = useCallback(
    (idActual: string) => {
      const anteriorId = calcularSiguienteConversacionId(conversaciones, idActual, 'anterior');
      if (anteriorId && anteriorId !== idActual) {
        router.push(hrefConFiltro(`/bandeja/${anteriorId}`, consultaDelFiltro));
      }
      return anteriorId;
    },
    [conversaciones, router, consultaDelFiltro],
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
      <ViajesBandejaProvider value={indiceDeViajes}>
        <ProveedorDeEtiquetas>
          <div className="flex min-h-0 w-full flex-1 overflow-hidden bg-neutral-100 font-sans dark:bg-neutral-950">
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
              <div
                className={`min-w-0 flex-1 flex-col overflow-hidden ${
                  !esDetalleMovil ? 'hidden md:flex' : 'flex'
                }`}
              >
                {children}
              </div>
            </div>
          </div>

          {/* Modal accesible de ayuda de atajos de teclado (T-127) */}
          <ModalAyudaAtajos
            abierto={modalAyudaAbierto}
            onCerrar={() => setModalAyudaAbierto(false)}
          />
        </ProveedorDeEtiquetas>
      </ViajesBandejaProvider>
    </BandejaAtajosContext.Provider>
  );
}
