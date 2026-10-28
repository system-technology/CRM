import { describe, expect, it } from 'vitest';
import { PLANTILLAS_DE_SISTEMA, DescriptorDePlantilla } from './plantillas-de-catalogo.js';
import { InformeDeCatalogo, Procedencia, PropuestaDeCatalogo } from './propuesta-de-catalogo.js';

const tarifa = (extra: Record<string, unknown> = {}) => ({
  nombre: 'Adulto',
  unidad: 'POR_PERSONA',
  venta: { unidades: '320000', moneda: 'COP' },
  ...extra,
});

const producto = (extra: Record<string, unknown> = {}, t: Record<string, unknown> = {}) => ({
  nombre: 'Isla Palma',
  destino: 'Cartagena',
  dias: 1,
  noches: 0,
  vigencias: [{ desde: '2026-12-01', hasta: '2027-03-31', tarifas: [tarifa(t)] }],
  ...extra,
});

const propuesta = (origen: string, productos: unknown[] = [producto()]) => ({
  version: 1,
  origen,
  productos,
});

describe('PropuestaDeCatalogo', () => {
  it('acepta una propuesta mínima y aplica los valores por defecto de la tarifa', () => {
    const r = PropuestaDeCatalogo.parse(propuesta('PANTALLA'));
    const t = r.productos[0]?.vigencias[0]?.tarifas[0];
    expect(t?.cubrePasajeros).toBe(1);
    expect(t?.neto).toBeNull();
    expect(t?.aditiva).toBe(false);
    expect(t?.condicion.acomodacion).toBeNull();
  });

  it('rechaza un cuerpo con tenantId (campo desconocido, no se ignora)', () => {
    expect(PropuestaDeCatalogo.safeParse({ ...propuesta('API'), tenantId: 'x' }).success).toBe(
      false,
    );
    const anidado = propuesta('PANTALLA', [producto({ tenantId: 'x' })]);
    expect(PropuestaDeCatalogo.safeParse(anidado).success).toBe(false);
    const enTarifa = propuesta('PANTALLA', [producto({}, { tenantId: 'x' })]);
    expect(PropuestaDeCatalogo.safeParse(enTarifa).success).toBe(false);
  });

  it('rechaza identificadores internos y horas sueltas en el producto', () => {
    expect(
      PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', [producto({ paqueteId: 'x' })])).success,
    ).toBe(false);
    expect(
      PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', [producto({ horaSalida: '07:30' })]))
        .success,
    ).toBe(false);
    expect(
      PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', [producto({ horaRegreso: '16:00' })]))
        .success,
    ).toBe(false);
  });

  it('exige de 1 a 500 productos y la versión 1', () => {
    expect(PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', [])).success).toBe(false);
    const quinientos = Array.from({ length: 500 }, () => producto());
    expect(PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', quinientos)).success).toBe(true);
    expect(
      PropuestaDeCatalogo.safeParse(propuesta('PANTALLA', [...quinientos, producto()])).success,
    ).toBe(false);
    expect(PropuestaDeCatalogo.safeParse({ ...propuesta('PANTALLA'), version: 2 }).success).toBe(
      false,
    );
    expect(PropuestaDeCatalogo.safeParse(propuesta('OTRO')).success).toBe(false);
  });

  it('rechaza más de 2.000 tarifas en total', () => {
    const tarifas = Array.from({ length: 1001 }, (_, i) => tarifa({ nombre: `T${i}` }));
    const p = propuesta('PANTALLA', [
      producto({ vigencias: [{ desde: '2026-01-01', hasta: '2026-12-31', tarifas }] }),
      producto({
        nombre: 'Otro',
        vigencias: [{ desde: '2026-01-01', hasta: '2026-12-31', tarifas }],
      }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(p).success).toBe(false);
  });

  it('origen API sin codigo en un producto es inválido; con codigo es válido', () => {
    const sin = PropuestaDeCatalogo.safeParse(propuesta('API'));
    expect(sin.success).toBe(false);
    if (!sin.success) expect(sin.error.issues[0]?.path).toEqual(['productos', 0, 'codigo']);
    expect(
      PropuestaDeCatalogo.safeParse(propuesta('API', [producto({ codigo: 'CT-1' })])).success,
    ).toBe(true);
    expect(PropuestaDeCatalogo.safeParse(propuesta('ARCHIVO')).success).toBe(true);
  });

  it('origen IA con un precio sin fuente y fragmento es inválido', () => {
    expect(PropuestaDeCatalogo.safeParse(propuesta('IA')).success).toBe(false);
    const soloFuente = propuesta('IA', [producto({}, { procedencia: { fuente: 'https://x.co' } })]);
    expect(PropuestaDeCatalogo.safeParse(soloFuente).success).toBe(false);
    const soloFragmento = propuesta('IA', [
      producto({}, { procedencia: { fragmento: '$320.000' } }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(soloFragmento).success).toBe(false);
    const completa = propuesta('IA', [
      producto(
        {},
        { procedencia: { fuente: 'https://x.co', fragmento: '$320.000', confianza: 0.8 } },
      ),
    ]);
    expect(PropuestaDeCatalogo.safeParse(completa).success).toBe(true);
  });

  it('una vigencia publicada debe ser de un solo día y desde no supera a hasta', () => {
    const v = (extra: Record<string, unknown>) =>
      propuesta('PANTALLA', [
        producto({
          vigencias: [{ desde: '2026-12-01', hasta: '2026-12-05', tarifas: [], ...extra }],
        }),
      ]);
    expect(PropuestaDeCatalogo.safeParse(v({ publicada: true })).success).toBe(false);
    expect(PropuestaDeCatalogo.safeParse(v({ desde: '2026-12-09' })).success).toBe(false);
    expect(PropuestaDeCatalogo.safeParse(v({})).success).toBe(true);
  });

  it('opcionesDeSalida lleva etiqueta y horas HH:MM; la tarifa nombra la opción por etiqueta', () => {
    const ok = propuesta('PANTALLA', [
      producto(
        { opcionesDeSalida: [{ etiqueta: 'Lancha', horaSalida: '07:30', horaRegreso: '16:00' }] },
        { opcionDeSalida: 'Lancha' },
      ),
    ]);
    expect(PropuestaDeCatalogo.safeParse(ok).success).toBe(true);
    const mala = propuesta('PANTALLA', [
      producto({ opcionesDeSalida: [{ etiqueta: 'Lancha', horaSalida: '7:30' }] }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(mala).success).toBe(false);
    const sinEtiqueta = propuesta('PANTALLA', [
      producto({ opcionesDeSalida: [{ horaSalida: '07:30' }] }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(sinEtiqueta).success).toBe(false);
  });

  it('el dinero es entero en texto con moneda ISO (R8)', () => {
    const decimal = propuesta('PANTALLA', [
      producto({}, { venta: { unidades: '320000.5', moneda: 'COP' } }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(decimal).success).toBe(false);
    const numero = propuesta('PANTALLA', [
      producto({}, { venta: { unidades: 320000, moneda: 'COP' } }),
    ]);
    expect(PropuestaDeCatalogo.safeParse(numero).success).toBe(false);
  });
});

describe('Procedencia.confianza', () => {
  it('es un número entre 0 y 1, no un enum', () => {
    expect(Procedencia.safeParse({ confianza: 0 }).success).toBe(true);
    expect(Procedencia.safeParse({ confianza: 0.73 }).success).toBe(true);
    expect(Procedencia.safeParse({ confianza: 1 }).success).toBe(true);
    expect(Procedencia.safeParse({ confianza: 1.01 }).success).toBe(false);
    expect(Procedencia.safeParse({ confianza: -0.1 }).success).toBe(false);
    expect(Procedencia.safeParse({ confianza: 'alta' }).success).toBe(false);
  });

  it('el fragmento cita como mucho 300 caracteres', () => {
    expect(Procedencia.safeParse({ fragmento: 'a'.repeat(300) }).success).toBe(true);
    expect(Procedencia.safeParse({ fragmento: 'a'.repeat(301) }).success).toBe(false);
  });
});

describe('InformeDeCatalogo', () => {
  it('es estricto y exige una huella sha256', () => {
    const base = {
      elementos: [],
      resumen: { errores: 0, avisos: 0, creados: 0, actualizados: 0, sinCambios: 0 },
      noIncluidos: [],
      huella: 'a'.repeat(64),
    };
    expect(InformeDeCatalogo.safeParse(base).success).toBe(true);
    expect(InformeDeCatalogo.safeParse({ ...base, huella: 'x' }).success).toBe(false);
  });
});

describe('PLANTILLAS_DE_SISTEMA', () => {
  it('tiene los cuatro formatos de sistema, versión 1', () => {
    expect(PLANTILLAS_DE_SISTEMA.map((p) => p.formato)).toEqual([
      'excursion-un-dia',
      'pasadia',
      'pasanoche',
      'paquete-con-hotel',
    ]);
    for (const p of PLANTILLAS_DE_SISTEMA) {
      expect(p.version).toBe(1);
      expect(DescriptorDePlantilla.safeParse(p).success).toBe(true);
    }
  });

  it('las claves de columna son únicas y estables', () => {
    for (const p of PLANTILLAS_DE_SISTEMA) {
      const claves = p.columnas.map((c) => c.clave);
      expect(new Set(claves).size).toBe(claves.length);
    }
    const excursion = PLANTILLAS_DE_SISTEMA[0]?.columnas.map((c) => c.clave);
    expect(excursion).toEqual([
      'codigo',
      'nombre',
      'destino',
      'dias',
      'noches',
      'inclusiones',
      'exclusiones',
      'vigencia_desde',
      'vigencia_hasta',
      'publicada',
      'tarifa_nombre',
      'unidad',
      'cubre_pasajeros',
      'precio_neto',
      'precio_venta',
      'moneda',
      'precio_lista',
      'promo_hasta',
      'mayorista',
      'opcion_salida',
      'hora_salida',
      'hora_regreso',
      'punto_encuentro',
    ]);
  });

  it('el pasadía admite plan de alimentación opcional y el pasanoche lo exige', () => {
    const plan = (formato: string) =>
      PLANTILLAS_DE_SISTEMA.find((p) => p.formato === formato)?.columnas.find(
        (c) => c.clave === 'plan_alimentacion',
      );
    expect(plan('pasadia')?.obligatoria).toBe(false);
    expect(plan('pasanoche')?.obligatoria).toBe(true);
    expect(plan('excursion-un-dia')).toBeUndefined();
  });
});
