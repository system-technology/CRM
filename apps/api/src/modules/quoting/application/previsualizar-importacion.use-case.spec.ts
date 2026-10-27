import { describe, expect, it, vi } from 'vitest';
import type { CatalogoActual } from '../domain/validar-y-planificar.js';
import { PrevisualizarImportacionUseCase } from './previsualizar-importacion.use-case.js';
import { UnidadDeTrabajoDeCatalogo } from './puertos-de-catalogo.js';

const ACTUAL: CatalogoActual = {
  mayoristas: [],
  paquetes: [
    {
      id: 'p1',
      codigo: null,
      nombre: 'Isla Palma',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      planAlimentacion: null,
      inclusiones: [],
      exclusiones: [],
      vigencias: [
        {
          desde: '2026-12-15',
          hasta: '2026-12-15',
          publicada: false,
          tarifas: [
            {
              nombre: 'Adulto',
              unidad: 'POR_PERSONA',
              cubrePasajeros: 1,
              neto: null,
              venta: { unidades: '300000', moneda: 'COP' },
              mayorista: null,
              aditiva: false,
              condicion: {
                acomodacion: null,
                tipoPasajero: null,
                edadMinima: null,
                edadMaxima: null,
                pasajerosMinimo: null,
                pasajerosMaximo: null,
                ocupaSilla: null,
              },
            },
          ],
        },
      ],
    },
    {
      id: 'p2',
      codigo: null,
      nombre: 'Otro',
      destino: 'Santa Marta',
      dias: 1,
      noches: 0,
      planAlimentacion: null,
      inclusiones: [],
      exclusiones: [],
      vigencias: [],
    },
  ],
};

function montar() {
  const escritura = vi.fn();
  const catalogo = {
    leer: vi.fn(() => Promise.resolve(ACTUAL)),
    bloquear: escritura,
    guardarPaquete: escritura,
    guardarVigencia: escritura,
    guardarTarifa: escritura,
    desactivarPaquete: escritura,
  };
  const registro = { registrar: escritura };
  const trabajo: UnidadDeTrabajoDeCatalogo = {
    ejecutar: (fn) => fn({ catalogo, registro }),
  };
  return { caso: new PrevisualizarImportacionUseCase(trabajo), escritura };
}

const mapeo = {
  formato: 'excursion-un-dia',
  columnas: { nombre: 0, destino: 1, vigencia_desde: 2, precio_venta: 3 },
  moneda: 'COP' as const,
  formatoDeFecha: 'DD/MM/AAAA' as const,
};

describe('PrevisualizarImportacionUseCase', () => {
  it('informa nuevo, cambia precio y sin cambio, y no escribe nada', async () => {
    const { caso, escritura } = montar();
    const r = await caso.ejecutar(
      {
        tabla: {
          encabezados: ['Tour', 'Destino', 'Fecha', 'Precio'],
          filas: [
            ['Isla Palma', 'Cartagena', '15/12/2026', '320.000'],
            ['Rosario', 'Cartagena', '15/12/2026', '100.000'],
            ['Fallo', 'Cartagena', '31/02/2026', '100.000'],
          ],
          filaInicial: 2,
        },
        mapeo,
      },
      { tenantId: 't1', permisos: ['catalogo.administrar'] },
    );
    expect(r.informe.resumen).toMatchObject({ creados: 1, actualizados: 1, errores: 1 });
    expect(r.informe.noIncluidos).toEqual([{ codigo: null, nombre: 'Otro' }]);
    expect(r.informe.elementos[0]).toMatchObject({
      codigo: 'FECHA_INVALIDA',
      procedencia: { fila: 4, columna: 'Fecha' },
    });
    expect(r.huella).toBe(r.informe.huella);
    expect(escritura).not.toHaveBeenCalled();
  });

  it('la misma tabla en dos tenants da huellas distintas', async () => {
    const { caso } = montar();
    const entrada = {
      tabla: {
        encabezados: ['Tour', 'Destino', 'Fecha', 'Precio'],
        filas: [['Rosario', 'Cartagena', '15/12/2026', '100.000']],
        filaInicial: 2,
      },
      mapeo,
    };
    const a = await caso.ejecutar(entrada, { tenantId: 'a', permisos: [] });
    const b = await caso.ejecutar(entrada, { tenantId: 'b', permisos: [] });
    expect(a.huella).not.toBe(b.huella);
  });
});
