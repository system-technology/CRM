import { describe, expect, it } from 'vitest';
import { MoverOportunidad } from '@viajapro/contracts';
import {
  formatearDineroCifra,
  esTareaAtrasada,
  moverOportunidadEnTablero,
} from './pipeline-logica';
import { obtenerMockTableroPipeline } from './mock-pipeline';

describe('Pruebas Automáticas del Pipeline de Oportunidades (/pipeline) — Reglas de Negocio', () => {
  // 1. Regla de Contrato R3: Mover a PERDIDA exige motivo
  it('1. Mover a PERDIDA sin motivo falla en la validación Zod (exigirMotivoDePerdida)', () => {
    const intentoInvalido = {
      etapa: 'PERDIDA',
      motivoPerdida: null,
      notaPerdida: null,
    };

    const resultado = MoverOportunidad.safeParse(intentoInvalido);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error?.issues[0]?.message).toContain(
        'Una oportunidad perdida necesita motivo',
      );
    }
  });

  // 2. Regla de Contrato R3: Motivo OTRO exige nota explicativa
  it('2. Mover a PERDIDA con motivo OTRO pero sin nota de explicación falla en la validación Zod', () => {
    const intentoOtroSinNota = {
      etapa: 'PERDIDA',
      motivoPerdida: 'OTRO',
      notaPerdida: '   ', // Espacios en blanco
    };

    const resultado = MoverOportunidad.safeParse(intentoOtroSinNota);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error?.issues[0]?.message).toContain(
        '«Otro» sin explicación no es un motivo',
      );
    }
  });

  // 3. Regla de Contrato R3: Mover a PERDIDA con motivo válido pasa Zod
  it('3. Mover a PERDIDA con motivo válido (ej. PRECIO) valida con éxito', () => {
    const intentoValido = {
      etapa: 'PERDIDA',
      motivoPerdida: 'PRECIO',
      notaPerdida: null,
    };

    const resultado = MoverOportunidad.safeParse(intentoValido);
    expect(resultado.success).toBe(true);
  });

  // 4. Regla de Contrato R3: Motivo de pérdida en etapa distinta a PERDIDA es rechazado
  it('4. Asignar motivoPerdida a una etapa distinta de PERDIDA (ej. GANADA) es rechazado por Zod', () => {
    const intentoInvalido = {
      etapa: 'GANADA',
      motivoPerdida: 'PRECIO',
      notaPerdida: null,
    };

    const resultado = MoverOportunidad.safeParse(intentoInvalido);
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error?.issues[0]?.message).toContain(
        'Solo una oportunidad en etapa PERDIDA lleva motivo',
      );
    }
  });

  // 5. Mover oportunidad traslada la tarjeta entre columnas inmutablemente
  it('5. moverOportunidadEnTablero traslada la tarjeta a la columna destino sin alterar las demás', () => {
    const tableroInicial = obtenerMockTableroPipeline();
    const oportunidadId = '00000000-0010-4000-8000-000000000001'; // Felipe Morales en NUEVO_LEAD

    // Mover a EN_COTIZACION (alternativa de teclado o drag-and-drop)
    const nuevoTablero = moverOportunidadEnTablero(tableroInicial, oportunidadId, {
      etapa: 'EN_COTIZACION',
      motivoPerdida: null,
      notaPerdida: null,
    });

    const colOrigen = nuevoTablero.columnas.find((c) => c.etapa === 'NUEVO_LEAD');
    const colDestino = nuevoTablero.columnas.find((c) => c.etapa === 'EN_COTIZACION');

    // Afirmar que ya no está en la columna origen
    expect(colOrigen?.oportunidades.some((op) => op.id === oportunidadId)).toBe(false);
    // Afirmar que ahora está en la columna destino
    expect(colDestino?.oportunidades.some((op) => op.id === oportunidadId)).toBe(true);
    // Afirmar que su etapa interna se actualizó
    const tarjeta = colDestino?.oportunidades.find((op) => op.id === oportunidadId);
    expect(tarjeta?.etapa).toBe('EN_COTIZACION');
  });

  // 6. Invariante COLA-DESPUES §0c.3: El total monetario de la columna viene del servidor y se conserva
  it('6. El valorTotal monetario de la columna se preserva del servidor y no se recalcula en cliente', () => {
    const tablero = obtenerMockTableroPipeline();
    const colNuevoLead = tablero.columnas.find((c) => c.etapa === 'NUEVO_LEAD');

    // Servidor envió 18.500.000 COP
    expect(colNuevoLead?.valorTotal?.unidades).toBe('1850000000');
    expect(formatearDineroCifra(colNuevoLead?.valorTotal ?? null)).toContain('18.500.000');
  });

  // 7. Alerta de tareas retrasadas
  it('7. esTareaAtrasada detecta fechas de vencimiento en el pasado', () => {
    const fechaPasada = new Date(Date.now() - 3600000).toISOString();
    const fechaFutura = new Date(Date.now() + 3600000).toISOString();

    expect(esTareaAtrasada(fechaPasada)).toBe(true);
    expect(esTareaAtrasada(fechaFutura)).toBe(false);
    expect(esTareaAtrasada(null)).toBe(false);
  });
});
