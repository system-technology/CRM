import 'reflect-metadata';

import { Injectable, Module, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { ComprobacionDeClavesAlArrancar } from './comprobacion-al-arrancar.js';
import { ClaveDeCamposHuerfanaError, PuertoVersionesDeClave } from './comprobacion-de-claves.js';

/**
 * T-234: fija el orden REAL de los ganchos de Nest 10 con módulos de verdad. La comprobación va en
 * la raíz; el "rol" (servicio Prisma) y el consumidor viven en un módulo hijo, como en la app.
 */
const eventos: string[] = [];

@Injectable()
class RolFalso implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await new Promise((r) => setTimeout(r, 5));
    eventos.push('rol verificado');
  }
}

@Injectable()
class ConsumidorFalso implements OnApplicationBootstrap {
  onApplicationBootstrap(): void {
    eventos.push('consumidor conectado');
  }
}

@Module({ providers: [RolFalso, ConsumidorFalso] })
class HijoModule {}

class Versiones extends PuertoVersionesDeClave {
  constructor(private readonly v: number[]) {
    super();
  }
  versionesEnUso(): Promise<number[]> {
    eventos.push('comprobación');
    return Promise.resolve(this.v);
  }
}

/** `NestFactory` como en producción; `abortOnError: false` para que el fallo llegue como rechazo. */
function montar(enUso: number[]): Promise<unknown> {
  @Module({
    imports: [HijoModule],
    providers: [
      {
        provide: ComprobacionDeClavesAlArrancar,
        useFactory: () =>
          new ComprobacionDeClavesAlArrancar(new Versiones(enUso), () => ({
            version: 2,
            anterior: null,
          })),
      },
    ],
  })
  class RaizModule {}
  eventos.length = 0;
  return NestFactory.createApplicationContext(RaizModule, { logger: false, abortOnError: false });
}

describe('comprobación de claves dentro del arranque de Nest (T-234)', () => {
  it('con una versión huérfana, la creación del contexto rechaza y el consumidor nunca se conecta', async () => {
    await expect(montar([1])).rejects.toBeInstanceOf(ClaveDeCamposHuerfanaError);
    expect(eventos).toEqual(['rol verificado', 'comprobación']);
    expect(eventos).not.toContain('consumidor conectado');
  });

  it('sin huérfanas: rol, luego comprobación, luego consumidor', async () => {
    const app = (await montar([2])) as { close(): Promise<void> };
    expect(eventos).toEqual(['rol verificado', 'comprobación', 'consumidor conectado']);
    await app.close();
  });
});
