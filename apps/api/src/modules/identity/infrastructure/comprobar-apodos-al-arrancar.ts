/**
 * Precondición (a) de ADR-0031 §4 (B3): con `REGISTRO_AUTOSERVICIO_HABILITADO` activo y el índice de
 * apodos global, la API NO arranca. `init()` ejecuta `onModuleInit` antes de escuchar, así que el
 * proceso aborta (`main.ts` sale con código 1) y nada llega a atender una petición.
 *
 * Con el interruptor apagado (el valor por omisión) no se consulta nada.
 */
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { GuardiaDeApodos } from '../application/guardia-de-apodos.js';

@Injectable()
export class ComprobarApodosAlArrancar implements OnModuleInit {
  constructor(@Inject(GuardiaDeApodos) private readonly guardia: GuardiaDeApodos) {}

  async onModuleInit(): Promise<void> {
    await this.guardia.exigirAlArrancar(process.env);
  }
}
