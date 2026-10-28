import { describe, expect, it } from 'vitest';
import {
  Mayorista as EsquemaMayorista,
  Paquete as EsquemaPaquete,
  Precio as EsquemaPrecio,
  Temporada as EsquemaTemporada,
  SalidaPublicada as EsquemaSalidaPublicada,
  type SalidaPublicada,
  type CargoEnDestino,
} from '@viajapro/contracts';
import { MOCK_MAYORISTAS, MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import {
  agruparPreciosPorAcomodacion,
  extraerDestinosDeSalidas,
  filtrarPaquetes,
  filtrarSalidasPublicadas,
  formatearNochesLabel,
  formatearCondicionDesde,
  obtenerPrecioDesde,
  verificarVigenciaTarifario,
  clasificarDisponibilidadCupos,
  formatearHorarioExcursion,
  interpretarPresentacionTarifa,
  verificarCargosEnDestinoSeparados,
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
          expect(pr.neto?.moneda).toBe('COP');
          expect(BigInt(pr.venta.unidades)).toBeGreaterThan(BigInt(pr.neto?.unidades ?? '0'));
        }
      }
    }
  });

  it('4. obtenerPrecioDesde calcula el valor mínimo de venta para adulto', () => {
    const paqueteSanAndres = MOCK_PAQUETES_CATALOGO[0]!;
    const precioDesde = obtenerPrecioDesde(paqueteSanAndres);

    expect(precioDesde).not.toBeNull();
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
    expect(resMayorista.length).toBe(4);
  });

  it('7. filtrarPaquetes filtra por plan de alimentación y solo vigentes', () => {
    const soloTodoIncluido = filtrarPaquetes(MOCK_PAQUETES_CATALOGO, {
      planAlimentacion: 'TODO_INCLUIDO',
    });
    expect(soloTodoIncluido.length).toBe(4);

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

  // =============================================================================
  // Pruebas 0c.16: Catálogo Real de Salidas Publicadas (ADR-0009)
  // =============================================================================

  const salidasEjemplo: SalidaPublicada[] = [
    {
      vigenciaId: '01a1387b-008e-7c51-aaf6-6a1f3e895732',
      paqueteId: '01a1387b-008e-7c51-aaf6-6a1f3e895731',
      paqueteNombre: 'Puebleando en el Quindío',
      destino: 'Eje Cafetero',
      noches: 2,
      fecha: '2026-10-03',
      cupoTotal: 20,
      desde: { unidades: '410000', moneda: 'COP' },
      desdeEsDeGrupo: false,
      tarifas: 2,
    },
    {
      vigenciaId: '01a1387a-cd9b-7313-9191-9e5e34f18768',
      paqueteId: '01a1387a-cd9b-7313-9191-9e5e34f18767',
      paqueteNombre: 'Parque Consotá',
      destino: 'Pereira',
      noches: 0,
      fecha: '2026-10-11',
      cupoTotal: null,
      desde: { unidades: '189000', moneda: 'COP' },
      desdeEsDeGrupo: true,
      tarifas: 3,
    },
    {
      vigenciaId: '01a1387a-cd9b-7313-9191-9e5e34f18769',
      paqueteId: '01a1387a-cd9b-7313-9191-9e5e34f18770',
      paqueteNombre: 'Piangüita + Ballenas',
      destino: 'Pacífico',
      noches: 1,
      fecha: '2026-10-17',
      cupoTotal: 15,
      desde: { unidades: '650000', moneda: 'COP' },
      desdeEsDeGrupo: false,
      tarifas: 1,
    },
  ];

  it('9. Todas las salidas ejemplo cumplen el contrato Zod oficial SalidaPublicada (R3)', () => {
    for (const s of salidasEjemplo) {
      const res = EsquemaSalidaPublicada.safeParse(s);
      expect(res.success).toBe(true);
    }
  });

  it('10. formatearNochesLabel devuelve "Pasadía" para 0 noches y plural para más', () => {
    expect(formatearNochesLabel(0)).toBe('Pasadía');
    expect(formatearNochesLabel(1)).toBe('1 noche');
    expect(formatearNochesLabel(2)).toBe('2 noches');
    expect(formatearNochesLabel(5)).toBe('5 noches');
  });

  it('11. extraerDestinosDeSalidas extrae destinos únicos y ordenados', () => {
    const destinos = extraerDestinosDeSalidas(salidasEjemplo);
    expect(destinos).toEqual(['Eje Cafetero', 'Pacífico', 'Pereira']);
  });

  it('12. filtrarSalidasPublicadas filtra por destino exacto o todos', () => {
    const filtroPereira = filtrarSalidasPublicadas(salidasEjemplo, { destino: 'Pereira' });
    expect(filtroPereira.length).toBe(1);
    expect(filtroPereira[0]!.paqueteNombre).toBe('Parque Consotá');

    const filtroTodos = filtrarSalidasPublicadas(salidasEjemplo, { destino: 'todos' });
    expect(filtroTodos.length).toBe(3);
  });

  it('13. filtrarSalidasPublicadas filtra por texto en nombre o destino', () => {
    const porNombre = filtrarSalidasPublicadas(salidasEjemplo, { busqueda: 'ballenas' });
    expect(porNombre.length).toBe(1);
    expect(porNombre[0]!.destino).toBe('Pacífico');

    const porDestino = filtrarSalidasPublicadas(salidasEjemplo, { busqueda: 'cafetero' });
    expect(porDestino.length).toBe(1);
    expect(porDestino[0]!.paqueteNombre).toBe('Puebleando en el Quindío');
  });

  it('14. formatearCondicionDesde avisa con honestidad si el desde proviene de una tarifa de grupo (0c.17)', () => {
    const salidaIndividual = salidasEjemplo[0]!;
    const infoIndiv = formatearCondicionDesde(salidaIndividual);
    expect(infoIndiv.esGrupo).toBe(false);
    expect(infoIndiv.subtitulo).toBe('por persona (COP)');
    expect(infoIndiv.aviso).toBeUndefined();

    const salidaGrupo = salidasEjemplo[1]!;
    const infoGrupo = formatearCondicionDesde(salidaGrupo);
    expect(infoGrupo.esGrupo).toBe(true);
    expect(infoGrupo.subtitulo).toContain('promo grupal');
    expect(infoGrupo.aviso).toContain('sujeto a compra en grupo');
  });

  // =============================================================================
  // Pruebas T-018 & T-051: Horarios, Cupos, Presentación Promo y Cargos en Destino
  // =============================================================================

  it('15. formatearHorarioExcursion formatea horas de salida y regreso correctamente', () => {
    expect(formatearHorarioExcursion('07:30', '16:00')).toBe('Salida: 07:30 · Regreso: 16:00');
    expect(formatearHorarioExcursion('08:00', null)).toBe('Salida: 08:00');
    expect(formatearHorarioExcursion(null, '17:00')).toBe('Regreso: 17:00');
    expect(formatearHorarioExcursion(null, null)).toBeNull();
  });

  it('16. clasificarDisponibilidadCupos clasifica urgencia de cupos (T-018)', () => {
    const disp = clasificarDisponibilidadCupos(15);
    expect(disp.estado).toBe('DISPONIBLE');
    expect(disp.etiqueta).toBe('15 cupos disponibles');

    const ultimos = clasificarDisponibilidadCupos(4);
    expect(ultimos.estado).toBe('ULTIMOS_CUPOS');
    expect(ultimos.etiqueta).toBe('Últimos 4 cupos');

    const agotado = clasificarDisponibilidadCupos(0);
    expect(agotado.estado).toBe('AGOTADO');
    expect(agotado.etiqueta).toBe('Agotado');

    const programada = clasificarDisponibilidadCupos(null);
    expect(programada.estado).toBe('PROGRAMADA');
    expect(programada.etiqueta).toBe('Salida programada');
  });

  it('17. interpretarPresentacionTarifa con política OCULTAR no tacha ni muestra leyenda (T-051)', () => {
    // Si la política es OCULTAR, la API devuelve venta sin listaTachada y sin leyenda
    const presentacionOcultar = {
      estado: 'PROMO_VENCIDA' as const,
      venta: { unidades: '220000', moneda: 'COP' as const },
      listaTachada: null,
      leyenda: null,
      promoVigente: false,
    };

    const res = interpretarPresentacionTarifa(presentacionOcultar);
    expect(res.mostrarTachado).toBe(false);
    expect(res.listaTachada).toBeNull();
    expect(res.mostrarLeyendaVencida).toBe(false);
    expect(res.promoVigente).toBe(false);
    expect(res.esConsultar).toBe(false);
  });

  it('18. interpretarPresentacionTarifa con política TACHAR muestra lista tachada y leyenda promo vencida (T-051)', () => {
    // Si la política es TACHAR, la API entrega listaTachada y leyenda: 'PROMO_VENCIDA'
    const presentacionTachar = {
      estado: 'PROMO_VENCIDA' as const,
      venta: { unidades: '220000', moneda: 'COP' as const },
      listaTachada: { unidades: '180000', moneda: 'COP' as const },
      leyenda: 'PROMO_VENCIDA' as const,
      promoVigente: false,
    };

    const res = interpretarPresentacionTarifa(presentacionTachar);
    expect(res.mostrarTachado).toBe(true);
    expect(res.listaTachada?.unidades).toBe('180000');
    expect(res.mostrarLeyendaVencida).toBe(true);
    expect(res.promoVigente).toBe(false);
    expect(res.esConsultar).toBe(false);
  });

  it('19. verificarCargosEnDestinoSeparados asegura que los cargos nunca se suman al total (T-051 / ADR-0017 §9)', () => {
    const totalPaquete = { unidades: '250000', moneda: 'COP' as const };
    const cargosDestino: CargoEnDestino[] = [
      {
        concepto: 'Impuesto de muelle La Bodeguita',
        monto: { unidades: '26500', moneda: 'COP' as const },
        unidad: 'POR_PERSONA',
      },
      {
        concepto: 'Entrada Parque Nacional Corales',
        monto: { unidades: '15000', moneda: 'COP' as const },
        unidad: 'POR_PERSONA',
      },
    ];

    const resultado = verificarCargosEnDestinoSeparados(totalPaquete, cargosDestino);

    // El total de la agencia se mantiene estrictamente igual al precio del paquete, sin sumarle los cargos
    expect(resultado.totalAgencia.unidades).toBe('250000');
    expect(resultado.totalNuncaIncluyeCargos).toBe(true);
    expect(resultado.cargosEnDestino.length).toBe(2);
    expect(resultado.sumaCargosEnDestino?.unidades).toBe('41500');
    expect(resultado.sumaCargosEnDestino?.moneda).toBe('COP');
  });
});
