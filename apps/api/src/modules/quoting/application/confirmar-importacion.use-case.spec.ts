import { describe, expect, it, vi } from 'vitest';
import { NetoSinPermisoError, PropuestaInvalidaError } from '../domain/errors.js';
import type { AplicadorDeCatalogo } from './aplicador-de-catalogo.js';
import { ConfirmarImportacionUseCase } from './confirmar-importacion.use-case.js';

const HUELLA = 'a'.repeat(64);
const CONTEXTO = {
  tenantId: '01932000-0000-7000-8000-0000000000d1',
  usuarioId: null,
  permisos: ['catalogo.administrar'] as const,
};
const MAPEO = {
  formato: 'excursion-un-dia',
  columnas: { nombre: 0, destino: 1, vigencia_desde: 2, precio_venta: 3 },
  moneda: 'COP' as const,
  formatoDeFecha: 'DD/MM/AAAA' as const,
};
const tabla = (filas: string[][]) => ({
  encabezados: ['Tour', 'Destino', 'Fecha', 'Precio'],
  filas,
  filaInicial: 2,
});

function montar() {
  const aplicar = vi.fn().mockResolvedValue({ informe: { resumen: {} }, paquetes: [] });
  const caso = new ConfirmarImportacionUseCase({ aplicar } as unknown as AplicadorDeCatalogo);
  return { aplicar, caso };
}

describe('ConfirmarImportacionUseCase', () => {
  it('con una fila ilegible rechaza todo y no llega al aplicador', async () => {
    const { aplicar, caso } = montar();
    await expect(
      caso.ejecutar(
        {
          tabla: tabla([
            ['Isla Palma', 'Cartagena', '01/02/2027', '300.000'],
            ['Barú', 'Cartagena', '31/02/2027', '100.000'],
          ]),
          mapeo: MAPEO,
          huella: HUELLA,
        },
        CONTEXTO,
      ),
    ).rejects.toBeInstanceOf(PropuestaInvalidaError);
    expect(aplicar).not.toHaveBeenCalled();
  });

  it('un mapeo con neto sin cotizacion.ver_neto_y_margen es 403 y no llega al aplicador', async () => {
    const { aplicar, caso } = montar();
    await expect(
      caso.ejecutar(
        {
          tabla: tabla([['Isla Palma', 'Cartagena', '01/02/2027', '300.000', '200.000']]),
          mapeo: { ...MAPEO, columnas: { ...MAPEO.columnas, precio_neto: 4 } },
          huella: HUELLA,
        },
        CONTEXTO,
      ),
    ).rejects.toBeInstanceOf(NetoSinPermisoError);
    expect(aplicar).not.toHaveBeenCalled();
  });

  it('delega en el aplicador con la huella y el mapeo para la auditoría', async () => {
    const { aplicar, caso } = montar();
    await caso.ejecutar(
      {
        tabla: tabla([['Isla Palma', 'Cartagena', '01/02/2027', '300.000']]),
        mapeo: MAPEO,
        huella: HUELLA,
      },
      CONTEXTO,
    );
    const [propuesta, contexto, opciones] = aplicar.mock.calls[0] as [
      { origen: string },
      unknown,
      { huellaDeEstadoEsperada: string; anotacion: { mapeoConfirmado: unknown } },
    ];
    expect(propuesta.origen).toBe('ARCHIVO');
    expect(contexto).toBe(CONTEXTO);
    expect(opciones.huellaDeEstadoEsperada).toBe(HUELLA);
    expect(opciones.anotacion.mapeoConfirmado).toEqual(MAPEO);
  });
});
