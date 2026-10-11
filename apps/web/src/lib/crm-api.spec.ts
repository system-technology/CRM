import { describe, expect, it } from 'vitest';
import {
  obtenerTableroPipeline,
  moverOportunidadDeEtapa,
  obtenerFichaDeContacto,
  listarContactos,
} from './crm-api';

describe('Cliente de API CRM (crm-api.ts)', () => {
  it('obtenerTableroPipeline devuelve un TableroPipeline válido con columnas y totales', async () => {
    const tablero = await obtenerTableroPipeline();
    expect(tablero.columnas.length).toBeGreaterThanOrEqual(5);

    for (const col of tablero.columnas) {
      expect(col.etapa.id).toBeDefined();
      expect(col.etapa.nombre.length).toBeGreaterThan(0);
      expect(col.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(col.oportunidades)).toBe(true);
    }
  });

  it('moverOportunidadDeEtapa valida entrada y retorna la oportunidad actualizada', async () => {
    const tablero = await obtenerTableroPipeline();
    const primeraColumna = tablero.columnas[0]!;
    const tarjeta = primeraColumna.oportunidades[0]!;
    const etapaDestino = tablero.columnas[1]!.etapa;

    const res = await moverOportunidadDeEtapa(tarjeta.id, {
      etapaId: etapaDestino.id,
      motivoPerdida: null,
      notaPerdida: null,
    });

    expect(res.id).toBe(tarjeta.id);
    expect(res.etapa.id).toBe(etapaDestino.id);
  });

  it('moverOportunidadDeEtapa rechaza entrada inválida si motivo es OTRO sin nota', async () => {
    const tablero = await obtenerTableroPipeline();
    const tarjeta = tablero.columnas[0]!.oportunidades[0]!;
    const etapaPerdida = tablero.columnas[4]!.etapa;

    await expect(
      moverOportunidadDeEtapa(tarjeta.id, {
        etapaId: etapaPerdida.id,
        motivoPerdida: 'OTRO',
        notaPerdida: '',
      }),
    ).rejects.toThrow();
  });

  it('obtenerFichaDeContacto devuelve la ficha completa de un viajero', async () => {
    const ficha = await obtenerFichaDeContacto('00000000-0001-4000-8000-000000000001');
    expect(ficha.contacto).toBeDefined();
    expect(ficha.contacto.telefono).toMatch(/^\+[1-9]\d{7,14}$/);
    expect(Array.isArray(ficha.cotizaciones)).toBe(true);
    expect(Array.isArray(ficha.archivosDeViajeIds)).toBe(true);
    expect(Array.isArray(ficha.notasInternas)).toBe(true);
  });

  it('listarContactos devuelve PaginaContactos y filtra por nombre o teléfono', async () => {
    const pagina = await listarContactos('Juan');
    expect(pagina.datos.length).toBeGreaterThanOrEqual(1);
    expect(pagina.datos[0]?.nombre).toContain('Juan');
  });
});
