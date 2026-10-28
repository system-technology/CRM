import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ModalFormularioPaquete } from './modal-formulario-paquete';
import { DialogoDesactivarPaquete } from './dialogo-desactivar-paquete';
import type { ResumenDePaqueteGestion } from '@viajapro/contracts';

const PAQUETE_A_EDITAR: ResumenDePaqueteGestion = {
  id: 'paq-100',
  codigo: 'CTG-PLAYA-3D',
  nombre: 'Escapada Barú Relax',
  destino: 'Cartagena',
  paisIso: 'CO',
  dias: 3,
  noches: 2,
  planAlimentacion: 'TODO_INCLUIDO',
  formato: { id: 'fmt-1', nombre: 'Pasadía y Escapadas' },
  inclusiones: ['Traslado en lancha rápida', 'Almuerzo buffet'],
  exclusiones: ['Impuesto de muelle'],
  descripcion: null,
  activo: true,
  mayoristaId: null,
  desde: [{ moneda: 'COP', unidades: '650000' }],
  desdeEsDeGrupo: false,
  vigenciasActivas: 1,
  creadoEn: '2026-10-01T10:00:00.000Z',
};

describe('ModalFormularioPaquete (T-031)', () => {
  it('no renderiza nada si abierto es false', () => {
    const { container } = render(
      <ModalFormularioPaquete abierto={false} alCerrar={vi.fn()} alGuardar={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza modo creación con campos vacíos y título apropiado', () => {
    render(<ModalFormularioPaquete abierto={true} alCerrar={vi.fn()} alGuardar={vi.fn()} />);

    expect(screen.getByTestId('titulo-modal-paquete').textContent).toContain(
      'Nuevo Producto Turístico',
    );
    expect(screen.getByTestId('input-nombre-paquete')).toBeDefined();
    expect(screen.getByTestId('input-destino-paquete')).toBeDefined();
    expect(screen.getByTestId('boton-guardar-paquete')).toBeDefined();
  });

  it('renderiza modo edición con datos precargados', () => {
    render(
      <ModalFormularioPaquete
        abierto={true}
        paqueteAEditar={PAQUETE_A_EDITAR}
        alCerrar={vi.fn()}
        alGuardar={vi.fn()}
      />,
    );

    expect(screen.getByTestId('titulo-modal-paquete').textContent).toContain(
      'Editar Producto del Catálogo',
    );
    const inputNombre = screen.getByTestId<HTMLInputElement>('input-nombre-paquete');
    expect(inputNombre.value).toBe('Escapada Barú Relax');

    const inputDestino = screen.getByTestId<HTMLInputElement>('input-destino-paquete');
    expect(inputDestino.value).toBe('Cartagena');
  });

  it('muestra errores de validación en español al intentar enviar con campos inválidos', () => {
    render(<ModalFormularioPaquete abierto={true} alCerrar={vi.fn()} alGuardar={vi.fn()} />);

    const btnGuardar = screen.getByTestId('boton-guardar-paquete');
    fireEvent.click(btnGuardar);

    expect(screen.getByTestId('error-campo-nombre')).toBeDefined();
  });

  it('llama alGuardar con los datos completados al enviar formulario válido', () => {
    const handleGuardar = vi.fn().mockResolvedValue(undefined);
    render(<ModalFormularioPaquete abierto={true} alCerrar={vi.fn()} alGuardar={handleGuardar} />);

    fireEvent.change(screen.getByTestId('input-nombre-paquete'), {
      target: { value: 'Tour Islas del Rosario Deluxe' },
    });
    fireEvent.change(screen.getByTestId('input-destino-paquete'), {
      target: { value: 'Cartagena' },
    });
    fireEvent.change(screen.getByTestId('input-dias-paquete'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByTestId('input-noches-paquete'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByTestId('select-plan-alimentacion'), {
      target: { value: 'TODO_INCLUIDO' },
    });

    const btnGuardar = screen.getByTestId('boton-guardar-paquete');
    act(() => {
      fireEvent.click(btnGuardar);
    });

    // Espera a que se ejecute la validación y callback
    expect(handleGuardar).toHaveBeenCalledTimes(1);
  });
});

describe('DialogoDesactivarPaquete (T-031)', () => {
  it('no renderiza nada si abierto es false o paquete es null', () => {
    const { container } = render(
      <DialogoDesactivarPaquete
        abierto={false}
        paquete={PAQUETE_A_EDITAR}
        alCerrar={vi.fn()}
        alConfirmar={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('muestra mensaje informativo de preservación histórica y botón de confirmación', () => {
    const handleConfirmar = vi.fn().mockResolvedValue(undefined);
    const handleCerrar = vi.fn();

    render(
      <DialogoDesactivarPaquete
        abierto={true}
        paquete={PAQUETE_A_EDITAR}
        alCerrar={handleCerrar}
        alConfirmar={handleConfirmar}
      />,
    );

    expect(screen.getByTestId('dialogo-desactivar-paquete')).toBeDefined();
    expect(screen.getByText('¿Desactivar este producto?')).toBeDefined();
    expect(screen.getByText('Escapada Barú Relax')).toBeDefined();
    expect(screen.getByText(/Protección del historial de cotizaciones/i)).toBeDefined();

    const btnConfirmar = screen.getByTestId('boton-confirmar-desactivar');
    fireEvent.click(btnConfirmar);
    expect(handleConfirmar).toHaveBeenCalledWith('paq-100');
  });
});
