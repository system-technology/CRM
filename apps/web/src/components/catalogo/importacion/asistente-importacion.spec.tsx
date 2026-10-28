import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AsistenteImportacion } from './asistente-importacion';
import * as importacionesApi from '../../../lib/importaciones-api';
import { generarCsvPlantilla } from '../../../lib/importacion-logica';
import { PLANTILLAS_DE_SISTEMA } from '@viajapro/contracts';

const PLANTILLA_EXCURSION = PLANTILLAS_DE_SISTEMA.find((p) => p.formato === 'excursion-un-dia')!;

describe('AsistenteImportacion (T-029)', () => {
  const cerrarMock = vi.fn();
  const finalizarMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no renderiza nada cuando abierto es false', () => {
    render(
      <AsistenteImportacion
        abierto={false}
        alCerrar={cerrarMock}
        alFinalizarImportacion={finalizarMock}
      />,
    );

    expect(screen.queryByTestId('asistente-importacion-modal')).toBeNull();
  });

  it('permite pegar texto CSV, detecta el marcador y avanza por las 4 etapas hasta confirmar', async () => {
    const csvEjemplo = generarCsvPlantilla(PLANTILLA_EXCURSION);

    // Mock API de previsualización
    const previsualizarSpy = vi
      .spyOn(importacionesApi, 'previsualizarImportacionApi')
      .mockResolvedValue({
        huella: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        informe: {
          elementos: [
            {
              nivel: 'OK',
              codigo: 'FILA_VALIDA',
              ruta: 'productos[0]',
              mensaje: 'Fila válida: listo para inserción',
              procedencia: { fila: 3, columna: 'Nombre del producto' },
            },
          ],
          resumen: {
            errores: 0,
            avisos: 0,
            creados: 1,
            actualizados: 0,
            sinCambios: 0,
          },
          noIncluidos: [],
          huella: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
        },
      });

    // Mock API de confirmación
    const confirmarSpy = vi.spyOn(importacionesApi, 'confirmarImportacionApi').mockResolvedValue({
      informe: {
        elementos: [],
        resumen: {
          errores: 0,
          avisos: 0,
          creados: 1,
          actualizados: 0,
          sinCambios: 0,
        },
        noIncluidos: [],
        huella: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      },
      paquetes: [{ indice: 0, id: 'paq-1', accion: 'CREAR' }],
    });

    render(
      <AsistenteImportacion
        abierto={true}
        alCerrar={cerrarMock}
        alFinalizarImportacion={finalizarMock}
      />,
    );

    expect(screen.getByTestId('asistente-importacion-modal')).toBeDefined();
    expect(screen.getByTestId('paso-1-archivo')).toBeDefined();

    // Pegar contenido en textarea
    const textarea = screen.getByTestId('textarea-contenido-csv');
    fireEvent.change(textarea, { target: { value: csvEjemplo } });

    // Verificar detección de marcador
    expect(screen.getByTestId('aviso-marcador-detectado')).toBeDefined();

    // Continuar a Paso 2 (Mapeo)
    const botonMapeo = screen.getByTestId('boton-avanzar-a-mapeo');
    fireEvent.click(botonMapeo);

    await waitFor(() => {
      expect(screen.getByTestId('paso-2-mapeo')).toBeDefined();
    });

    // Continuar a Paso 3 (Previsualización)
    const botonPrevisualizar = screen.getByTestId('boton-avanzar-a-previsualizar');
    fireEvent.click(botonPrevisualizar);

    await waitFor(() => {
      expect(screen.getByTestId('paso-3-previsualizar')).toBeDefined();
    });

    // Verificar KPIs y Huella SHA-256
    expect(screen.getByTestId('kpi-previs-total').textContent).toBe('1');
    expect(screen.getByTestId('kpi-previs-creados').textContent).toBe('1');
    expect(screen.getByTestId('tarjeta-huella-sha256')).toBeDefined();
    expect(previsualizarSpy).toHaveBeenCalledTimes(1);

    // Confirmar importación
    const botonConfirmar = screen.getByTestId('boton-confirmar-importacion');
    expect(botonConfirmar.hasAttribute('disabled')).toBe(false);
    fireEvent.click(botonConfirmar);

    await waitFor(() => {
      expect(screen.getByTestId('paso-4-resultado')).toBeDefined();
    });
    expect(confirmarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        huella: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      }),
    );

    // Cerrar y verificar callbacks
    fireEvent.click(screen.getByTestId('boton-cerrar-finalizado'));
    expect(finalizarMock).toHaveBeenCalledTimes(1);
    expect(cerrarMock).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón de confirmación si la propuesta tiene errores bloqueantes', async () => {
    const csvEjemplo = generarCsvPlantilla(PLANTILLA_EXCURSION);

    vi.spyOn(importacionesApi, 'previsualizarImportacionApi').mockResolvedValue({
      huella: '0000000000000000000000000000000000000000000000000000000000000000',
      informe: {
        elementos: [
          {
            nivel: 'ERROR',
            codigo: 'DESTINO_INVALIDO',
            ruta: 'productos[0].destino',
            mensaje: 'El destino contiene caracteres prohibidos',
            procedencia: { fila: 2 },
          },
        ],
        resumen: {
          errores: 1,
          avisos: 0,
          creados: 0,
          actualizados: 0,
          sinCambios: 0,
        },
        noIncluidos: [],
        huella: '0000000000000000000000000000000000000000000000000000000000000000',
      },
    });

    render(<AsistenteImportacion abierto={true} alCerrar={cerrarMock} />);

    const textarea = screen.getByTestId('textarea-contenido-csv');
    fireEvent.change(textarea, {
      target: {
        value: csvEjemplo,
      },
    });

    fireEvent.click(screen.getByTestId('boton-avanzar-a-mapeo'));
    await waitFor(() => {
      expect(screen.getByTestId('paso-2-mapeo')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('boton-avanzar-a-previsualizar'));
    await waitFor(() => {
      expect(screen.getByTestId('paso-3-previsualizar')).toBeDefined();
    });

    expect(screen.getByTestId('aviso-errores-bloqueantes')).toBeDefined();
    const botonConfirmar = screen.getByTestId('boton-confirmar-importacion');
    expect(botonConfirmar.hasAttribute('disabled')).toBe(true);
  });
});
