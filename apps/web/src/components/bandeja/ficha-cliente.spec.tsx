import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FichaCliente } from './ficha-cliente';
import type { FichaDeContacto } from '@viajapro/contracts';

const fichaCompleta: FichaDeContacto = {
  contacto: {
    id: '00000000-0002-4000-8000-000000000001',
    nombre: 'Diana Ramírez',
    telefono: '+573005556677',
    correo: 'diana.ramirez@ejemplo.com',
    etiquetas: ['VIP', 'Cartagena'],
    preferencias: 'Prefiere tours en la mañana',
    consentimientos: ['TRANSACCIONAL'],
    creadoEn: '2026-02-10T10:00:00.000Z',
    ultimoContactoEn: '2026-10-15T12:00:00.000Z',
  },
  oportunidadActual: {
    id: '00000000-0003-4000-8000-000000000001',
    contactoId: '00000000-0002-4000-8000-000000000001',
    contactoNombre: 'Diana Ramírez',
    titulo: 'Fin de Semana Cartagena',
    destino: 'Cartagena',
    paqueteId: null,
    fechaSalida: '2026-12-01',
    etapa: {
      id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
      clave: 'EN_COTIZACION',
      nombre: 'En cotización',
      orden: 2,
      probabilidad: 40,
      esGanada: false,
      esPerdida: false,
    },
    valorEstimado: {
      unidades: '320000000',
      moneda: 'COP',
    },
    probabilidad: 40,
    asesorId: '00000000-0000-4000-a000-000000000001',
    asesorNombre: 'Carlos Asesor',
    proximaTarea: null,
    motivoPerdida: null,
    notaPerdida: null,
    creadaEn: '2026-10-01T10:00:00.000Z',
    ultimoContactoEn: '2026-10-15T12:00:00.000Z',
  },
  cotizaciones: [],
  archivosDeViajeIds: ['00000000-0005-4000-8000-000000000001'],
  notasInternas: [],
};

