/**
 * Cobros de demostración, en la forma del contrato (`CobroDelArchivo`). Solo se leen en modo demo
 * (`estaUsandoApiReal() === false`).
 *
 * Datos creíbles (skill `diseno-web` §5): los montos cuadran con la venta de cada archivo de
 * `mock-archivos` y están en la unidad mínima de COP, que es **el peso** (R8): `3500000` son tres
 * millones y medio de pesos, no treinta y cinco mil. El archivo 1043 va a medio pagar y el 1044 no
 * tiene ni un pago, para que la demo enseñe también el estado vacío.
 */
import type { CobroDelArchivo } from '@viajapro/contracts';

const DIA = 86_400_000;
const haceDias = (dias: number): string => new Date(Date.now() - dias * DIA).toISOString();
const enDias = (dias: number): string =>
  new Date(Date.now() + dias * DIA).toISOString().slice(0, 10);

const ASESORA = '00000000-0001-4000-8000-000000000002';

/** File 1043 (venta 6.200.000 COP): abono inicial y un segundo pago; queda saldo. */
const COBRO_1043: CobroDelArchivo = {
  archivoId: '00000000-0030-4000-8000-000000000001',
  moneda: 'COP',
  estadoDelArchivo: 'ABIERTO',
  total: { unidades: '6200000', moneda: 'COP' },
  pagado: { unidades: '3500000', moneda: 'COP' },
  saldo: { unidades: '2700000', moneda: 'COP' },
  situacion: 'PARCIAL',
  estadoDeCobro: 'POR_VENCER',
  fechaLimite: enDias(6),
  fechaLimiteManual: false,
  diasDePlazo: 30,
  movimientos: [
    {
      id: '00000000-0034-4000-8000-000000000001',
      tipo: 'PAGO',
      monto: { unidades: '2000000', moneda: 'COP' },
      pagadoEl: haceDias(12).slice(0, 10),
      medio: 'TRANSFERENCIA',
      pagadorId: null,
      referencia: 'Bancolombia 4471',
      nota: 'Abono para separar el cupo.',
      notaTachadaEn: null,
      motivo: null,
      reversoDeId: null,
      reversado: false,
      registradoPor: ASESORA,
      registradoEn: haceDias(12),
    },
    {
      id: '00000000-0034-4000-8000-000000000002',
      tipo: 'PAGO',
      monto: { unidades: '1500000', moneda: 'COP' },
      pagadoEl: haceDias(3).slice(0, 10),
      medio: 'EFECTIVO',
      pagadorId: null,
      referencia: null,
      nota: null,
      notaTachadaEn: null,
      motivo: null,
      reversoDeId: null,
      reversado: false,
      registradoPor: ASESORA,
      registradoEn: haceDias(3),
    },
  ],
  avisos: [],
};

/** File 1044 (venta 4.100.000 COP): sin un solo pago — el estado vacío del historial. */
const COBRO_1044: CobroDelArchivo = {
  archivoId: '00000000-0030-4000-8000-000000000002',
  moneda: 'COP',
  estadoDelArchivo: 'ABIERTO',
  total: { unidades: '4100000', moneda: 'COP' },
  pagado: { unidades: '0', moneda: 'COP' },
  saldo: { unidades: '4100000', moneda: 'COP' },
  situacion: 'SIN_PAGOS',
  estadoDeCobro: 'SALDO_PENDIENTE',
  fechaLimite: enDias(21),
  fechaLimiteManual: false,
  diasDePlazo: 30,
  movimientos: [],
  avisos: [],
};

export const MOCK_COBROS: CobroDelArchivo[] = [COBRO_1043, COBRO_1044];

export function cobroDemoDe(archivoId: string): CobroDelArchivo | undefined {
  return MOCK_COBROS.find((c) => c.archivoId === archivoId);
}
