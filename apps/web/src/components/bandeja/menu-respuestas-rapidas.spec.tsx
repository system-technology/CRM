import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MenuRespuestasRapidas } from './menu-respuestas-rapidas';
import { RESPUESTAS_RAPIDAS_POR_DEFECTO } from '../../lib/respuestas-rapidas-logica';

describe('MenuRespuestasRapidas — Componente flotante de respuestas rápidas (T-104)', () => {
  const contextoMock = {
    nombreCliente: 'María Gómez',
    nombreAsesor: 'Carlos Asesor',
    nombreAgencia: 'JD Tours Cartagena',
    destino: 'Cancún',
  };

  it('1. Renderiza el listbox accesible con las opciones disponibles', () => {
    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query=""
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeDefined();
    expect(screen.getAllByRole('option').length).toBe(RESPUESTAS_RAPIDAS_POR_DEFECTO.length);
  });

  it('2. Muestra vista previa con variables contextuales interpoladas ({nombre}, {asesor})', () => {
    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query="saludo"
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );

    // Debe mostrar "¡Hola María Gómez! Con gusto te saluda Carlos Asesor de JD Tours Cartagena..."
    const preview = screen.getByText(
      /¡Hola María Gómez! Con gusto te saluda Carlos Asesor de JD Tours Cartagena/i,
    );
    expect(preview).toBeDefined();
  });

  it('3. Marca el elemento seleccionado con aria-selected=true', () => {
    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query=""
        contexto={contextoMock}
        indiceSeleccionado={1}
        onSeleccionar={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );

    const opciones = screen.getAllByRole('option');
    expect(opciones[0]!.getAttribute('aria-selected')).toBe('false');
    expect(opciones[1]!.getAttribute('aria-selected')).toBe('true');
  });

  it('4. Llama a onSeleccionar al hacer clic en una opción con el texto interpolado', () => {
    const handleSeleccionar = vi.fn();

    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query=""
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={handleSeleccionar}
        onCerrar={vi.fn()}
      />,
    );

    const opciones = screen.getAllByRole('option');
    fireEvent.click(opciones[0]!);

    expect(handleSeleccionar).toHaveBeenCalledTimes(1);
    expect(handleSeleccionar).toHaveBeenCalledWith(
      RESPUESTAS_RAPIDAS_POR_DEFECTO[0],
      expect.stringContaining('María Gómez'),
    );
  });

  it('5. Muestra mensaje honesto cuando no hay resultados para la consulta', () => {
    render(
      <MenuRespuestasRapidas
        respuestas={[]}
        query="xyzinexistente"
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );

    const aviso = screen.getByText(
      /No se encontraron respuestas que coincidan con «\/xyzinexistente»/i,
    );
    expect(aviso).toBeDefined();
  });

  it('6. Llama a onCerrar al hacer clic en el botón de cerrar', () => {
    const handleCerrar = vi.fn();

    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query=""
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={vi.fn()}
        onCerrar={handleCerrar}
      />,
    );

    const btnCerrar = screen.getByRole('button', { name: /Cerrar respuestas rápidas/i });
    fireEvent.click(btnCerrar);

    expect(handleCerrar).toHaveBeenCalledTimes(1);
  });

  it('7. Garantiza objetivos táctiles >= 44 px en opciones y botones', () => {
    render(
      <MenuRespuestasRapidas
        respuestas={RESPUESTAS_RAPIDAS_POR_DEFECTO}
        query=""
        contexto={contextoMock}
        indiceSeleccionado={0}
        onSeleccionar={vi.fn()}
        onCerrar={vi.fn()}
      />,
    );

    const opciones = screen.getAllByRole('option');
    expect(opciones[0]!.className).toContain('min-h-[44px]');

    const btnCerrar = screen.getByRole('button', { name: /Cerrar respuestas rápidas/i });
    expect(btnCerrar.className).toContain('min-h-[44px]');
  });
});
