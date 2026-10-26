import { describe, expect, it } from 'vitest';
import {
  CotizacionCalculada as EsquemaCotizacion,
  CotizacionDeSalida as EsquemaCotizacionDeSalida,
  type CotizacionDeSalida,
} from '@viajapro/contracts';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import {
  calcularCotizacionMock,
  generarTextoPropuestaWhatsApp,
  generarTextoPropuestaWhatsAppSalida,
  interpretarErrorCotizacion,
  requiereAvisoImpuestoMuelle,
} from './cotizador-logica';

describe('Pruebas del Módulo de Cotización y Generación de Propuestas', () => {
  const paqueteSanAndres =
    MOCK_PAQUETES_CATALOGO.find((p) => p.destino === 'San Andrés') ?? MOCK_PAQUETES_CATALOGO[0]!;

  it('1. calcularCotizacionMock produce una cotización válida según el contrato Zod oficial (R3)', () => {
    const cotizacion = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 2, ninos: 1, infantes: 0 },
        acomodacion: 'TRIPLE',
      },
      paqueteSanAndres,
    );

    const validacion = EsquemaCotizacion.safeParse(cotizacion);
    expect(validacion.success).toBe(true);
    expect(cotizacion.destino).toBe('San Andrés');
    expect(cotizacion.lineas.length).toBe(2);
    expect(cotizacion.totalVenta.moneda).toBe('COP');
    expect(BigInt(cotizacion.totalVenta.unidades)).toBeGreaterThan(0n);
  });

  it('2. calcularCotizacionMock detecta plazas sin usar cuando la acomodación supera los ocupantes', () => {
    const cotizacion = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 3, ninos: 0, infantes: 0 },
        acomodacion: 'DOBLE',
      },
      paqueteSanAndres,
    );

    expect(cotizacion.habitaciones.length).toBe(2);
    expect(cotizacion.plazasSinUsar).toBe(1);
  });

  it('3. calcularCotizacionMock aplica el markup adicional sobre la tarifa de venta', () => {
    const cotizacionBase = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 2, ninos: 0, infantes: 0 },
        acomodacion: 'DOBLE',
        markupExtra: 0,
      },
      paqueteSanAndres,
    );

    const cotizacionConMarkup = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 2, ninos: 0, infantes: 0 },
        acomodacion: 'DOBLE',
        markupExtra: 10,
      },
      paqueteSanAndres,
    );

    const totalBase = Number(cotizacionBase.totalVenta.unidades);
    const totalConMarkup = Number(cotizacionConMarkup.totalVenta.unidades);

    expect(totalConMarkup).toBeGreaterThan(totalBase);
    expect(Math.round(totalBase * 1.1)).toBeCloseTo(totalConMarkup, -2);
  });

  it('4. generarTextoPropuestaWhatsApp formatea la propuesta completa para WhatsApp', () => {
    const cotizacion = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 2, ninos: 1, infantes: 0 },
        acomodacion: 'TRIPLE',
      },
      paqueteSanAndres,
    );

    const texto = generarTextoPropuestaWhatsApp(cotizacion, { contactoNombre: 'Carolina' });

    expect(texto).toContain('¡Hola, Carolina!');
    expect(texto).toContain('San Andrés');
    expect(texto).toContain('Acomodación:');
    expect(texto).toContain('2x Adulto');
    expect(texto).toContain('1x Niño');
    expect(texto).toContain('TOTAL VENTA:');
  });

  it('5. generarTextoPropuestaWhatsApp protege confidencialidad omitiendo tarifa neta y margen por defecto (R10)', () => {
    const cotizacion = calcularCotizacionMock(
      {
        paqueteId: paqueteSanAndres.id,
        fechaSalida: '2027-03-15',
        pasajeros: { adultos: 2, ninos: 0, infantes: 0 },
        acomodacion: 'DOBLE',
      },
      paqueteSanAndres,
    );

    const textoPublico = generarTextoPropuestaWhatsApp(cotizacion);
    expect(textoPublico).not.toContain('Costo Neto:');
    expect(textoPublico).not.toContain('Margen:');
    expect(textoPublico).not.toContain('[CONFIDENCIAL AGENCIA]');

    const textoAuditoria = generarTextoPropuestaWhatsApp(cotizacion, { incluirNeto: true });
    expect(textoAuditoria).toContain('Costo Neto:');
    expect(textoAuditoria).toContain('Margen:');
    expect(textoAuditoria).toContain('[CONFIDENCIAL AGENCIA]');
  });

  // =============================================================================
  // Pruebas 0c.16: Cotización Armada de Salidas Reales (ADR-0009)
  // =============================================================================

  const cotizacionArmadaEjemplo: CotizacionDeSalida = {
    paqueteId: '01a1387b-008e-7c51-aaf6-6a1f3e895731',
    paqueteNombre: 'Puebleando en el Quindío',
    destino: 'Eje Cafetero',
    noches: 2,
    fecha: '2026-10-03',
    vigenciaId: '01a1387b-008e-7c51-aaf6-6a1f3e895732',
    vigenciaDesde: '2026-10-03',
    vigenciaHasta: '2026-10-03',
    deSalidaProgramada: true,
    pideComposicion: true,
    pasajeros: 3,
    adultos: 2,
    ninos: 1,
    infantes: 0,
    lineas: [
      {
        tarifaId: '01a1387b-008e-7c51-aaf6-6a1f3e895733',
        nombre: 'Adulto',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        precioUnitario: { unidades: '410000', moneda: 'COP' },
        veces: 2,
        total: { unidades: '820000', moneda: 'COP' },
        margen: { unidades: '60000', moneda: 'COP' },
        margenPorcentaje: 14.6,
        masBarata: false,
      },
      {
        tarifaId: '01a1387b-008e-7c51-aaf6-6a1f3e895734',
        nombre: 'Niño',
        unidad: 'POR_PERSONA',
        cubrePasajeros: 1,
        precioUnitario: { unidades: '250000', moneda: 'COP' },
        veces: 1,
        total: { unidades: '250000', moneda: 'COP' },
        margen: { unidades: '30000', moneda: 'COP' },
        margenPorcentaje: 12.0,
        masBarata: false,
      },
    ],
    total: { unidades: '1070000', moneda: 'COP' },
    alternativas: [],
    noAplicables: [],
    suplementos: [],
  };

  it('6. cotizacionArmadaEjemplo valida con el contrato Zod oficial CotizacionDeSalida (R3)', () => {
    const res = EsquemaCotizacionDeSalida.safeParse(cotizacionArmadaEjemplo);
    expect(res.success).toBe(true);
  });

  it('7. generarTextoPropuestaWhatsAppSalida formatea desglose armado y total protagonista', () => {
    const texto = generarTextoPropuestaWhatsAppSalida(cotizacionArmadaEjemplo, {
      contactoNombre: 'Don Andrés',
    });

    expect(texto).toContain('¡Hola, Don Andrés!');
    expect(texto).toContain('PUEBLEANDO EN EL QUINDÍO');
    expect(texto).toContain('Salida confirmada');
    expect(texto).toContain('2026-10-03');
    expect(texto).toContain('3 persona(s)');
    expect(texto).toContain('2 adulto(s), 1 niño(s)');
    expect(texto).toContain('Adulto 2x');
    expect(texto).toContain('Niño');
    expect(texto).toContain('TOTAL A PAGAR:');
    expect(texto).toContain('1.070.000');
    // R10: Sin costo neto ni margen
    expect(texto).not.toContain('margen');
    expect(texto).not.toContain('neto');
  });

  it('8. generarTextoPropuestaWhatsAppSalida avisa si es vigencia abierta (deSalidaProgramada=false)', () => {
    const cotizacionAbierta: CotizacionDeSalida = {
      ...cotizacionArmadaEjemplo,
      deSalidaProgramada: false,
    };

    const texto = generarTextoPropuestaWhatsAppSalida(cotizacionAbierta);
    expect(texto).toContain('Bajo consulta de cupo - Vigencia abierta');
  });

  it('9. interpretarErrorCotizacion maneja códigos de dominio SIN_VIGENCIA y VIGENCIAS_EMPATADAS (0c.16)', () => {
    const errSinVigencia = interpretarErrorCotizacion({ code: 'SIN_VIGENCIA' });
    expect(errSinVigencia.codigo).toBe('SIN_VIGENCIA');
    expect(errSinVigencia.mensaje).toContain('No hay precio ni salida disponible');
    expect(errSinVigencia.esErrorAgencia).toBe(false);

    const errEmpatadas = interpretarErrorCotizacion({ code: 'VIGENCIAS_EMPATADAS' });
    expect(errEmpatadas.codigo).toBe('VIGENCIAS_EMPATADAS');
    expect(errEmpatadas.mensaje).toContain('dos ventanas de vigencia solapadas');
    expect(errEmpatadas.esErrorAgencia).toBe(true);
  });

  it('10. generarTextoPropuestaWhatsAppSalida incluye nota explícita de condición cuando hay tarifas de grupo (0c.17)', () => {
    const cotizacionConGrupo: CotizacionDeSalida = {
      ...cotizacionArmadaEjemplo,
      lineas: [
        {
          tarifaId: '01a1387b-008e-7c51-aaf6-6a1f3e895799',
          nombre: 'Promo Pareja',
          unidad: 'POR_GRUPO',
          cubrePasajeros: 2,
          precioUnitario: { unidades: '280000', moneda: 'COP' },
          veces: 1,
          total: { unidades: '280000', moneda: 'COP' },
          masBarata: true,
        },
      ],
      total: { unidades: '280000', moneda: 'COP' },
    };

    const texto = generarTextoPropuestaWhatsAppSalida(cotizacionConGrupo);
    expect(texto).toContain('Tarifa de grupo para 2 personas');
    expect(texto).toContain('Nota de tarifa grupal');
    expect(texto).toContain('condicionada a la cantidad mínima de pasajeros');
  });
  it('11. requiereAvisoImpuestoMuelle detecta destinos marítimos / náuticos que exigen tasa portuaria', () => {
    expect(requiereAvisoImpuestoMuelle('Cartagena', 'Pasadía Islas del Rosario')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Barú', 'Pasadía Playa Blanca')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Cartagena', 'Tour Cholón en lancha')).toBe(true);
    expect(requiereAvisoImpuestoMuelle('Buenaventura', 'Playa Pianguita + Ballenas')).toBe(true);

    // Destinos de interior sin muelle
    expect(requiereAvisoImpuestoMuelle('Eje Cafetero', 'Parque del Café')).toBe(false);
    expect(requiereAvisoImpuestoMuelle('Medellín', 'Tour Guatapé y Peñol')).toBe(false);
    expect(requiereAvisoImpuestoMuelle('Bogotá', 'Catedral de Sal')).toBe(false);
  });

  it('12. generarTextoPropuestaWhatsAppSalida incluye aviso de impuesto de muelle en tours náuticos', () => {
    const cotizacionCartagena: CotizacionDeSalida = {
      ...cotizacionArmadaEjemplo,
      destino: 'Cartagena',
      paqueteNombre: 'Pasadía Islas del Rosario VIP',
      noches: 0,
    };

    const texto = generarTextoPropuestaWhatsAppSalida(cotizacionCartagena);
    expect(texto).toContain('Impuesto de muelle no incluido');
    expect(texto).toContain('tasa portuaria requerida al abordar en taquilla del muelle');
  });

  it('13. calcularCotizacionMock para excursión de un día (noches=0) no penaliza con plazas sin usar y calcula precio COP por persona', () => {
    const pasadiaCartagena = MOCK_PAQUETES_CATALOGO.find((p) => p.noches === 0)!;
    expect(pasadiaCartagena).toBeDefined();

    const cotizacion = calcularCotizacionMock(
      {
        paqueteId: pasadiaCartagena.id,
        fechaSalida: '2026-10-15',
        pasajeros: { adultos: 2, ninos: 1, infantes: 0 },
        acomodacion: 'DOBLE',
      },
      pasadiaCartagena,
    );

    expect(cotizacion.plazasSinUsar).toBe(0);
    expect(cotizacion.fechaRegreso).toBe('2026-10-15'); // Mismo día
    expect(cotizacion.lineas.length).toBe(2); // Adulto y Niño
    expect(BigInt(cotizacion.totalVenta.unidades)).toBeGreaterThan(0n);

    // Texto WhatsApp debe contener aviso de muelle
    const texto = generarTextoPropuestaWhatsApp(cotizacion);
    expect(texto).toContain('Impuesto de muelle no incluido');
  });
});
