import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DescargaPlantillas } from './descarga-plantillas';
import { PLANTILLAS_DE_SISTEMA } from '@viajapro/contracts';

describe('DescargaPlantillas (T-030)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el estado de carga y luego renderiza las tarjetas de plantillas oficiales', async () => {
    render(<DescargaPlantillas />);

    expect(screen.getByTestId('cargando-plantillas')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId('seccion-descarga-plantillas')).toBeDefined();
    });

    // Cada plantilla del sistema debe tener su tarjeta
    for (const p of PLANTILLAS_DE_SISTEMA) {
      expect(screen.getByTestId(`tarjeta-plantilla-${p.formato}`)).toBeDefined();
    }
  });

  it('descarga el CSV oficial con el marcador #viajapro al pulsar el botón de descarga', async () => {
    // Espiar createObjectURL y el clic en enlace
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost:3000/mock-blob');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<DescargaPlantillas />);

    await waitFor(() => {
      expect(screen.getByTestId('tarjeta-plantilla-excursion-un-dia')).toBeDefined();
    });

    const botonDescarga = screen.getByTestId('btn-descargar-plantilla-excursion-un-dia');
    fireEvent.click(botonDescarga);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('¡Descargada!')).toBeDefined();
  });

  it('notifica al componente padre cuando se selecciona "Importar con este formato"', async () => {
    const handleElegir = vi.fn();
    render(<DescargaPlantillas alElegirParaImportar={handleElegir} />);

    await waitFor(() => {
      expect(screen.getByTestId('btn-importar-con-plantilla-excursion-un-dia')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('btn-importar-con-plantilla-excursion-un-dia'));
    expect(handleElegir).toHaveBeenCalledTimes(1);
    expect(handleElegir).toHaveBeenCalledWith(
      expect.objectContaining({
        formato: 'excursion-un-dia',
      }),
    );
  });
});
