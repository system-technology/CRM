import { describe, expect, it } from 'vitest';
import type { ResumenDeArchivo, TableroPipeline } from '@viajapro/contracts';
import {
  indexarArchivos,
  indexarOportunidades,
  INDICE_VACIO,
  viajeDeContacto,
} from './viajes-de-contactos-logica';
import { obtenerMockTableroPipeline } from './mock-pipeline';
import { MOCK_DETALLES_ARCHIVOS } from './mock-archivos';

const AHORA = Date.parse('2026-11-20T17:00:00.000Z');

describe('índices de viajes por contacto', () => {
  const tablero: TableroPipeline = obtenerMockTableroPipeline();

  it('indexa las oportunidades abiertas y salta las ganadas y perdidas', () => {
    const indice = indexarOportunidades(tablero);
    // Juan Pérez (En cotización) está; Andrea Gómez (Ganada) y Nicolás Medina (Perdida) no.
    expect(indice.get('00000000-0002-4000-8000-000000000001')?.destino).toBe('Cancún, México');
    expect(indice.has('00000000-0002-4000-8000-000000000009')).toBe(false);
    expect(indice.has('00000000-0002-4000-8000-000000000020')).toBe(false);
  });

  it('con dos oportunidades abiertas del mismo contacto gana la más reciente', () => {
    const base = tablero.columnas[0]!;
    const o = base.oportunidades[0]!;
    const t: TableroPipeline = {
      columnas: [
        {
          ...base,
          oportunidades: [
            { ...o, id: 'vieja', creadaEn: '2026-01-01T00:00:00.000Z' },
            { ...o, id: 'nueva', creadaEn: '2026-06-01T00:00:00.000Z' },
          ],
        },
      ],
    };
    expect(indexarOportunidades(t).get(o.contactoId)?.id).toBe('nueva');
  });

  it('indexa el archivo abierto de salida más próxima por contacto', () => {
    const base = MOCK_DETALLES_ARCHIVOS[0] as ResumenDeArchivo;
    const lista: ResumenDeArchivo[] = [
      { ...base, id: 'lejos', fechaSalida: '2027-03-01' },
      { ...base, id: 'cerca', fechaSalida: '2026-12-20' },
      { ...base, id: 'cancelado', fechaSalida: '2026-11-25', estado: 'CANCELADO' },
    ];
    expect(indexarArchivos(lista).get(base.contactoId)?.id).toBe('cerca');
  });

  it('viajeDeContacto compone la fuente disponible y es null sin ninguna', () => {
    const indice = {
      oportunidades: indexarOportunidades(tablero),
      archivos: indexarArchivos(MOCK_DETALLES_ARCHIVOS),
    };
    const juan = viajeDeContacto(indice, '00000000-0002-4000-8000-000000000001', AHORA);
    expect(juan?.destino).toBe('Cancún, México');
    expect(juan?.pasajeros).toBeNull(); // la oportunidad no trae pasajeros
    const felipe = viajeDeContacto(indice, '00000000-0002-4000-8000-000000000004', AHORA);
    expect(felipe?.pasajeros).toEqual({ adultos: 2, ninos: 1, infantes: 0 });
    expect(felipe?.archivo?.numero).toBe(1043);
    expect(viajeDeContacto(indice, 'desconocido', AHORA)).toBeNull();
    expect(viajeDeContacto(INDICE_VACIO, 'x', AHORA)).toBeNull();
  });
});
