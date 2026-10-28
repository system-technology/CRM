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

    expect(screen.getByText('Sin oportunidad activa')).toBeDefined();
    const botonCrear = screen.getByTestId('btn-crear-oportunidad');
    fireEvent.click(botonCrear);

    expect(onCrearOp).toHaveBeenCalledTimes(1);
  });
});
