import { describe, expect, it } from 'vitest';
import { CotizarSalida } from './vigencias.js';
import { CrearFormatoDeViaje, EditarFormatoDeViaje, PlantillaDeFormato } from './formatos.js';

describe('formatos de viaje', () => {
  it('la plantilla vacía se completa con valores por defecto', () => {
    expect(PlantillaDeFormato.parse({})).toEqual({
      obligatorios: [],
      camposPersonalizados: [],
      valoresPorDefecto: {},
    });
  });

  it('rechaza claves desconocidas y campos estándar que no existen', () => {
    expect(PlantillaDeFormato.safeParse({ inventado: 1 }).success).toBe(false);
    expect(PlantillaDeFormato.safeParse({ obligatorios: ['nada'] }).success).toBe(false);
    expect(PlantillaDeFormato.safeParse({ camposPersonalizados: ['Con Espacios'] }).success).toBe(
      false,
    );
  });

  it('crear exige nombre y no admite tenantId; editar exige algún cambio', () => {
    expect(CrearFormatoDeViaje.safeParse({ nombre: 'Pasadía' }).success).toBe(true);
    expect(CrearFormatoDeViaje.safeParse({ nombre: 'x', tenantId: 'a' }).success).toBe(false);
    expect(EditarFormatoDeViaje.safeParse({}).success).toBe(false);
    expect(EditarFormatoDeViaje.safeParse({ activo: false }).success).toBe(true);
  });

  it('CotizarSalida acepta opcionDeSalidaId opcional y lo exige uuid', () => {
    const base = { paqueteId: '01932000-0000-7000-8000-000000000001', fecha: '2027-02-10' };
    expect(CotizarSalida.safeParse(base).success).toBe(true);
    expect(
      CotizarSalida.safeParse({ ...base, opcionDeSalidaId: '01932000-0000-7000-8000-000000000002' })
        .success,
    ).toBe(true);
    expect(CotizarSalida.safeParse({ ...base, opcionDeSalidaId: 'x' }).success).toBe(false);
  });
});
