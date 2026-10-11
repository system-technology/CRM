import { describe, expect, it } from 'vitest';
import { CotizacionCalculada as EsquemaCotizacion } from '@viajapro/contracts';
import { MOCK_PAQUETES_CATALOGO } from './mock-catalogo';
import { calcularCotizacionMock, generarTextoPropuestaWhatsApp } from './cotizador-logica';

describe('Pruebas del Módulo de Cotización y Generación de Propuestas', () => {
  const paqueteSanAndres = MOCK_PAQUETES_CATALOGO[0]!;

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
    expect(cotizacion.lineas.length).toBe(2); // Adultos y Niños
    expect(cotizacion.totalVenta.moneda).toBe('COP');
    expect(BigInt(cotizacion.totalVenta.unidades)).toBeGreaterThan(0n);
  });

  it('2. calcularCotizacionMock detecta plazas sin usar cuando la acomodación supera los ocupantes', () => {
    // 3 adultos en acomodación DOBLE requieren 2 habitaciones dobles = 4 plazas. 1 plaza sin usar.
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
        markupExtra: 10, // 10% adicional
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
});
