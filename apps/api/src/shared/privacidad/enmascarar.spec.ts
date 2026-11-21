import { describe, expect, it } from 'vitest';
import { enmascararTelefono, redactarPII } from './enmascarar.js';

describe('enmascararTelefono', () => {
  it('deja solo los cuatro últimos dígitos', () => {
    expect(enmascararTelefono('+57 300 123 4567')).toBe('+••••••••4567');
    expect(enmascararTelefono('573001234567')).toBe('••••••••4567');
  });
  it('no revela nada de un número muy corto', () => {
    expect(enmascararTelefono('123')).toBe('•••');
  });
});

describe('redactarPII', () => {
  it('enmascara teléfonos dentro de un mensaje de error', () => {
    const s = redactarPII('Contacto 573001234567 no encontrado (+57 300 123 4567)');
    expect(s).not.toContain('3001234567');
    expect(s).toContain('4567');
  });
  it('redacta pasaporte y fecha de nacimiento', () => {
    const s = redactarPII(
      'pasaporte: AB123456; fecha de nacimiento: 1990-05-01; nacimiento 01/05/1990',
    );
    expect(s).not.toContain('AB123456');
    expect(s).not.toContain('1990');
  });
  it('redacta el valor del DETAIL de unicidad de un apodo (ADR-0031)', () => {
    const a = redactarPII('duplicate key ... DETAIL: Key (apodo)=(isabel.alvear) already exists.');
    expect(a).not.toContain('isabel');
    expect(a).toContain('Key (apodo)=([REDACTADO]) already exists');
    const b = redactarPII('Key (tenant_id, apodo)=(3f2c1a9e-1111-4222-8333-444455556666, ialvear)');
    expect(b).not.toContain('ialvear');
    // Otra restricción no se toca.
    expect(redactarPII('Key (correo)=(a@b.co) already exists')).toContain('a@b.co');
  });
  it('no toca ids, fechas comunes ni códigos', () => {
    const t = 'Oportunidad 3f2c1a9e-1111-4222-8333-444455556666 SIN_VIGENCIA 2026-10-27';
    expect(redactarPII(t)).toBe(t);
  });
});
