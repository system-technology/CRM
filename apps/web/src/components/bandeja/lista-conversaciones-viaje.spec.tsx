import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';
import type { PaginaBandeja } from '@viajapro/contracts';
import { ListaConversaciones } from './lista-conversaciones';
import { inboxApi } from '../../lib/inbox-api';
import { ViajesBandejaProvider } from '../../lib/viajes-bandeja';
import type { IndiceDeViajes } from '../../lib/viajes-de-contactos-logica';
import { proximaOcurrencia } from '../../lib/mock-fechas';

vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function conversacion(n: number, nombre: string) {
  return {
    id: `00000000-0000-4000-8000-00000000090${n}`,
    contactoId: `cnt-90${n}`,
    contactoNombre: nombre,
    contactoTelefono: `+57300000090${n}`,
    estado: 'ABIERTA' as const,
    ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
    asignadoAId: null,
    asignadoANombre: null,
    ultimoMensajeTexto: `Mensaje de ${nombre}`,
    ultimoMensajeEn: new Date().toISOString(),
    ultimoMensajeDireccion: 'ENTRANTE' as const,
    mensajesSinLeer: 0,
    slaVenceEn: null,
    etiquetas: [],
  };
}

const PAGINA: PaginaBandeja = {
  datos: [
    conversacion(1, 'Con Archivo'),
    conversacion(2, 'Solo Oportunidad'),
    conversacion(3, 'Sin Viaje'),
  ],
  pageInfo: { nextCursor: null, hasMore: false },
};

const manana = new Date(Date.now() + 86_400_000).toISOString();

const INDICE: IndiceDeViajes = {
  oportunidades: new Map([
    [
      'cnt-902',
      {
        id: 'op-2',
        destino: 'Cartagena, Colombia',
        fechaSalida: proximaOcurrencia(12, 5),
        paqueteId: null,
      },
    ],
  ]),
  archivos: new Map([
    [
      'cnt-901',
      {
        id: 'ar-1',
        numero: 1043,
        oportunidadId: null,
        destino: 'San Andrés, Colombia',
        fechaSalida: proximaOcurrencia(12, 20),
        adultos: 2,
        ninos: 1,
        infantes: 0,
        proximoPlazo: manana,
      },
    ],
  ]),
};

async function pintar(indice?: IndiceDeViajes) {
  await act(async () => {
    render(
      indice ? (
        <ViajesBandejaProvider value={indice}>
          <ListaConversaciones />
        </ViajesBandejaProvider>
      ) : (
        <ListaConversaciones />
      ),
    );
    await Promise.resolve();
  });
}

describe('Bandeja — línea de viaje en cada fila (auditoría UX, I2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA);
  });

  it('muestra «destino · mes · pasajeros» y el plazo más próximo cuando hay archivo', async () => {
    await pintar(INDICE);
    const fila = screen.getByRole('link', { name: /Con Archivo/ });
    // «dic», o «dic 2027» si el año en curso ya pasó el 13 de diciembre.
    expect(within(fila).getByTestId('linea-de-viaje').textContent).toMatch(
      /^Viaje: San Andrés · dic( \d{4})? · 2\+1$/,
    );
    expect(within(fila).getByTestId('insignia-plazo').textContent).toBe('Time limit mañana');
  });

  it('con solo la oportunidad muestra destino y mes, sin inventar pasajeros ni plazo', async () => {
    await pintar(INDICE);
    const fila = screen.getByRole('link', { name: /Solo Oportunidad/ });
    expect(within(fila).getByTestId('linea-de-viaje').textContent).toMatch(
      /^Viaje: Cartagena · dic( \d{4})?$/,
    );
    expect(within(fila).queryByTestId('insignia-plazo')).toBeNull();
  });

  it('una fila sin viaje conocido no lleva línea (no ocupa espacio con «sin datos»)', async () => {
    await pintar(INDICE);
    const fila = screen.getByRole('link', { name: /Sin Viaje/ });
    expect(within(fila).queryByTestId('linea-de-viaje')).toBeNull();
  });

  it('sin índice de viajes la lista se pinta igual, sin ninguna línea', async () => {
    await pintar();
    expect(screen.getByRole('link', { name: /Con Archivo/ })).toBeDefined();
    expect(screen.queryAllByTestId('linea-de-viaje')).toHaveLength(0);
  });
});
