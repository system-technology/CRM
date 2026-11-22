import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EtapaDefinida, Oportunidad } from '@viajapro/contracts';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TarjetaOportunidad } from './tarjeta-oportunidad';
import { ViajesBandejaProvider } from '../../lib/viajes-bandeja';
import { INDICE_VACIO } from '../../lib/viajes-de-contactos-logica';

const ETAPA: EtapaDefinida = {
  id: '01a114b2-5314-75b1-91ad-3be0518a6a02',
  clave: 'EN_COTIZACION',
  nombre: 'En cotización',
  orden: 2,
  probabilidad: 40,
  esGanada: false,
  esPerdida: false,
};

const hoy = Date.now();
const dia = (n: number) => new Date(hoy + n * 86_400_000).toISOString().slice(0, 10);

function oportunidad(parcial: Partial<Oportunidad> = {}): Oportunidad {
  return {
    id: 'op-1',
    contactoId: 'cnt-1',
    contactoNombre: 'Juan Pérez',
    titulo: 'Cancún todo incluido',
    destino: 'Cancún, México',
    paqueteId: null,
    fechaSalida: dia(40),
    etapa: ETAPA,
    valorEstimado: { unidades: '12500000', moneda: 'COP' },
    probabilidad: 60,
    asesorId: null,
    asesorNombre: null,
    proximaTarea: null,
    motivoPerdida: null,
    notaPerdida: null,
    creadaEn: new Date(hoy - 86_400_000).toISOString(),
    ultimoContactoEn: null,
    ...parcial,
  };
}

function pintar(o: Oportunidad) {
  return render(
    <ViajesBandejaProvider value={INDICE_VACIO}>
      <TarjetaOportunidad oportunidad={o} etapas={[ETAPA]} onSolicitarMover={() => {}} />
    </ViajesBandejaProvider>,
  );
}

describe('TarjetaOportunidad — fecha de salida en lugar de probabilidad', () => {
  it('muestra la fecha de salida y no el porcentaje', () => {
    pintar(oportunidad());
    expect(screen.getByTestId('fecha-de-salida').textContent).toMatch(/\d{1,2} [a-z]{3} \d{4}/);
    expect(screen.queryByText('60%')).toBeNull();
  });

  it('sin fecha de salida dice «sin fecha»', () => {
    pintar(oportunidad({ fechaSalida: null }));
    expect(screen.getByTestId('fecha-de-salida').textContent).toContain('sin fecha');
  });

  it('sin destino ni fecha dice «Destino por definir» y no inventa la línea', () => {
    pintar(oportunidad({ destino: null, fechaSalida: null }));
    expect(screen.getByText('Destino por definir')).toBeDefined();
    expect(screen.queryByTestId('linea-de-viaje')).toBeNull();
  });

  it('una salida que ya pasó en una oportunidad abierta va en rojo; si está perdida, neutra', () => {
    const { unmount } = pintar(oportunidad({ fechaSalida: dia(-5) }));
    expect(screen.getByTestId('fecha-de-salida').className).toContain('text-alerta-700');
    unmount();
    pintar(
      oportunidad({
        fechaSalida: dia(-5),
        etapa: { ...ETAPA, clave: 'PERDIDA', nombre: 'Perdida', esPerdida: true },
      }),
    );
    expect(screen.getByTestId('fecha-de-salida').className).not.toContain('text-alerta-700');
  });

  it('una salida en los próximos 7 días va en ámbar', () => {
    pintar(oportunidad({ fechaSalida: dia(4) }));
    expect(screen.getByTestId('fecha-de-salida').className).toContain('text-aviso-700');
  });
});
