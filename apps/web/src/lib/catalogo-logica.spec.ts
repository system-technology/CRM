import { describe, expect, it } from 'vitest';
import {
  Mayorista as EsquemaMayorista,
  Paquete as EsquemaPaquete,
  Precio as EsquemaPrecio,
  Temporada as EsquemaTemporada,
} from '@viajapro/contracts';
import { MOCK_MAYORISTAS, MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import {
  agruparPreciosPorAcomodacion,
  filtrarPaquetes,
  obtenerPrecioDesde,
  verificarVigenciaTarifario,
} from './catalogo-logica';

describe('Pruebas del Catálogo de Paquetes y Tarifarios de Mayoristas', () => {
  it('1. Todos los paquetes mock validan con el contrato Zod oficial Paquete (R3)', () => {
    expect(MOCK_PAQUETES_CATALOGO.length).toBeGreaterThanOrEqual(5);

    for (const p of MOCK_PAQUETES_CATALOGO) {
      const resultado = EsquemaPaquete.safeParse({
        id: p.id,
        nombre: p.nombre,
        destino: p.destino,
        paisIso: p.paisIso,
        dias: p.dias,
        noches: p.noches,
        planAlimentacion: p.planAlimentacion,
        inclusiones: p.inclusiones,
        exclusiones: p.exclusiones,
        descripcion: p.descripcion,
        activo: p.activo,
        mayoristaId: p.mayoristaId,
        creadoEn: p.creadoEn,
      });

      expect(resultado.success).toBe(true);
    }
  });

  it('2. Todos los mayoristas mock validan con el contrato Zod oficial Mayorista (R3)', () => {
    expect(MOCK_MAYORISTAS.length).toBeGreaterThanOrEqual(2);

    for (const m of MOCK_MAYORISTAS) {
      const resultado = EsquemaMayorista.safeParse(m);
      expect(resultado.success).toBe(true);
      expect(m.diasTimeLimit).toBeGreaterThanOrEqual(0);
    }
  });

  it('3. Todas las temporadas y precios mock validan con sus esquemas Zod (R3)', () => {
    for (const p of MOCK_PAQUETES_CATALOGO) {
      expect(p.temporadas.length).toBeGreaterThan(0);
      for (const t of p.temporadas) {
        const resTemp = EsquemaTemporada.safeParse(t);
        expect(resTemp.success).toBe(true);

        for (const pr of t.precios) {
          const resPrecio = EsquemaPrecio.safeParse(pr);
          expect(resPrecio.success).toBe(true);
          expect(pr.venta.moneda).toBe('COP');
          expect(pr.neto.moneda).toBe('COP');
          expect(BigInt(pr.venta.unidades)).toBeGreaterThan(BigInt(pr.neto.unidades));
        }
      }
    }
  });

  it('4. obtenerPrecioDesde calcula el valor mínimo de venta para adulto', () => {
    const paqueteSanAndres = MOCK_PAQUETES_CATALOGO[0]!;
    const precioDesde = obtenerPrecioDesde(paqueteSanAndres);

    expect(precioDesde).not.toBeNull();
    // En San Andrés el menor ADT es Cuádruple $1.340.000 COP
    expect(precioDesde?.unidades).toBe('1340000');
    expect(precioDesde?.moneda).toBe('COP');
  });

  it('5. verificarVigenciaTarifario detecta temporadas vigentes y expiradas', () => {
    const sanAndres = MOCK_PAQUETES_CATALOGO[0]!;
    const vigSanAndres = verificarVigenciaTarifario(sanAndres.temporadas, '2027-03-01');
    expect(vigSanAndres.estaVigente).toBe(true);
    expect(vigSanAndres.temporadasVigentes.length).toBe(2);

    const vencido = MOCK_PAQUETES_CATALOGO.find((p) => p.nombre.includes('Tarifario Vencido'));
    expect(vencido).toBeDefined();
    const vigVencido = verificarVigenciaTarifario(vencido!.temporadas, '2027-03-01');
    expect(vigVencido.estaVigente).toBe(false);
    expect(vigVencido.temporadasVigentes.length).toBe(0);
  });

  it('6. filtrarPaquetes filtra por texto (nombre, destino o mayorista)', () => {
    const resPuntaCana = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, { busqueda: 'Punta Cana' });
    expect(resPuntaCana.length).toBe(1);
    expect(resPuntaCana[0]!.destino).toBe('Punta Cana');

    const resMayorista = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, { busqueda: 'Mayorista Caribe' });
    expect(resMayorista.length).toBe(2); // San Andrés y Punta Cana
  });

  it('7. filtrarPaquetes filtra por plan de alimentación y solo vigentes', () => {
    const soloTodoIncluido = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      planAlimentacion: 'TODO_INCLUIDO',
    });
    expect(soloTodoIncluido.length).toBe(3); // San Andrés, Punta Cana, Cancún

    const soloVigentes = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      soloVigentes: true,
      fechaReferencia: '2027-01-01',
    });
    expect(soloVigentes.some((p) => p.nombre.includes('Tarifario Vencido'))).toBe(false);
  });

  it('8. agruparPreciosPorAcomodacion estructura correctamente la matriz de tarifas', () => {
    const temporadaSanAndres = MOCK_PAQUETES_CATALOGO[0]!.temporadas[0]!;
    const matriz = agruparPreciosPorAcomodacion(temporadaSanAndres.precios);

    expect(matriz.DOBLE.ADT).toBeDefined();
    expect(matriz.DOBLE.ADT?.venta.unidades).toBe('1590000');
    expect(matriz.DOBLE.CHD?.venta.unidades).toBe('1110000');
    expect(matriz.DOBLE.INF?.venta.unidades).toBe('220000');
    expect(matriz.SENCILLA.ADT?.venta.unidades).toBe('2290000');
    expect(matriz.SENCILLA.CHD).toBeUndefined();
  });
});
