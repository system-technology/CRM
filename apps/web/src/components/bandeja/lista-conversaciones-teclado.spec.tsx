import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ListaConversaciones } from './lista-conversaciones';
import { inboxApi } from '../../lib/inbox-api';
import type { PaginaBandeja } from '@viajapro/contracts';

vi.mock('next/navigation', () => ({
  usePathname: () => '/bandeja',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const PAGINA_MOCK: PaginaBandeja = {
  datos: [
    {
      id: '00000000-0000-4000-8000-000000000801',
      contactoId: 'cnt-801',
      contactoNombre: 'Andrés Primero',
      contactoTelefono: '+573000000801',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Mensaje de Andrés',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 0,
      slaVenceEn: null,
      etiquetas: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000802',
      contactoId: 'cnt-802',
      contactoNombre: 'Beatriz Segundo',
      contactoTelefono: '+573000000802',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Mensaje de Beatriz',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 0,
      slaVenceEn: null,
      etiquetas: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000803',
      contactoId: 'cnt-803',
      contactoNombre: 'Camilo Tercero',
      contactoTelefono: '+573000000803',
      estado: 'ABIERTA',
      ventana: { abierta: true, expiraEn: null, minutosRestantes: 1440 },
      asignadoAId: null,
      asignadoANombre: null,
      ultimoMensajeTexto: 'Mensaje de Camilo',
      ultimoMensajeEn: new Date().toISOString(),
      ultimoMensajeDireccion: 'ENTRANTE',
      mensajesSinLeer: 0,
      slaVenceEn: null,
      etiquetas: [],
    },
  ],
  pageInfo: {
    nextCursor: null,
    hasMore: false,
  },
};

describe('ListaConversaciones — Navegación y atajos por teclado (0c.32)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(inboxApi, 'consultarBandeja').mockResolvedValue(PAGINA_MOCK);
  });

  it('1. Navega hacia abajo con ArrowDown enfocando secuencialmente las conversaciones', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await Promise.resolve();
    });

    const region = screen.getByRole('region', { name: /Lista de conversaciones/i });
    expect(region).toBeDefined();

    // Presionar ArrowDown para pasar del índice 0 al 1 (Beatriz Segundo)
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Beatriz Segundo');

    // Presionar ArrowDown de nuevo para pasar al índice 2 (Camilo Tercero)
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Camilo Tercero');

    // Presionar ArrowDown en el último no debe desbordar ni lanzar error
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Camilo Tercero');
  });

  it('2. Navega hacia arriba con ArrowUp devolviendo el foco', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await Promise.resolve();
    });

    const region = screen.getByRole('region', { name: /Lista de conversaciones/i });

    // Bajar dos veces
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    fireEvent.keyDown(region, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('Camilo Tercero');

    // Subir una vez a Beatriz
    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('Beatriz Segundo');

    // Subir al primero (Andrés)
    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('Andrés Primero');

    // Subir en el primero no debe bajar de 0
    fireEvent.keyDown(region, { key: 'ArrowUp' });
    expect(document.activeElement?.textContent).toContain('Andrés Primero');
  });

  it('3. La tecla / enfoca el campo de búsqueda de la cabecera', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await Promise.resolve();
    });

    const region = screen.getByRole('region', { name: /Lista de conversaciones/i });
    const inputBusqueda = screen.getByPlaceholderText(/Buscar por cliente o mensaje/i);

    // Asegurarse de que el foco no esté en la búsqueda
    region.focus();
    expect(document.activeElement).not.toBe(inputBusqueda);

    // Presionar '/'
    fireEvent.keyDown(region, { key: '/' });
    expect(document.activeElement).toBe(inputBusqueda);
  });

  it('4. Cada fila es un enlace accesible que contiene la ruta de la conversación', async () => {
    await act(async () => {
      render(<ListaConversaciones />);
      await Promise.resolve();
    });

    const enlaceBeatriz = screen.getByRole('link', { name: /Beatriz Segundo/i });
    expect(enlaceBeatriz).toBeDefined();
    expect(enlaceBeatriz.getAttribute('href')).toBe(
      '/bandeja/00000000-0000-4000-8000-000000000802',
    );
  });
});
