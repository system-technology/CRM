/**
 * Las opciones de Better Auth que el ADR-0011 y el auditor de seguridad exigen, como aserciones.
 *
 * Una opción que solo vive en una línea de configuración se pierde con el primer «arreglo». Aquí
 * cada una pone una prueba en rojo si alguien la cambia. No abre ninguna conexión: el cliente de
 * Prisma es un doble vacío y `betterAuth()` no lo toca hasta la primera petición.
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { crearAuth, leerSecretoDeAutenticacion } from './crear-auth.js';

function auth() {
  return crearAuth({
    prisma: {} as unknown as PrismaClient,
    enviarCodigo: () => Promise.resolve(),
    secreto: 'x'.repeat(48),
    baseUrl: 'http://localhost:3333',
    origenesDeConfianza: ['http://localhost:3000'],
  });
}

describe('configuración de Better Auth', () => {
  const opciones = auth().options;

  it('la caché de sesión en cookie está desactivada de forma explícita', () => {
    expect(opciones.session?.cookieCache?.enabled).toBe(false);
  });

  it('no hay registro público: solo se entra por invitación', () => {
    expect(opciones.emailAndPassword?.enabled).toBe(true);
    expect(opciones.emailAndPassword?.disableSignUp).toBe(true);
  });

  it('la cookie es Secure y HttpOnly con SameSite=Lax', () => {
    expect(opciones.advanced?.useSecureCookies).toBe(true);
    expect(opciones.advanced?.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
    });
  });

  it('usa solo el plugin de código por correo (ni Organization ni nada más)', () => {
    expect((opciones.plugins ?? []).map((p) => p.id)).toEqual(['email-otp']);
  });

  it('los orígenes de confianza son los que se pasan, y nada más', () => {
    expect(opciones.trustedOrigins).toEqual(['http://localhost:3000']);
  });

  it('el límite de intentos de inicio de sesión está activo', () => {
    expect(opciones.rateLimit?.enabled).toBe(true);
    expect(opciones.rateLimit?.customRules?.['/sign-in/email']).toMatchObject({ max: 5 });
  });

  it('la telemetría está apagada', () => {
    expect(opciones.telemetry?.enabled).toBe(false);
  });
});

describe('leerSecretoDeAutenticacion', () => {
  it('no tiene valor por omisión', () => {
    expect(() => leerSecretoDeAutenticacion({})).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('rechaza un secreto corto', () => {
    expect(() => leerSecretoDeAutenticacion({ BETTER_AUTH_SECRET: 'corto' })).toThrow(/32/);
  });

  it('acepta uno de 32 o más', () => {
    expect(leerSecretoDeAutenticacion({ BETTER_AUTH_SECRET: 'z'.repeat(32) })).toHaveLength(32);
  });
});
