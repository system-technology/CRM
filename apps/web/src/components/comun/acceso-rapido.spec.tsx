import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccesoRapido } from './acceso-rapido';
import { Send, FileText } from 'lucide-react';

describe('AccesoRapido (Acciones contextuales siguientes)', () => {
  it('renderiza enlaces y botones con touch targets accesibles >= 44px', () => {
    const fnClick = vi.fn();
    render(
      <AccesoRapido
        titulo="Siguiente acción de venta"
        acciones={[
          {
            id: 'cotizar',
            label: 'Cotizar Pasadía',
            descripcion: 'Calcular tarifas en COP',
            href: '/cotizador',
            icono: FileText,
            destacado: true,
          },
          {
            id: 'enviar-propuesta',
            label: 'Enviar por WhatsApp',
            descripcion: 'Propuesta lista',
            onClick: fnClick,
            icono: Send,
          },
        ]}
      />,
    );

    expect(screen.getByText('Siguiente acción de venta')).toBeDefined();
    const btnCotizar = screen.getByTestId('acceso-rapido-cotizar');
    expect(btnCotizar).toBeDefined();
    expect(btnCotizar.className).toContain('min-h-[44px]');

    const btnEnviar = screen.getByTestId('acceso-rapido-enviar-propuesta');
    expect(btnEnviar).toBeDefined();
    expect(btnEnviar.className).toContain('min-h-[44px]');

    fireEvent.click(btnEnviar);
    expect(fnClick).toHaveBeenCalledTimes(1);
  });

  it('no renderiza nada si la lista de acciones está vacía', () => {
    const { container } = render(<AccesoRapido acciones={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
