import { describe, expect, it } from 'vitest';
import {
  anadirVersionCotizacionApi,
  CotizacionesApiError,
  guardarCotizacionApi,
  obtenerCotizacionGuardadaApi,
  listarCotizacionesApi,
} from './cotizaciones-api';

describe('cotizaciones-api (0c.22 & 0c.24)', () => {
  const CONTACTO_ID = '00000000-0002-4000-8000-000000000001';
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';

  it('guarda una cotización mock con versión 1 y la recupera', async () => {
    const creada = await guardarCotizacionApi({
      contactoId: CONTACTO_ID,
      titulo: 'Cotización San Andrés Test',
      version: {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-25',
        adultos: 2,
        acomodacion: 'DOBLE',
      },
    });

    expect(creada.id).toBeDefined();
    expect(creada.versiones.length).toBe(1);
    expect(creada.versiones[0]!.numero).toBe(1);
    expect(creada.versiones[0]!.venta.unidades).toBeDefined();

    // Recuperar
    const obtenida = await obtenerCotizacionGuardadaApi(creada.id);
    expect(obtenida.id).toBe(creada.id);
    expect(obtenida.versiones.length).toBe(1);
  });

  it('añade versión 2 a una cotización existente preservando versión 1 inmutable', async () => {
    const creada = await guardarCotizacionApi({
      contactoId: CONTACTO_ID,
      titulo: 'Cotización Versionable',
      version: {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-25',
        adultos: 2,
        acomodacion: 'DOBLE',
      },
    });

    const v1Original = creada.versiones[0]!;

    // Añadir versión 2 con 3 adultos
    const conV2 = await anadirVersionCotizacionApi(creada.id, {
      paqueteId: PAQUETE_ID,
      fecha: '2026-10-25',
      adultos: 3,
      acomodacion: 'TRIPLE',
    });

    expect(conV2.versiones.length).toBe(2);
    expect(conV2.versiones[0]!.numero).toBe(1);
    expect(conV2.versiones[1]!.numero).toBe(2);

    // Invariante de producto: la versión 1 no mutó
    expect(conV2.versiones[0]!.adultos).toBe(v1Original.adultos);
    expect(conV2.versiones[0]!.acomodacion).toBe(v1Original.acomodacion);
    expect(conV2.versiones[0]!.venta).toEqual(v1Original.venta);

    // La versión 2 tiene sus propios datos
    expect(conV2.versiones[1]!.adultos).toBe(3);
    expect(conV2.versiones[1]!.acomodacion).toBe('TRIPLE');
  });

  it('lanza 404 honesto si la cotización no existe', async () => {
    await expect(
      obtenerCotizacionGuardadaApi('00000000-0000-0000-0000-999999999999'),
    ).rejects.toThrow(CotizacionesApiError);
  });

  it('lista las cotizaciones guardadas con sus versiones (0c.24)', async () => {
    const listado = await listarCotizacionesApi();
    expect(Array.isArray(listado)).toBe(true);
    expect(listado.length).toBeGreaterThan(0);
    const primera = listado[0]!;
    expect(primera.id).toBeDefined();
    expect(primera.versiones.length).toBeGreaterThan(0);
  });
});
