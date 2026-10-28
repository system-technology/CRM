import { describe, expect, it } from 'vitest';
import type { VersionDeCotizacion } from '@viajapro/contracts';
import {
  armarComposicionDeVersion,
  armarCuerpoAnadirVersion,
  armarCuerpoGuardarCotizacion,
  interpretarErrorCotizaciones,
  obtenerUltimaVersion,
  ordenarVersiones,
  sugerirTituloCotizacion,
  generarMensajeWhatsAppCotizacion,
  generarEnlaceWhatsApp,
  duplicarVersionComoComposicion,
  duplicarCotizacionComoEntrada,
  calcularDesgloseMargen,
} from './cotizaciones-logica';

describe('cotizaciones-logica (0c.22)', () => {
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';
  const CONTACTO_ID = '00000000-0002-4000-8000-000000000001';
  const OPORTUNIDAD_ID = '01932000-0000-7000-8000-000000000099';

  describe('armarComposicionDeVersion', () => {
    it('filtra estrictamente cualquier campo monetario o extraño (invariante R3)', () => {
      const entradaSucia = {
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        ninos: 1,
        infantes: 0,
        acomodacion: 'DOBLE' as const,
        // Campos que jamás deben filtrarse a la API
        totalVenta: 5000000,
        precioUnitario: 2500000,
        neto: 4000000,
        margen: 1000000,
      };

      const composicion = armarComposicionDeVersion(entradaSucia);

      expect(composicion).toEqual({
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        ninos: 1,
        infantes: 0,
        acomodacion: 'DOBLE',
      });
      // Verificamos que no contiene ninguna clave de importe
      expect('totalVenta' in composicion).toBe(false);
      expect('precioUnitario' in composicion).toBe(false);
      expect('neto' in composicion).toBe(false);
      expect('margen' in composicion).toBe(false);
    });

    it('incluye vigenteHasta si viene especificada', () => {
      const composicion = armarComposicionDeVersion({
        paqueteId: PAQUETE_ID,
        fecha: '2026-10-03',
        adultos: 2,
        vigenteHasta: '2026-10-20',
      });

      expect(composicion.vigenteHasta).toBe('2026-10-20');
    });
  });

  describe('armarCuerpoGuardarCotizacion', () => {
    it('construye GuardarCotizacion válido con versión 1 estricta', () => {
      const cuerpo = armarCuerpoGuardarCotizacion({
        contactoId: CONTACTO_ID,
        oportunidadId: OPORTUNIDAD_ID,
        titulo: 'Cotización San Andrés para Juan Pérez',
        composicion: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });

      expect(cuerpo).toEqual({
        contactoId: CONTACTO_ID,
        oportunidadId: OPORTUNIDAD_ID,
        titulo: 'Cotización San Andrés para Juan Pérez',
        version: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });
    });

    it('omite oportunidadId si viene vacía o indefinida', () => {
      const cuerpo = armarCuerpoGuardarCotizacion({
        contactoId: CONTACTO_ID,
        oportunidadId: '',
        titulo: 'Cotización Sin Oportunidad',
        composicion: {
          paqueteId: PAQUETE_ID,
          fecha: '2026-10-03',
          adultos: 2,
        },
      });

      expect(cuerpo.oportunidadId).toBeUndefined();
    });
  });

  describe('armarCuerpoAnadirVersion', () => {
    it('construye AnadirVersionACotizacion sin importes', () => {
      const cuerpo = armarCuerpoAnadirVersion({
        paqueteId: PAQUETE_ID,
        fecha: '2026-11-15',
        adultos: 4,
        ninos: 2,
        acomodacion: 'TRIPLE',
        // intento de pasar importe
        venta: 12000000,
      });

      expect(cuerpo).toEqual({
        paqueteId: PAQUETE_ID,
        fecha: '2026-11-15',
        adultos: 4,
        ninos: 2,
        acomodacion: 'TRIPLE',
      });
      expect('venta' in cuerpo).toBe(false);
    });
  });

  describe('ordenarVersiones y obtenerUltimaVersion', () => {
    const version1 = {
      id: '01932000-0000-7000-8000-000000000011',
      numero: 1,
      creadaEn: '2026-10-19T10:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    const version2 = {
      id: '01932000-0000-7000-8000-000000000012',
      numero: 2,
      creadaEn: '2026-10-19T11:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    const version3 = {
      id: '01932000-0000-7000-8000-000000000013',
      numero: 3,
      creadaEn: '2026-10-19T12:00:00.000Z',
    } as unknown as VersionDeCotizacion;

    it('ordena ascendentemente (1, 2, 3)', () => {
      const ordenadas = ordenarVersiones([version2, version3, version1], 'asc');
      expect(ordenadas.map((v) => v.numero)).toEqual([1, 2, 3]);
    });

    it('ordena descendentemente (3, 2, 1)', () => {
      const ordenadas = ordenarVersiones([version2, version1, version3], 'desc');
      expect(ordenadas.map((v) => v.numero)).toEqual([3, 2, 1]);
    });

    it('obtiene la versión más reciente', () => {
      const ultima = obtenerUltimaVersion([version2, version1, version3]);
      expect(ultima?.numero).toBe(3);
    });

    it('devuelve undefined si la lista está vacía', () => {
      expect(obtenerUltimaVersion([])).toBeUndefined();
    });
  });

  describe('sugerirTituloCotizacion', () => {
    it('genera un título limpio eliminando guiones de descripción', () => {
      const titulo = sugerirTituloCotizacion(
        'San Andrés — 4 días / 3 noches, todo incluido',
        '2026-10-03',
      );
      expect(titulo).toBe('Cotización San Andrés (2026-10-03)');
    });
  });

  describe('interpretarErrorCotizaciones', () => {
    it('traduce 404 de cotización no encontrada honestamente', () => {
      const err = interpretarErrorCotizaciones({ code: 'COTIZACION_NO_ENCONTRADA' });
      expect(err.codigo).toBe('COTIZACION_NO_ENCONTRADA');
      expect(err.mensaje).toContain('no existe');
      expect(err.esErrorAgencia).toBe(false);
    });

    it('traduce falta de tenant en desarrollo', () => {
      const err = interpretarErrorCotizaciones({ code: 'SIN_SESION' });
      expect(err.esErrorAgencia).toBe(true);
      expect(err.mensaje).toContain('identificar la agencia activa');
    });

    it('maneja fallos desconocidos sin crashear', () => {
      const err = interpretarErrorCotizaciones(new Error('Fallo de red'));
      expect(err.codigo).toBe('DESCONOCIDO');
      expect(err.mensaje).toBe('Fallo de red');
    });
  });

  describe('generarMensajeWhatsAppCotizacion (T-107 / R10)', () => {
    const versionMock: VersionDeCotizacion = {
      id: '01932000-0000-7000-8000-000000000011',
      numero: 1,
      creadaEn: '2026-10-25T10:00:00.000Z',
      paqueteId: PAQUETE_ID,
      paqueteNombre: 'Escape Caribeño San Andrés',
      destino: 'San Andrés',
      noches: 4,
      fechaSalida: '2026-11-10',
      vigenciaId: '01932000-0000-7000-8000-000000000001',
      vigenciaDesde: '2026-11-01',
      vigenciaHasta: '2026-11-30',
      deSalidaProgramada: true,
      adultos: 2,
      ninos: 1,
      infantes: 0,
      acomodacion: 'DOBLE',
      lineas: [
        {
          tarifaId: '01932000-0000-7000-8000-000000000091',
          nombre: 'Adulto en acomodación DOBLE',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 2,
          precioUnitario: { unidades: '2500000', moneda: 'COP' },
          total: { unidades: '5000000', moneda: 'COP' },
          masBarata: false,
        },
        {
          tarifaId: '01932000-0000-7000-8000-000000000092',
          nombre: 'Niño (2-11 años)',
          unidad: 'POR_PERSONA',
          cubrePasajeros: 1,
          veces: 1,
          precioUnitario: { unidades: '1750000', moneda: 'COP' },
          total: { unidades: '1750000', moneda: 'COP' },
          masBarata: false,
        },
      ],
      venta: { unidades: '6750000', moneda: 'COP' },
      vigenteHasta: '2026-10-31',
      neto: { unidades: '5800000', moneda: 'COP' },
      margen: { unidades: '950000', moneda: 'COP' },
    };

    it('genera propuesta formateada con total de venta y CERO filtración de neto o margen (R10)', () => {
      const msg = generarMensajeWhatsAppCotizacion(
        { titulo: 'Cotización San Andrés Familiar' },
        versionMock,
        { contactoNombre: 'Laura Gómez' },
      );

      expect(msg).toContain('¡Hola, Laura Gómez!');
      expect(msg).toContain('ESCAPE CARIBEÑO SAN ANDRÉS');
      expect(msg).toContain('Destino:* San Andrés');
      expect(msg).toContain('Pasajeros:* 2 adulto(s), 1 niño(s)');
      expect(msg).toContain('TOTAL VENTA:* *$ 6.750.000*');
      expect(msg).toContain('Oferta vigente hasta:* sáb 31 oct 2026');

      // Regla R10: Jamás debe aparecer neto, margen ni costos de mayorista
      expect(msg).not.toContain('5800000');
      expect(msg).not.toContain('5.800.000');
      expect(msg).not.toContain('950000');
      expect(msg).not.toContain('950.000');
      expect(msg.toLowerCase()).not.toContain('neto');
      expect(msg.toLowerCase()).not.toContain('margen');
    });

    it('usa nombre genérico Viajero si no se especifica contactoNombre', () => {
      const msg = generarMensajeWhatsAppCotizacion(
        { titulo: 'Cotización San Andrés' },
        versionMock,
      );
      expect(msg).toContain('¡Hola, Viajero!');
    });
  });

  describe('generarEnlaceWhatsApp', () => {
    it('construye enlace wa.me limpio eliminando caracteres no numéricos', () => {
      const enlace = generarEnlaceWhatsApp('+57 (300) 123-4567', 'Hola Cotización');
      expect(enlace).toContain('https://wa.me/573001234567?text=Hola%20Cotizaci%C3%B3n');
    });
  });

  describe('duplicarVersionComoComposicion (T-107)', () => {
    it('extrae la composición limpia de una versión sin importes para versión N+1', () => {
      const version: VersionDeCotizacion = {
        id: '01932000-0000-7000-8000-000000000011',
        numero: 2,
        creadaEn: '2026-10-25T10:00:00.000Z',
        paqueteId: PAQUETE_ID,
        paqueteNombre: 'Cartagena Histórica',
        destino: 'Cartagena',
        noches: 3,
        fechaSalida: '2026-12-05',
        vigenciaId: '01932000-0000-7000-8000-000000000001',
        vigenciaDesde: '2026-12-01',
        vigenciaHasta: '2026-12-20',
        deSalidaProgramada: true,
        adultos: 3,
        ninos: 0,
        infantes: 0,
        acomodacion: 'TRIPLE',
        lineas: [],
        venta: { unidades: '4500000', moneda: 'COP' },
        vigenteHasta: '2026-11-20',
        neto: { unidades: '3800000', moneda: 'COP' },
      };

      const composicion = duplicarVersionComoComposicion(version);

      expect(composicion).toEqual({
        paqueteId: PAQUETE_ID,
        fecha: '2026-12-05',
        adultos: 3,
        ninos: 0,
        infantes: 0,
        acomodacion: 'TRIPLE',
        vigenteHasta: '2026-11-20',
      });
      expect('venta' in composicion).toBe(false);
      expect('neto' in composicion).toBe(false);
    });
  });

  describe('duplicarCotizacionComoEntrada (T-107)', () => {
    it('genera cuerpo GuardarCotizacion válido con título (Copia)', () => {
      const cotizacion = {
        id: '01932000-0000-7000-8000-000000000099',
        contactoId: CONTACTO_ID,
        oportunidadId: OPORTUNIDAD_ID,
        titulo: 'Cotización Luna de Miel',
        estado: 'ENVIADA' as const,
        versionEnviada: 1,
        enviadaEn: '2026-10-20T10:00:00.000Z',
        creadaEn: '2026-10-20T09:00:00.000Z',
        actualizadaEn: '2026-10-20T10:00:00.000Z',
        versiones: [
          {
            id: '01932000-0000-7000-8000-000000000011',
            numero: 1,
            creadaEn: '2026-10-20T09:00:00.000Z',
            paqueteId: PAQUETE_ID,
            paqueteNombre: 'Cancún Todo Incluido',
            destino: 'Cancún',
            noches: 5,
            fechaSalida: '2026-11-15',
            vigenciaId: '01932000-0000-7000-8000-000000000001',
            vigenciaDesde: '2026-11-01',
            vigenciaHasta: '2026-11-30',
            deSalidaProgramada: true,
            adultos: 2,
            ninos: 0,
            infantes: 0,
            acomodacion: 'DOBLE' as const,
            lineas: [],
            venta: { unidades: '8000000', moneda: 'COP' as const },
            vigenteHasta: null,
          },
        ],
      };

      const cuerpo = duplicarCotizacionComoEntrada(cotizacion);

      expect(cuerpo.contactoId).toBe(CONTACTO_ID);
      expect(cuerpo.oportunidadId).toBe(OPORTUNIDAD_ID);
      expect(cuerpo.titulo).toBe('Cotización Luna de Miel (Copia)');
      expect(cuerpo.version.paqueteId).toBe(PAQUETE_ID);
      expect(cuerpo.version.adultos).toBe(2);
    });
  });

  describe('calcularDesgloseMargen (ADR-0011 & R10)', () => {
    const versionConMargen: VersionDeCotizacion = {
      id: '01932000-0000-7000-8000-000000000011',
      numero: 1,
      creadaEn: '2026-10-20T09:00:00.000Z',
      paqueteId: PAQUETE_ID,
      paqueteNombre: 'Paquete Margen',
      destino: 'Destino',
      noches: 3,
      fechaSalida: '2026-11-15',
      vigenciaId: '01932000-0000-7000-8000-000000000001',
      vigenciaDesde: '2026-11-01',
      vigenciaHasta: '2026-11-30',
      deSalidaProgramada: true,
      adultos: 2,
      ninos: 0,
      infantes: 0,
      acomodacion: 'DOBLE',
      lineas: [],
      venta: { unidades: '10000000', moneda: 'COP' },
      neto: { unidades: '8500000', moneda: 'COP' },
      margen: { unidades: '1500000', moneda: 'COP' },
      politica: {
        porcentaje: 17.6,
        base: 'SOBRE_EL_NETO',
        origenDeLaVenta: 'DERIVADA_DEL_NETO',
        redondeoVenta: 1000,
      },
      vigenteHasta: null,
    };

    it('devuelve visible: false y CERO datos confidenciales si puedeVerNeto es false', () => {
      const desglose = calcularDesgloseMargen(versionConMargen, false);
      expect(desglose.visible).toBe(false);
      expect(desglose.netoTotalCOP).toBeUndefined();
      expect(desglose.margenBrutoCOP).toBeUndefined();
      expect(desglose.margenPorcentaje).toBeUndefined();
      expect(desglose.ventaTotalCOP).toBeUndefined();
    });

    it('calcula y revela desglose de costos y margen comercial si puedeVerNeto es true', () => {
      const desglose = calcularDesgloseMargen(versionConMargen, true);
      expect(desglose.visible).toBe(true);
      expect(desglose.ventaTotalCOP).toBe(10000000);
      expect(desglose.netoTotalCOP).toBe(8500000);
      expect(desglose.margenBrutoCOP).toBe(1500000);
      expect(desglose.margenPorcentaje).toBe(15);
      expect(desglose.baseCalculo).toBe('SOBRE_EL_NETO');
    });
  });
});
