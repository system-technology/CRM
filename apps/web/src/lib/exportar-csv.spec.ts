import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Contacto, Oportunidad, FilaDeCotizacion } from '@viajapro/contracts';
import {
  BOM_UTF8,
  sanitizarInyeccionFormula,
  escaparCeldaCSV,
  generarCSV,
  exportarContactosCSV,
  exportarOportunidadesCSV,
  exportarCotizacionesCSV,
  descargarArchivoCSV,
} from './exportar-csv';

describe('Exportación a CSV es-CO y Protección de Fórmulas (T-119)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Protección contra Inyección de Fórmulas (CWE-1236)', () => {
    it('antepone un apóstrofo si el valor comienza por "=" (fórmulas Excel)', () => {
      expect(sanitizarInyeccionFormula('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizarInyeccionFormula("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    });

    it('antepone un apóstrofo si el valor comienza por "+" o "-"', () => {
      expect(sanitizarInyeccionFormula('+573001234567')).toBe("'+573001234567");
      expect(sanitizarInyeccionFormula('-2+3*cmd')).toBe("'-2+3*cmd");
      expect(sanitizarInyeccionFormula('-Descuento')).toBe("'-Descuento");
    });

    it('antepone un apóstrofo si el valor comienza por "@" o caracteres de control', () => {
      expect(sanitizarInyeccionFormula('@SUM(1,2)')).toBe("'@SUM(1,2)");
      expect(sanitizarInyeccionFormula('\tTabulado')).toBe("'\tTabulado");
      expect(sanitizarInyeccionFormula('\rRetorno')).toBe("'\rRetorno");
    });

    it('no modifica valores regulares seguros', () => {
      expect(sanitizarInyeccionFormula('Valeria Gómez')).toBe('Valeria Gómez');
      expect(sanitizarInyeccionFormula('Cartagena 2026')).toBe('Cartagena 2026');
      expect(sanitizarInyeccionFormula('')).toBe('');
      expect(sanitizarInyeccionFormula('12345')).toBe('12345');
    });

    it('escaparCeldaCSV maneja de forma segura valores nulos, numéricos y caracteres especiales', () => {
      expect(escaparCeldaCSV(null)).toBe('');
      expect(escaparCeldaCSV(undefined)).toBe('');
      expect(escaparCeldaCSV(150000)).toBe('150000');
      // Con comillas dobles y separador punto y coma
      expect(escaparCeldaCSV('Paquete; "VIP"')).toBe('"Paquete; ""VIP"""');
      // Con inyección de fórmula y salto de línea
      expect(escaparCeldaCSV('=SUM(A1)\nB2')).toBe('"\'=SUM(A1)\nB2"');
    });
  });

  describe('2. Estructura es-CO del CSV (separador ";" y UTF-8 con BOM)', () => {
    it('genera archivo con BOM inicial y separador punto y coma por defecto', () => {
      const encabezados = ['Nombre', 'Destino', 'Precio'];
      const filas = [
        ['Carlos Asesor', 'San Andrés', '1.500.000'],
        ['María Pérez', 'Eje Cafetero', '900.000'],
      ];

      const csv = generarCSV(encabezados, filas);

      expect(csv.startsWith(BOM_UTF8)).toBe(true);
      expect(csv).toContain('Nombre;Destino;Precio');
      expect(csv).toContain('Carlos Asesor;San Andrés;1.500.000');
      expect(csv).toContain('María Pérez;Eje Cafetero;900.000');
      expect(csv).toContain('\r\n');
    });

    it('permite omitir el BOM si se solicita explícitamente', () => {
      const csv = generarCSV(['Col1'], [['Val1']], { incluirBOM: false });
      expect(csv.startsWith(BOM_UTF8)).toBe(false);
      expect(csv).toBe('Col1\r\nVal1');
    });
  });

  describe('3. Exportación de Contactos (exportarContactosCSV)', () => {
    const contactosMock: Contacto[] = [
      {
        id: '00000000-0002-4000-8000-000000000001',
        nombre: 'Valeria Gómez',
        telefono: '+573001234567',
        correo: 'valeria@ejemplo.co',
        etiquetas: ['VIP', 'Caribe'],
        preferencias: 'Hotel 5 estrellas',
        consentimientos: ['TRANSACCIONAL', 'PROMOCIONAL'],
        creadoEn: '2026-10-15T15:30:00.000Z',
        ultimoContactoEn: '2026-10-24T18:00:00.000Z',
      },
      {
        id: '00000000-0002-4000-8000-000000000002',
        nombre: '=HYPERLINK("http://attacker.com")',
        telefono: '+573109876543',
        correo: null,
        etiquetas: [],
        preferencias: null,
        consentimientos: ['TRANSACCIONAL'],
        creadoEn: '2026-10-18T10:00:00.000Z',
        ultimoContactoEn: null,
      },
    ];

    it('exporta contactos con formato es-CO y protege contra inyección en nombres y teléfonos', () => {
      const csv = exportarContactosCSV(contactosMock);

      expect(csv.startsWith(BOM_UTF8)).toBe(true);
      expect(csv).toContain('ID;Nombre;Teléfono;Correo electrónico;Etiquetas;Consentimientos');
      expect(csv).toContain("Valeria Gómez;'+573001234567;valeria@ejemplo.co;VIP, Caribe");
      // Nombre malicioso sanitizado con apóstrofo
      expect(csv).toContain('"\'=HYPERLINK(""http://attacker.com"")"');
      expect(csv).toContain("'+573109876543");
    });
  });

  describe('4. Exportación de Oportunidades (exportarOportunidadesCSV)', () => {
    const oportunidadesMock: Oportunidad[] = [
      {
        id: '01932000-0000-7000-8000-000000000001',
        contactoId: '00000000-0002-4000-8000-000000000001',
        contactoNombre: 'Valeria Gómez',
        titulo: 'Viaje Cancún Familia',
        destino: 'Cancún',
        paqueteId: null,
        fechaSalida: '2026-12-15',
        etapa: {
          id: 'etp-1',
          clave: 'EN_NEGOCIACION',
          nombre: 'En Negociación',
          orden: 2,
          probabilidad: 70,
          esGanada: false,
          esPerdida: false,
        },
        valorEstimado: { unidades: '8500000', moneda: 'COP' },
        probabilidad: 70,
        asesorId: 'usr-1',
        asesorNombre: 'Laura Gómez',
        proximaTarea: {
          descripcion: 'Llamar para verificar anticipo',
          venceEn: '2026-10-30T10:00:00.000Z',
          completada: false,
        },
        motivoPerdida: null,
        notaPerdida: null,
        creadaEn: '2026-10-15T15:30:00.000Z',
        ultimoContactoEn: '2026-10-24T18:00:00.000Z',
      },
    ];

    it('exporta oportunidades con importes en COP y fechas formateadas', () => {
      const csv = exportarOportunidadesCSV(oportunidadesMock);

      expect(csv.startsWith(BOM_UTF8)).toBe(true);
      expect(csv).toContain('Título;Destino;Etapa;Valor estimado;Probabilidad (%);Asesor');
      expect(csv).toContain(
        'Viaje Cancún Familia;Cancún;En Negociación;$ 8.500.000 COP;70%;Laura Gómez',
      );
      expect(csv).toContain('Llamar para verificar anticipo');
    });
  });

  describe('5. Exportación de Cotizaciones y Filtrado de Neto/Margen por Permiso', () => {
    const cotizacionesMock: FilaDeCotizacion[] = [
      {
        id: 'cot-001',
        contactoId: 'cnt-001',
        oportunidadId: null,
        titulo: 'Luna de Miel Cartagena',
        estado: 'ENVIADA',
        versionEnviada: 1,
        enviadaEn: '2026-10-20T10:00:00.000Z',
        creadaEn: '2026-10-19T10:00:00.000Z',
        ultimaVersionEn: '2026-10-20T10:00:00.000Z',
        numeroDeVersiones: 1,
        paqueteNombre: 'Cartagena Romántica 4D/3N',
        fechaSalida: '2026-11-10',
        venta: { unidades: '4500000', moneda: 'COP' },
      },
    ];

    it('NO incluye las columnas de neto ni margen si puedeVerNetoYMargen es false o no se provee (R10 / ADR-0011)', () => {
      const csvSinPermiso = exportarCotizacionesCSV(cotizacionesMock, {
        puedeVerNetoYMargen: false,
      });

      expect(csvSinPermiso).not.toContain('Tarifa neta');
      expect(csvSinPermiso).not.toContain('Margen comercial');
      expect(csvSinPermiso).toContain('Total venta;Fecha de creación');
    });

    it('NO incluye neto ni margen por defecto (seguridad por defecto)', () => {
      const csvDefecto = exportarCotizacionesCSV(cotizacionesMock);

      expect(csvDefecto).not.toContain('Tarifa neta');
      expect(csvDefecto).not.toContain('Margen comercial');
    });

    it('INCLUYE las columnas de neto y margen cuando puedeVerNetoYMargen es true', () => {
      const cotizacionesConMargen = [
        {
          ...cotizacionesMock[0]!,
          neto: { unidades: '3800000', moneda: 'COP' as const },
          margen: { unidades: '700000', moneda: 'COP' as const },
        },
      ];

      const csvConPermiso = exportarCotizacionesCSV(cotizacionesConMargen, {
        puedeVerNetoYMargen: true,
      });

      expect(csvConPermiso).toContain('Total venta;Tarifa neta;Margen comercial;Fecha de creación');
      expect(csvConPermiso).toContain('$ 4.500.000 COP;$ 3.800.000 COP;$ 700.000 COP');
    });
  });

  describe('6. Utilidad de Descarga en Navegador (descargarArchivoCSV)', () => {
    it('genera y simula el clic de descarga con nombre de archivo terminado en .csv', () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-uuid');
      const revokeObjectURLMock = vi.fn();

      window.URL.createObjectURL = createObjectURLMock;
      window.URL.revokeObjectURL = revokeObjectURLMock;

      descargarArchivoCSV('contenido;csv', 'contactos-viajapro');

      expect(createObjectURLMock).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-uuid');
    });
  });
});