describe('FichaCliente (T-076)', () => {
  it('renderiza la ficha con datos de contacto y oportunidad viva', () => {
    render(<FichaCliente ficha={fichaCompleta} />);

    expect(screen.getByText('Ficha del Viajero')).toBeDefined();
    expect(screen.getByText('Diana Ramírez')).toBeDefined();
    expect(screen.getByText('+573005556677')).toBeDefined();
    expect(screen.getByText('Fin de Semana Cartagena')).toBeDefined();
    expect(screen.getByText('En cotización')).toBeDefined();
  });

  it('llama a onEditarContacto al presionar el botón de editar', () => {
    const onEditar = vi.fn();
    render(<FichaCliente ficha={fichaCompleta} onEditarContacto={onEditar} />);

    const botonEditar = screen.getByTestId('btn-editar-contacto');
    fireEvent.click(botonEditar);

    expect(onEditar).toHaveBeenCalledTimes(1);
  });

  it('llama a onCrearOportunidad cuando hay oportunidad viva', () => {
    const onCrearOp = vi.fn();
    render(<FichaCliente ficha={fichaCompleta} onCrearOportunidad={onCrearOp} />);

    const botonCrear = screen.getByTestId('btn-crear-oportunidad');
    fireEvent.click(botonCrear);

    expect(onCrearOp).toHaveBeenCalledTimes(1);
  });

  it('muestra estado vacío y botón para crear oportunidad cuando oportunidadActual es null', () => {
    const fichaSinOp: FichaDeContacto = {
      ...fichaCompleta,
      oportunidadActual: null,
    };
    const onCrearOp = vi.fn();

    render(<FichaCliente ficha={fichaSinOp} onCrearOportunidad={onCrearOp} />);

    expect(screen.getByText(/Aún no hay destino ni fechas/)).toBeDefined();
    // Sin viaje conocido sigue habiendo un solo «Cotizar», con el contacto ya puesto.
    expect(screen.getAllByRole('link', { name: 'Cotizar' })).toHaveLength(1);
    const botonCrear = screen.getByTestId('btn-crear-oportunidad');
    fireEvent.click(botonCrear);

    expect(onCrearOp).toHaveBeenCalledTimes(1);
  });

  it('la solicitud de viaje va arriba, con un solo «Cotizar» que lleva lo conocido al cotizador', () => {
    render(<FichaCliente ficha={fichaCompleta} conversacionId="conv-1" />);

    const solicitud = screen.getByTestId('solicitud-de-viaje');
    expect(solicitud.textContent).toContain('Cartagena');
    expect(solicitud.textContent).toContain('Sale el 1 dic 2026');
    // Sin pasajeros conocidos no inventa un número.
    expect(solicitud.textContent).toContain('Pasajeros por definir');

    const cotizar = screen.getAllByRole('link', { name: 'Cotizar' });
    expect(cotizar).toHaveLength(1);
    const url = new URL(cotizar[0]!.getAttribute('href')!, 'http://x');
    expect(url.pathname).toBe('/cotizador');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      contactoId: '00000000-0002-4000-8000-000000000001',
      conversacion: 'conv-1',
      oportunidadId: '00000000-0003-4000-8000-000000000001',
      destino: 'Cartagena',
      fecha: '2026-12-01',
    });
    // El botón duplicado del pie ya no existe.
    expect(screen.queryByText('Crear cotización')).toBeNull();
    expect(screen.queryByText('Ver archivo completo')).toBeNull();
  });

  it('con viaje compuesto muestra pasajeros, plazo, cotización vigente y enlace al file', () => {
    const viaje = {
      destino: 'Cancún, México',
      fechaSalida: '2026-12-15',
      pasajeros: { adultos: 2, ninos: 1, infantes: 1 },
      plazo: { etiqueta: 'Time limit', cuando: 'mañana', nivel: 'proximo' as const },
      cotizacion: {
        id: 'cot-9',
        titulo: 'Cancún',
        version: 2,
        venta: { unidades: '12500000', moneda: 'COP' as const },
        vigenteHasta: null,
        estado: 'ENVIADA' as const,
      },
      archivo: { id: 'file-1', numero: 1043 },
      oportunidadId: null,
      paqueteId: null,
    };
    render(<FichaCliente ficha={fichaCompleta} viaje={viaje} />);

    const solicitud = screen.getByTestId('solicitud-de-viaje');
    expect(solicitud.textContent).toContain('Cancún');
    expect(solicitud.textContent).toContain('2 adultos · 1 niño · 1 infante');
    expect(screen.getByTestId('insignia-plazo').textContent).toBe('Time limit mañana');
    expect(screen.getByTestId('cotizacion-vigente').textContent).toContain('v2');
    expect(screen.getByTestId('cotizacion-vigente').textContent).toContain('$ 12.500.000');
    expect(screen.getByRole('link', { name: 'Ver cotización' }).getAttribute('href')).toBe(
      '/cotizaciones/cot-9',
    );
    expect(screen.getByTestId('enlace-archivo').getAttribute('href')).toBe('/viajes?id=file-1');
    expect(screen.getByTestId('enlace-archivo').textContent).toContain('File 1043');
  });

  it('con archivo de viaje enlaza también su cobro, al panel del archivo (T-623)', async () => {
    const viaje = {
      destino: 'Cancún',
      fechaSalida: null,
      pasajeros: null,
      plazo: null,
      cotizacion: null,
      archivo: { id: 'file-1', numero: 1043 },
      oportunidadId: null,
      paqueteId: null,
    };
    render(<FichaCliente ficha={fichaCompleta} viaje={viaje} />);
    const cobro = await screen.findByTestId('enlace-cobro');
    expect(cobro.getAttribute('href')).toBe('/viajes?id=file-1#cobro');
  });

  it('los campos personalizados bajan y van plegados', () => {
    const { container } = render(<FichaCliente ficha={fichaCompleta} />);
    const plegado = container.querySelector('details');
    expect(plegado).not.toBeNull();
    expect(plegado!.hasAttribute('open')).toBe(false);
    expect(plegado!.textContent).toContain('Datos del viajero y del viaje');
    // Y quedan después de la solicitud de viaje en el documento.
    const solicitud = screen.getByTestId('solicitud-de-viaje');
    expect(
      solicitud.compareDocumentPosition(plegado!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
