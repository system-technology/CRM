import { describe, it, expect } from 'vitest';
import { guardarCotizacionApi, anadirVersionCotizacionApi } from './cotizaciones-api';
import { calcularCotizacionMock } from './cotizador-logica';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import type { Acomodacion } from '@viajapro/contracts';

/**
 * T-321 (a): el guardado simulado del modo demostración usa el MISMO cálculo que el cotizador.
 * Antes fijaba 2.450.000 por adulto y el niño al 70 %: el cotizador decía 10.800.000 y la versión
 * guardada 8.330.000.
 */
describe('guardado simulado de demostración coherente con el cotizador (T-321)', () => {
  const CONTACTO = '00000000-0002-4000-8000-000000000004';

  const casos: { adultos: number; ninos: number; infantes: number; acomodacion?: Acomodacion }[] = [
    { adultos: 2, ninos: 0, infantes: 0 },
    { adultos: 2, ninos: 1, infantes: 0 },
    { adultos: 3, ninos: 2, infantes: 1 },
    { adultos: 1, ninos: 0, infantes: 0, acomodacion: 'SENCILLA' },
    { adultos: 4, ninos: 0, infantes: 0, acomodacion: 'CUADRUPLE' },
  ];

  for (const paquete of MOCK_PAQUETES_CATALOGO) {
    for (const caso of casos) {
      it(`${paquete.nombre.slice(0, 24)} · ${caso.adultos}A ${caso.ninos}N ${caso.infantes}I: total guardado = total del cotizador`, async () => {
        const vigencia = paquete.vigencias[0]!;
        const fecha = vigencia.desde;
        const delCotizador = calcularCotizacionMock(
          {
            paqueteId: paquete.id,
            fechaSalida: fecha,
            pasajeros: { adultos: caso.adultos, ninos: caso.ninos, infantes: caso.infantes },
            acomodacion: caso.acomodacion,
            markupExtra: 0,
          },
          paquete,
        );

        const guardada = await guardarCotizacionApi({
          contactoId: CONTACTO,
          titulo: 'Prueba de coherencia',
          version: {
            paqueteId: paquete.id,
            fecha,
            adultos: caso.adultos,
            ninos: caso.ninos,
            infantes: caso.infantes,
            ...(caso.acomodacion ? { acomodacion: caso.acomodacion } : {}),
          },
        });

        const v = guardada.versiones[0]!;
        // Enteros en la unidad mínima de la moneda (COP = el peso) y código ISO-4217 (R8).
        expect(v.venta).toEqual(delCotizador.totalVenta);
        expect(v.venta.moneda).toBe('COP');
        expect(v.venta.unidades).toMatch(/^\d+$/);
        // Las líneas suman el total mostrado.
        const suma = v.lineas.reduce((acc, l) => acc + BigInt(l.total.unidades), 0n);
        expect(suma).toBe(BigInt(v.venta.unidades));
        expect(v.acomodacion).toBe(delCotizador.acomodacion);
      });
    }
  }

  it('el total de antes de guardar es idéntico al de después, y al de la versión 2 con la misma composición', async () => {
    const paquete = MOCK_PAQUETES_CATALOGO[0]!;
    const fecha = paquete.vigencias[0]!.desde;
    const composicion = { paqueteId: paquete.id, fecha, adultos: 3, ninos: 1, infantes: 0 };
    const antes = calcularCotizacionMock(
      {
        paqueteId: paquete.id,
        fechaSalida: fecha,
        pasajeros: { adultos: 3, ninos: 1, infantes: 0 },
        markupExtra: 0,
      },
      paquete,
    ).totalVenta;

    const guardada = await guardarCotizacionApi({
      contactoId: CONTACTO,
      titulo: 'Antes y después',
      version: composicion,
    });
    const conV2 = await anadirVersionCotizacionApi(guardada.id, composicion);

    expect(guardada.versiones[0]!.venta).toEqual(antes);
    expect(conV2.versiones[1]!.venta).toEqual(antes);
  });
});
