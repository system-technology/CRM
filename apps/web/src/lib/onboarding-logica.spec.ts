import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  inicializarProgresoOnboarding,
  calcularPorcentajeProgreso,
  validarPasoMarca,
  validarCorreoEquipo,
  validarPasoWhatsApp,
  obtenerSiguientePaso,
  obtenerPasoAnterior,
  obtenerClaveStorageOnboarding,
  cargarProgresoOnboarding,
  guardarProgresoOnboarding,
  avanzarPasoOnboarding,
  omitirPasoOnboarding,
  restablecerOnboarding,
  PALETAS_MARCA_PREDEFINIDAS,
  EXCURSIONES_MUESTRA_COLOMBIA,
} from './onboarding-logica';

describe('onboarding-logica — Asistente de Onboarding de Nueva Agencia (T-105)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('1. inicializarProgresoOnboarding crea la estructura con 4 pasos y valores iniciales coherentes', () => {
    const progreso = inicializarProgresoOnboarding('tenant-agencia-1', 'Caribe Tour Express');

    expect(progreso.tenantId).toBe('tenant-agencia-1');
    expect(progreso.pasoActual).toBe('marca');
    expect(progreso.completado).toBe(false);
    expect(progreso.pasos.marca).toBe('en_progreso');
    expect(progreso.pasos.catalogo).toBe('pendiente');
    expect(progreso.pasos.equipo).toBe('pendiente');
    expect(progreso.pasos.whatsapp).toBe('pendiente');
    expect(progreso.marca.nombreComercial).toBe('Caribe Tour Express');
    expect(progreso.marca.colorAcento).toBe('#C9A24B'); // Dorado Cartagena
    expect(progreso.catalogo.excursionesSeleccionadas.length).toBeGreaterThanOrEqual(2);
    expect(progreso.whatsapp.modo).toBe('simulador');
  });

  it('2. calcularPorcentajeProgreso devuelve 0%, 25%, 50%, 75% o 100% según pasos resueltos', () => {
    expect(
      calcularPorcentajeProgreso({
        marca: 'en_progreso',
        catalogo: 'pendiente',
        equipo: 'pendiente',
        whatsapp: 'pendiente',
      }),
    ).toBe(0);

    expect(
      calcularPorcentajeProgreso({
        marca: 'completado',
        catalogo: 'en_progreso',
        equipo: 'pendiente',
        whatsapp: 'pendiente',
      }),
    ).toBe(25);

    expect(
      calcularPorcentajeProgreso({
        marca: 'completado',
        catalogo: 'omitido',
        equipo: 'en_progreso',
        whatsapp: 'pendiente',
      }),
    ).toBe(50);

    expect(
      calcularPorcentajeProgreso({
        marca: 'completado',
        catalogo: 'omitido',
        equipo: 'completado',
        whatsapp: 'pendiente',
      }),
    ).toBe(75);

    expect(
      calcularPorcentajeProgreso({
        marca: 'completado',
        catalogo: 'omitido',
        equipo: 'completado',
        whatsapp: 'completado',
      }),
    ).toBe(100);
  });

  it('3. validarPasoMarca exige nombre comercial y formato válido de NIT y color HEX', () => {
    // Nombre inválido
    const resNombreInvalido = validarPasoMarca({
      nombreComercial: ' ',
      razonSocial: 'Agencia SAS',
      nit: '901.482.910-3',
      colorAcento: '#C9A24B',
      lema: 'Lema',
      ciudadBase: 'Cartagena',
      telefonoContacto: '3001234567',
    });
    expect(resNombreInvalido.valido).toBe(false);
    expect(resNombreInvalido.error).toContain('nombre comercial');

    // NIT inválido
    const resNitInvalido = validarPasoMarca({
      nombreComercial: 'Viajes El Sol',
      razonSocial: 'Agencia SAS',
      nit: '12345-invalido',
      colorAcento: '#C9A24B',
      lema: 'Lema',
      ciudadBase: 'Cartagena',
      telefonoContacto: '3001234567',
    });
    expect(resNitInvalido.valido).toBe(false);
    expect(resNitInvalido.error).toContain('NIT');

    // Color hexadecimal inválido
    const resColorInvalido = validarPasoMarca({
      nombreComercial: 'Viajes El Sol',
      razonSocial: 'Agencia SAS',
      nit: '901.482.910-3',
      colorAcento: 'rojo-no-hex',
      lema: 'Lema',
      ciudadBase: 'Cartagena',
      telefonoContacto: '3001234567',
    });
    expect(resColorInvalido.valido).toBe(false);
    expect(resColorInvalido.error).toContain('hexadecimal');

    // Válido completo
    const resValido = validarPasoMarca({
      nombreComercial: 'Viajes El Sol',
      razonSocial: 'Agencia SAS',
      nit: '901.482.910-3',
      colorAcento: '#0284C7',
      lema: 'Descubre el Caribe',
      ciudadBase: 'Santa Marta',
      telefonoContacto: '+57 310 999 8877',
    });
    expect(resValido.valido).toBe(true);
    expect(resValido.error).toBeUndefined();
  });

  it('4. validarCorreoEquipo valida formato estándar de correo electrónico', () => {
    expect(validarCorreoEquipo('').valido).toBe(false);
    expect(validarCorreoEquipo('invalido-sin-arroba').valido).toBe(false);
    expect(validarCorreoEquipo('usuario@dominio').valido).toBe(false);
    expect(validarCorreoEquipo('asesor@agencia.com.co').valido).toBe(true);
  });

  it('5. validarPasoWhatsApp bloquea secretos (Regla R6) y acepta identificadores públicos', () => {
    const conTokenSecreto = validarPasoWhatsApp({
      modo: 'meta_cloud_oficial',
      numeroE164: '+573001112233',
      wabaId: 'EAAB1234567890abcdefSecretToken',
      phoneNumberId: '1092837465',
      checklist: {
        numeroDedicado: true,
        accesoMetaBusiness: true,
        nombreAprobado: true,
        webhookConfigurado: true,
      },
    });
    expect(conTokenSecreto.valido).toBe(false);
    expect(conTokenSecreto.error).toContain('Regla R6 violada');

    const publicoValido = validarPasoWhatsApp({
      modo: 'meta_cloud_oficial',
      numeroE164: '+573001112233',
      wabaId: '109283746500000',
      phoneNumberId: '109283746511111',
      checklist: {
        numeroDedicado: true,
        accesoMetaBusiness: true,
        nombreAprobado: true,
        webhookConfigurado: true,
      },
    });
    expect(publicoValido.valido).toBe(true);
  });

  it('6. obtenerSiguientePaso y obtenerPasoAnterior respetan la secuencia estricta de 4 pasos', () => {
    expect(obtenerSiguientePaso('marca')).toBe('catalogo');
    expect(obtenerSiguientePaso('catalogo')).toBe('equipo');
    expect(obtenerSiguientePaso('equipo')).toBe('whatsapp');
    expect(obtenerSiguientePaso('whatsapp')).toBeNull();

    expect(obtenerPasoAnterior('marca')).toBeNull();
    expect(obtenerPasoAnterior('catalogo')).toBe('marca');
    expect(obtenerPasoAnterior('equipo')).toBe('catalogo');
    expect(obtenerPasoAnterior('whatsapp')).toBe('equipo');
  });

  it('7. avanzarPasoOnboarding marca el paso como completado y avanza al siguiente paso', () => {
    const inicial = inicializarProgresoOnboarding('t-105', 'Agencia Test');
    const paso1Hecho = avanzarPasoOnboarding(inicial, 'marca', {
      marca: {
        ...inicial.marca,
        colorAcento: '#059669',
      },
    });

    expect(paso1Hecho.pasos.marca).toBe('completado');
    expect(paso1Hecho.pasos.catalogo).toBe('en_progreso');
    expect(paso1Hecho.pasoActual).toBe('catalogo');
    expect(paso1Hecho.marca.colorAcento).toBe('#059669');
    expect(paso1Hecho.completado).toBe(false);
  });

  it('8. omitirPasoOnboarding marca el paso como omitido sin bloquear el avance', () => {
    const inicial = inicializarProgresoOnboarding('t-105', 'Agencia Test');
    const paso1Omitido = omitirPasoOnboarding(inicial, 'marca');

    expect(paso1Omitido.pasos.marca).toBe('omitido');
    expect(paso1Omitido.pasos.catalogo).toBe('en_progreso');
    expect(paso1Omitido.pasoActual).toBe('catalogo');
  });

  it('9. Al completar o resolver los 4 pasos, completado se vuelve true y finalizadoEn se establece', () => {
    let progreso = inicializarProgresoOnboarding('t-105');
    progreso = avanzarPasoOnboarding(progreso, 'marca');
    progreso = avanzarPasoOnboarding(progreso, 'catalogo');
    progreso = omitirPasoOnboarding(progreso, 'equipo');
    progreso = avanzarPasoOnboarding(progreso, 'whatsapp');

    expect(progreso.completado).toBe(true);
    expect(progreso.finalizadoEn).toBeDefined();
    expect(calcularPorcentajeProgreso(progreso.pasos)).toBe(100);
  });

  it('10. persistencia y restablecimiento con clave de almacenamiento por tenant', () => {
    const claveEsperada = obtenerClaveStorageOnboarding('tenant-cartagena');
    expect(claveEsperada).toBe('viajapro:onboarding:tenant-cartagena');

    const progreso = inicializarProgresoOnboarding('tenant-cartagena', 'Cartagena Tours');
    progreso.marca.nombreComercial = 'Cartagena Tours Modificado';
    guardarProgresoOnboarding(progreso);

    const cargado = cargarProgresoOnboarding('tenant-cartagena');
    expect(cargado.marca.nombreComercial).toBe('Cartagena Tours Modificado');

    const reiniciado = restablecerOnboarding('tenant-cartagena', 'Cartagena Tours Original');
    expect(reiniciado.marca.nombreComercial).toBe('Cartagena Tours Original');
    expect(reiniciado.pasos.marca).toBe('en_progreso');
  });

  it('11. Contiene paletas predefinidas y excursiones de muestra colombianas', () => {
    expect(PALETAS_MARCA_PREDEFINIDAS.length).toBeGreaterThanOrEqual(5);
    expect(PALETAS_MARCA_PREDEFINIDAS.some((p) => p.nombre.includes('Dorado'))).toBe(true);
    expect(PALETAS_MARCA_PREDEFINIDAS.some((p) => p.nombre.includes('Caribe'))).toBe(true);

    expect(EXCURSIONES_MUESTRA_COLOMBIA.length).toBeGreaterThanOrEqual(4);
    expect(EXCURSIONES_MUESTRA_COLOMBIA.some((e) => e.destino.includes('Cartagena'))).toBe(true);
    expect(EXCURSIONES_MUESTRA_COLOMBIA.every((e) => e.precioBaseCop > 0)).toBe(true);
  });
});
