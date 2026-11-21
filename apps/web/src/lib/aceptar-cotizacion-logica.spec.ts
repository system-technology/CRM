import { describe, expect, it } from 'vitest';
import type { EstadoCotizacion } from '@viajapro/contracts';
import {
  accionAceptarCotizacion,
  archivoTrasAceptar,
  ESTADOS_QUE_NO_ADMITEN_ACEPTACION,
} from './aceptar-cotizacion-logica';

/**
 * Quién puede aceptar una cotización y cuándo (T-563).
 *
 * Dos cosas mandan, y las dos se prueban en los dos sentidos porque son las dos que, si se caen,
 * dejan vender a quien no debe o cerrar lo que no está en pie:
 *
 *  1. El estado. El invariante del dominio vive en la API
 *     (`apps/api/src/modules/quoting/domain/estado-de-cotizacion.ts`): solo ENVIADA transita a
 *     ACEPTADA. La pantalla no inventa el suyo: lo repite.
 *  2. El permiso. `POST /api/v1/cotizaciones/:id/estado` exige `cotizacion.escribir`
 *     (`@RequierePermiso` en `cotizaciones.controller.ts`). La web no lo decide: no ofrece lo que
 *     el servidor va a negar con un 403.
 */
describe('accionAceptarCotizacion (T-563)', () => {
  it('ofrece la aceptación, habilitada, sobre una cotización ENVIADA de quien puede escribir', () => {
    const accion = accionAceptarCotizacion({
      estado: 'ENVIADA',
      puedeEscribirCotizacion: true,
    });

    expect(accion.ofrecida).toBe(true);
    expect(accion.ofrecida && accion.habilitada).toBe(true);
  });

  it('NO ofrece la aceptación sobre un borrador: lo que no se envió, el viajero no pudo aceptarlo', () => {
    const accion = accionAceptarCotizacion({
      estado: 'BORRADOR',
      puedeEscribirCotizacion: true,
    });

    expect(accion.ofrecida).toBe(false);
    expect(accion.ofrecida === false && accion.razon).toBe('SIN_ENVIAR');
  });

  it.each<EstadoCotizacion>(['ACEPTADA', 'RECHAZADA', 'VENCIDA'])(
    'NO ofrece la aceptación sobre una cotización ya cerrada (%s)',
    (estado) => {
      const accion = accionAceptarCotizacion({ estado, puedeEscribirCotizacion: true });

      expect(accion.ofrecida).toBe(false);
      expect(accion.ofrecida === false && accion.razon).toBe('YA_CERRADA');
    },
  );

  it('los estados que no admiten aceptación son exactamente los que el dominio no deja transitar', () => {
    expect(Object.keys(ESTADOS_QUE_NO_ADMITEN_ACEPTACION).sort()).toEqual([
      'ACEPTADA',
      'BORRADOR',
      'RECHAZADA',
      'VENCIDA',
    ]);
  });

  it('sobre una ENVIADA, a quien NO tiene «cotizacion.escribir» la ofrece deshabilitada y nombra el permiso', () => {
    const accion = accionAceptarCotizacion({
      estado: 'ENVIADA',
      puedeEscribirCotizacion: false,
    });

    expect(accion.ofrecida).toBe(true);
    expect(accion.ofrecida && accion.habilitada).toBe(false);
    const explicacion = accion.ofrecida && !accion.habilitada ? accion.explicacion : '';
    expect(explicacion).toContain('cotizacion.escribir');
  });

  it('la falta de permiso nunca convierte un estado cerrado en ofrecible', () => {
    const accion = accionAceptarCotizacion({
      estado: 'ACEPTADA',
      puedeEscribirCotizacion: false,
    });

    expect(accion.ofrecida).toBe(false);
  });
});

/**
 * El archivo de viaje no nace con la respuesta de la API: lo abre el consumidor del evento
 * `cotizacion.aceptada` (ADR-0024 §1). Así que la pantalla tiene que poder decir «todavía no está»
 * sin mentir, y nunca pintar un enlace a un archivo que no existe.
 */
describe('archivoTrasAceptar (T-563)', () => {
  const archivos = [
    { id: 'arch-1', numero: 1043, cotizacionId: 'cot-1' },
    { id: 'arch-2', numero: 1044, cotizacionId: 'cot-2' },
  ];

  it('encuentra el archivo que nació de ESTA cotización', () => {
    expect(archivoTrasAceptar(archivos, 'cot-2', { agotados: false })).toEqual({
      fase: 'encontrado',
      archivoId: 'arch-2',
      numero: 1044,
    });
  });

  it('mientras quedan intentos, sigue buscando: no afirma que no hay archivo', () => {
    expect(archivoTrasAceptar(archivos, 'cot-9', { agotados: false })).toEqual({
      fase: 'buscando',
    });
  });

  it('agotados los intentos lo declara demorado, y sigue sin inventar un enlace', () => {
    const resultado = archivoTrasAceptar(archivos, 'cot-9', { agotados: true });

    expect(resultado).toEqual({ fase: 'demorada' });
    expect(JSON.stringify(resultado)).not.toContain('arch-');
  });
});
