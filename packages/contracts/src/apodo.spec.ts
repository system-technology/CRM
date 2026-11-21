import { describe, expect, it } from 'vitest';
import {
  Apodo,
  APODOS_RESERVADOS,
  CambiarApodo,
  CorreoDeIdentidad,
  esApodoReservado,
  esApodoValido,
  esCorreoDeDominioInvalid,
  normalizarApodo,
} from './apodo.js';
import { InvitarMiembro } from './identidad.js';

describe('normalizarApodo', () => {
  it('recorta, aplica NFKC y pasa a minúsculas', () => {
    expect(normalizarApodo('  IAlvear  ')).toBe('ialvear');
    // Ancho completo (NFKC lo lleva a ASCII).
    expect(normalizarApodo('ＩＡＬＶＥＡＲ')).toBe('ialvear');
  });

  it('no translitera: lo que sigue sin ser ASCII queda para que el formato lo rechace', () => {
    for (const crudo of ['peña', 'josé', 'иван', 'İsabel']) {
      expect(esApodoValido(normalizarApodo(crudo)), crudo).toBe(false);
    }
  });
});

describe('esApodoValido', () => {
  it('acepta el formato del CHECK', () => {
    for (const a of [
      'ialvear',
      'isabel.alvear',
      'isabel_alvear',
      'isabel-alvear',
      'a1b',
      'dueno.demo',
    ]) {
      expect(esApodoValido(a), a).toBe(true);
    }
  });

  it('rechaza lo que el CHECK rechaza', () => {
    for (const a of [
      'ab',
      'a'.repeat(31),
      '1abc',
      '.abc',
      'abc.',
      'ab..cd',
      'ab.-cd',
      'ab cd',
      'ab@cd',
      'ABC',
      '',
    ]) {
      expect(esApodoValido(a), a).toBe(false);
    }
    expect(esApodoValido('a'.repeat(30))).toBe(true);
    expect(esApodoValido('a'.repeat(3))).toBe(true);
  });
});

describe('reservados', () => {
  it('rechaza cada reservado del ADR-0031 §2', () => {
    expect(APODOS_RESERVADOS).toHaveLength(19);
    for (const r of APODOS_RESERVADOS) expect(esApodoReservado(r), r).toBe(true);
  });

  it('rechaza los prefijos viajapro y soporte', () => {
    expect(esApodoReservado('viajapro.ventas')).toBe(true);
    expect(esApodoReservado('soporte2')).toBe(true);
    expect(esApodoReservado('ialvear')).toBe(false);
    // `dueno.demo` es el apodo sintético de la semilla: `dueno` y `demo` solos son los reservados.
    expect(esApodoReservado('dueno.demo')).toBe(false);
  });
});

describe('Apodo (el que se fija)', () => {
  it('devuelve el valor normalizado', () => {
    expect(Apodo.parse('  ISabel.Alvear ')).toBe('isabel.alvear');
  });

  it('rechaza formato inválido y reservados, sin repetir el valor en el mensaje', () => {
    const malo = Apodo.safeParse('Peña!');
    const reservado = Apodo.safeParse('Admin');
    expect(malo.success).toBe(false);
    expect(reservado.success).toBe(false);
    if (!malo.success)
      expect(JSON.stringify(malo.error.issues).toLowerCase()).not.toContain('peña');
    if (!reservado.success) {
      expect(JSON.stringify(reservado.error.issues).toLowerCase()).not.toContain('admin');
    }
  });
});

describe('CambiarApodo', () => {
  it('admite un apodo o null', () => {
    expect(CambiarApodo.parse({ apodo: 'Ialvear' })).toEqual({ apodo: 'ialvear' });
    expect(CambiarApodo.parse({ apodo: null })).toEqual({ apodo: null });
  });

  it('exige la clave y no admite otras', () => {
    expect(CambiarApodo.safeParse({}).success).toBe(false);
    expect(CambiarApodo.safeParse({ apodo: 'ialvear', tenantId: 'x' }).success).toBe(false);
    expect(CambiarApodo.safeParse({ apodo: 5 }).success).toBe(false);
  });
});

describe('el dominio .invalid', () => {
  it('lo detecta, también en subdominios y con mayúsculas', () => {
    expect(esCorreoDeDominioInvalid('x@viajapro.invalid')).toBe(true);
    expect(esCorreoDeDominioInvalid('x@a.b.INVALID')).toBe(true);
    expect(esCorreoDeDominioInvalid('x@invalid')).toBe(true);
    expect(esCorreoDeDominioInvalid('x@invalido.com')).toBe(false);
    expect(esCorreoDeDominioInvalid('x@agencia.com.co')).toBe(false);
  });

  it('el correo de identidad y la invitación lo rechazan', () => {
    expect(CorreoDeIdentidad.safeParse('x@viajapro.invalid').success).toBe(false);
    expect(CorreoDeIdentidad.parse('Ana@Agencia.com')).toBe('ana@agencia.com');
    const rolId = '01932000-0000-7000-8000-000000000001';
    expect(InvitarMiembro.safeParse({ correo: 'x@viajapro.invalid', rolId }).success).toBe(false);
    expect(InvitarMiembro.safeParse({ correo: 'x@agencia.com', rolId }).success).toBe(true);
  });
});
