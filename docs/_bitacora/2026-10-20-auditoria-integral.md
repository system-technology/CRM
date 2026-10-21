# Auditoría integral — 2026-10-20

## Perímetro

Revisión estática integral del estado del repositorio en la rama `docs/informe-auditoria-externa`. Se cubrieron seguridad/aislamiento, calidad y fronteras, dominio, cobertura, operación y veracidad documental mediante lectura de código, esquema, CI y documentación. No se ejecutaron pruebas ni se inspeccionaron sistemas desplegados.

## Resultado

Se registró un hallazgo alto y cuatro medios en [`docs/_auditorias/2026-10-20-auditoria-integral.md`](../_auditorias/2026-10-20-auditoria-integral.md). Los principales riesgos son PII sensible almacenada sin cifrado, restricciones de edad/uso de silla que no intervienen en la selección de tarifas y una ruta antigua de cotización con resolución divergente. También se anotaron un health check que devuelve HTTP 200 ante degradación y contradicciones en la portada de `ESTADO.md`.

La revisión estática no encontró un bypass evidente entre tenants en los flujos examinados ni importaciones directas entre los módulos revisados. Esto no equivale a repetir la suite de aislamiento ni a una verificación de despliegue.

## Seguimiento

Se añadió el resultado a la tabla de riesgos de `ESTADO.md`. Los hallazgos de código quedan asignados a sus dueños en el informe; no se corrigieron en esta sesión de auditoría.
