import { describe, expect, it } from 'vitest';
import {
  Mayorista as EsquemaMayorista,
  Paquete as EsquemaPaquete,
  Precio as EsquemaPrecio,
  Temporada as EsquemaTemporada,
  SalidaPublicada as EsquemaSalidaPublicada,
  type SalidaPublicada,
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
  calcularEstadoCupo,
  formatearChipSalida,
  obtenerEtiquetaPrecio,
  detectarTipoTurismo,
  formatearHorarioExcursion,
  requiereAvisoImpuestoMuelle,
  agruparSalidasPorProducto,
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
  // Pruebas T-018: Tarjeta y ficha de excursión en el catálogo
  // =============================================================================

  it('15. calcularEstadoCupo clasifica cupos disponibles, últimos cupos y agotado', () => {
    expect(calcularEstadoCupo(null)).toBe('DISPONIBLE');
    expect(calcularEstadoCupo(0)).toBe('AGOTADO');
    expect(calcularEstadoCupo(3)).toBe('ULTIMOS_CUPOS');
    expect(calcularEstadoCupo(5)).toBe('ULTIMOS_CUPOS');
    expect(calcularEstadoCupo(6)).toBe('DISPONIBLE');
    expect(calcularEstadoCupo(20)).toBe('DISPONIBLE');
  });

  it('16. formatearChipSalida genera etiquetas accesibles y formato amigable es-CO', () => {
    const salidaDispo = formatearChipSalida({
      vigenciaId: 'v1',
      fecha: '2026-10-03',
      cupoTotal: 12,
      desde: { unidades: '250000', moneda: 'COP' },
    });
    expect(salidaDispo.etiquetaFecha).toContain('3');
    expect(salidaDispo.etiquetaCupo).toBe('12 cupos');
    expect(salidaDispo.estadoCupo).toBe('DISPONIBLE');

    const salidaCritica = formatearChipSalida({
      vigenciaId: 'v2',
      fecha: '2026-10-04',
      cupoTotal: 4,
      desde: { unidades: '250000', moneda: 'COP' },
    });
    expect(salidaCritica.etiquetaCupo).toBe('quedan 4');
    expect(salidaCritica.estadoCupo).toBe('ULTIMOS_CUPOS');

    const salidaAgotada = formatearChipSalida({
      vigenciaId: 'v3',
      fecha: '2026-10-07',
      cupoTotal: 0,
      desde: { unidades: '250000', moneda: 'COP' },
    });
    expect(salidaAgotada.etiquetaCupo).toBe('Agotado');
    expect(salidaAgotada.estadoCupo).toBe('AGOTADO');

    const salidaAbierta = formatearChipSalida({
      vigenciaId: 'v4',
      fecha: '2026-10-10',
      cupoTotal: null,
      desde: { unidades: '250000', moneda: 'COP' },
    });
    expect(salidaAbierta.etiquetaCupo).toBe('Cupos abiertos');
    expect(salidaAbierta.estadoCupo).toBe('DISPONIBLE');
  });

  it('17. obtenerEtiquetaPrecio devuelve "Consultar" ante tarifas sin precio publicado o $0 (UX Turismo)', () => {
    expect(obtenerEtiquetaPrecio(null)).toBe('Consultar');
    expect(obtenerEtiquetaPrecio(undefined)).toBe('Consultar');
    expect(obtenerEtiquetaPrecio({ unidades: '0', moneda: 'COP' })).toBe('Consultar');

    const conPrecio = obtenerEtiquetaPrecio({ unidades: '250000', moneda: 'COP' });
    expect(conPrecio).toContain('Desde');
    expect(conPrecio).toContain('250.000');
    expect(conPrecio).toContain('por persona');
  });

  it('18. detectarTipoTurismo categoriza playa/náutico, naturaleza, aventura y cultural', () => {
    expect(detectarTipoTurismo('Cartagena', 'Pasadía Islas del Rosario VIP')).toBe('PLAYA_NAUTICO');
    expect(detectarTipoTurismo('San Andrés', 'Tour Bahía')).toBe('PLAYA_NAUTICO');
    expect(detectarTipoTurismo('Eje Cafetero', 'Puebleando en Quindío')).toBe('NATURALEZA');
    expect(detectarTipoTurismo('San Gil', 'Rafting en Río Fonce')).toBe('AVENTURA');
    expect(detectarTipoTurismo('Bogotá', 'City Tour Centro Histórico')).toBe('CULTURAL_CIUDAD');
  });

  it('19. formatearHorarioExcursion asigna turnos lógicos de operación', () => {
    expect(formatearHorarioExcursion(0, 'Pasadía Islas del Rosario')).toBe('07:30 - 16:30');
    expect(formatearHorarioExcursion(0, 'Tour Atardecer en la Bahía (Tarde)')).toBe(
      '14:00 - 19:30',
    );
    expect(formatearHorarioExcursion(0, 'Plancton Luminoso Nocturno')).toBe('18:30 - 22:30');
    expect(formatearHorarioExcursion(2, 'Puebleando en Quindío')).toBe('3 días / 2 noches');
  });

  it('20. requiereAvisoImpuestoMuelle detecta destinos marítimos e insulares', () => {
    expect(requiereAvisoImpuestoMuelle('Cartagena', 'Tour 5 Islas VIP')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Bolívar', 'Pasadía Barú Mambo Beach')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Buenaventura', 'Lancha a Piangüita')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Quindío', 'Parque del Café')).toBe(false);
  });

  it('21. agruparSalidasPorProducto consolida salidas en una sola tarjeta con chips cronológicos', () => {
    const salidasMixtas: SalidaPublicada[] = [
      {
        vigenciaId: 'v-10',
        paqueteId: 'pkg-islas',
        paqueteNombre: 'Pasadía Islas del Rosario & Barú VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-15',
        cupoTotal: 10,
        desde: { unidades: '260000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 2,
      },
      {
        vigenciaId: 'v-11',
        paqueteId: 'pkg-islas',
        paqueteNombre: 'Pasadía Islas del Rosario & Barú VIP',
        destino: 'Cartagena',
        noches: 0,
        fecha: '2026-10-04',
        cupoTotal: 3,
        desde: { unidades: '250000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 1,
      },
      {
        vigenciaId: 'v-12',
        paqueteId: 'pkg-eje',
        paqueteNombre: 'Puebleando en el Quindío',
        destino: 'Eje Cafetero',
        noches: 2,
        fecha: '2026-10-12',
        cupoTotal: 15,
        desde: { unidades: '410000', moneda: 'COP' },
        desdeEsDeGrupo: false,
        tarifas: 1,
      },
    ];

    const agrupados = agruparSalidasPorProducto(salidasMixtas);
    expect(agrupados.length).toBe(2);

    const islas = agrupados.find((p) => p.paqueteId === 'pkg-islas');
    expect(islas).toBeDefined();
    expect(islas!.nombre).toBe('Pasadía Islas del Rosario & Barú VIP');
    expect(islas!.tipoTurismo).toBe('PLAYA_NAUTICO');
    expect(islas!.requiereImpuestoMuelle).toBe(true);
    expect(islas!.tienePromo).toBe(true);
    expect(islas!.precioDesde?.unidades).toBe('250000');
    expect(islas!.salidas.length).toBe(2);
    // Deben estar ordenadas cronológicamente
    expect(islas!.salidas[0]!.fecha).toBe('2026-10-04');
    expect(islas!.salidas[0]!.estadoCupo).toBe('ULTIMOS_CUPOS');
    expect(islas!.salidas[1]!.fecha).toBe('2026-10-15');
    expect(islas!.salidas[1]!.estadoCupo).toBe('DISPONIBLE');
  });
});
