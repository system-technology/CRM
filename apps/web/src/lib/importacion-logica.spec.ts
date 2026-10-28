import { describe, it, expect } from 'vitest';
import {
  generarCsvPlantilla,
  extraerMarcadorViajaPro,
  dividirLineaCsv,
  parsearCsvAImportacion,
  sugerirMapeoLocal,
  clasificarInformeDeImportacion,
} from './importacion-logica';
import { PLANTILLAS_DE_SISTEMA } from '@viajapro/contracts';
import type { InformeDeCatalogo, DescriptorDePlantilla } from '@viajapro/contracts';

const PLANTILLA_EXCURSION = PLANTILLAS_DE_SISTEMA.find((p) => p.formato === 'excursion-un-dia')!;

describe('Lógica de Importación y Plantillas (T-029 y T-030)', () => {
  describe('generarCsvPlantilla (T-030)', () => {
    it('genera el marcador oficial #viajapro en la primera línea', () => {
      const csv = generarCsvPlantilla(PLANTILLA_EXCURSION);
      const lineas = csv.split('\n');

      expect(lineas[0]).toBe('#viajapro;plantilla=excursion-un-dia;version=1');
      expect(lineas[1]).toContain('Nombre del producto');
      expect(lineas[1]).toContain('Destino');
      expect(lineas[2]).toBeDefined();
    });

    it('escapa comas en los ejemplos de celdas correctamente', () => {
      const plantillaConComas: DescriptorDePlantilla = {
        ...PLANTILLA_EXCURSION,
        columnas: [
          ...PLANTILLA_EXCURSION.columnas,
          {
            clave: 'observaciones_extra',
            etiqueta: 'Observaciones',
            tipo: 'TEXTO',
            obligatoria: false,
            ejemplo: 'Incluye guía, hidratación y frutas',
          },
        ],
      };
      const csv = generarCsvPlantilla(plantillaConComas);
      expect(csv).toContain('"Incluye guía, hidratación y frutas"');
    });
  });

  describe('extraerMarcadorViajaPro', () => {
    it('extrae formato y versión de un marcador válido', () => {
      const res = extraerMarcadorViajaPro('#viajapro;plantilla=pasadia;version=2');
      expect(res).toEqual({ formato: 'pasadia', version: 2 });
    });

    it('asume versión 1 si version no está presente', () => {
      const res = extraerMarcadorViajaPro('#viajapro;plantilla=pasanoche');
      expect(res).toEqual({ formato: 'pasanoche', version: 1 });
    });

    it('retorna null si la línea no empieza con #viajapro;', () => {
      expect(extraerMarcadorViajaPro('Nombre,Destino,Tarifa')).toBeNull();
      expect(extraerMarcadorViajaPro('#comentario normal')).toBeNull();
    });
  });

  describe('dividirLineaCsv', () => {
    it('divide celdas separadas por coma', () => {
      expect(dividirLineaCsv('Cartagena,Santa Marta,Bogota')).toEqual([
        'Cartagena',
        'Santa Marta',
        'Bogota',
      ]);
    });

    it('respeta comas dentro de comillas', () => {
      expect(dividirLineaCsv('Tour VIP,"Islas del Rosario, Cholon y Baru",250000')).toEqual([
        'Tour VIP',
        'Islas del Rosario, Cholon y Baru',
        '250000',
      ]);
    });

    it('desescapa comillas dobles', () => {
      expect(dividirLineaCsv('"Pasadia ""Playa Blanca"""')).toEqual(['Pasadia "Playa Blanca"']);
    });
  });

  describe('parsearCsvAImportacion (T-029)', () => {
    it('parsea un CSV con marcador oficial y filas de datos', () => {
      const csv = `#viajapro;plantilla=excursion-un-dia;version=1
Nombre del producto,Destino,Valor base COP
Tour 5 Islas VIP,Cartagena,280000
Pasadia Isla Palma,San Bernardo,320000`;

      const res = parsearCsvAImportacion(csv);
      expect(res.marcador?.formato).toBe('excursion-un-dia');
      expect(res.tabla.encabezados).toEqual(['Nombre del producto', 'Destino', 'Valor base COP']);
      expect(res.tabla.filas).toHaveLength(2);
      expect(res.tabla.filaInicial).toBe(3);
    });

    it('parsea un CSV sin marcador empezando en filaInicial = 2', () => {
      const csv = `Destino,Paquete,Precio
Santa Marta,Tayrona Magico,450000`;

      const res = parsearCsvAImportacion(csv);
      expect(res.marcador).toBeNull();
      expect(res.tabla.encabezados).toEqual(['Destino', 'Paquete', 'Precio']);
      expect(res.tabla.filaInicial).toBe(2);
    });

    it('lanza error si el archivo está vacío', () => {
      expect(() => parsearCsvAImportacion('')).toThrow(/archivo CSV está completamente vacío/i);
    });
  });

  describe('sugerirMapeoLocal', () => {
    it('asigna correspondencia exacta de encabezados a columnas', () => {
      const encabezados = [
        'Nombre del producto',
        'Destino',
        'Código del producto',
        'Columna Extra Desconocida',
      ];
      const sugerencia = sugerirMapeoLocal(encabezados, PLANTILLA_EXCURSION);

      expect(sugerencia.formato).toBe('excursion-un-dia');
      expect(sugerencia.columnas['nombre']?.indice).toBe(0);
      expect(sugerencia.columnas['destino']?.indice).toBe(1);
      expect(sugerencia.columnas['codigo']?.indice).toBe(2);
      expect(sugerencia.sinMapear).toContain(3);
    });
  });

  describe('clasificarInformeDeImportacion', () => {
    it('detecta errores bloqueantes y resume impactos', () => {
      const informe: InformeDeCatalogo = {
        resumen: {
          creados: 5,
          actualizados: 2,
          sinCambios: 1,
          errores: 1,
          avisos: 1,
        },
        elementos: [
          {
            codigo: 'PROD_NUEVO',
            nivel: 'OK',
            ruta: 'productos[0]',
            mensaje: 'Se creará un nuevo producto',
          },
          {
            codigo: 'VIGENCIA_PROXIMA',
            nivel: 'AVISO',
            ruta: 'productos[1]',
            mensaje: 'Vigencia vence pronto',
          },
          {
            codigo: 'DESTINO_FALTANTE',
            nivel: 'ERROR',
            ruta: 'productos[2]',
            mensaje: 'Falta campo obligatorio destino',
            procedencia: { fila: 4, columna: 'destino' },
          },
        ],
        noIncluidos: [],
        huella: 'a'.repeat(64),
      };

      const clasificado = clasificarInformeDeImportacion(informe);
      expect(clasificado.total).toBe(3);
      expect(clasificado.creados).toBe(5);
      expect(clasificado.actualizados).toBe(2);
      expect(clasificado.advertencias).toHaveLength(1);
      expect(clasificado.errores).toHaveLength(1);
      expect(clasificado.tieneErroresBloqueantes).toBe(true);
    });
  });
});
