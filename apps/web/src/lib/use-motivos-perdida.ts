'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MotivoDePerdida } from '@viajapro/contracts';
import { estaUsandoApiReal, listarMotivosDePerdidaApi } from './crm-api';
import { formatearErrorAmigable } from './estados-ui-logica';
import { motivosDePerdidaMock } from './motivos-perdida-logica';

/** Motivos activos de la agencia (API real) o la lista por defecto (mock), ordenados. */
export function useMotivosDePerdida() {
  const real = estaUsandoApiReal();
  const [motivos, setMotivos] = useState<MotivoDePerdida[]>(() =>
    real ? [] : motivosDePerdidaMock(),
  );
  const [cargando, setCargando] = useState(real);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!estaUsandoApiReal()) {
      setMotivos(motivosDePerdidaMock());
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    listarMotivosDePerdidaApi(false)
      .then((datos) => setMotivos(datos.filter((m) => m.activo).sort((a, b) => a.orden - b.orden)))
      .catch((err) =>
        setError(formatearErrorAmigable(err, 'No fue posible cargar los motivos de pérdida.')),
      )
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (real) cargar();
  }, [real, cargar]);

  return { motivos, cargando, error, recargar: cargar };
}
