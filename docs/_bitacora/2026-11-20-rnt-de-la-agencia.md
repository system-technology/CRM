# 2026-11-20 - El RNT de la agencia, de la base a la propuesta al viajero (T-261)

**Participantes:** el propietario (decidió el rumbo y aprobó la migración), una sola sesión de
Claude (migración, API y web) y `auditor-seguridad` (revisó #321). **Origen:** la propuesta al viajero (auditoría UX I3) no podía imprimir el RNT
(Ley 300 de 1996). **Ramas:** `a/T-000-perfiles-de-agencia-rnt`, `a/T-000-rnt-en-ajustes-api`,
`b/T-000-rnt-en-configuracion`.

## Qué se hizo

| PR | Carril | Qué |
|---|---|---|
| #321 | a (migración, aprobada por el propietario) | Tabla `perfiles_de_agencia` (`tenant_id` PK, `rnt`, `verificado_en`), RLS forzada, disparador `proteger_verificacion_del_perfil` que niega por defecto la verificación, privilegios solo para `viajapro_app`, pruebas P-1 a P-6 en `aislamiento.spec.ts`. |
| #322 | a | `GET/PATCH /api/v1/agencia/ajustes` con `rnt` y `rntVerificado`. Cuerpo del PATCH nuevo, `CambiarAjustesDeAgencia`, estricto: ningún cuerpo puede fijar la verificación. Pruebas unitarias y e2e (aislamiento entre agencias, verificación, upsert). |
| #324 | b | Bloque del RNT en Configuración con tres estados y aviso de re-verificación; la propuesta lo imprime solo si está verificado; cliente y maqueta al día. |

Este PR (carril `i`) cierra T-261, ajusta T-268, T-285 y T-280, y añade T-306 y T-307.

## Decisiones

- **El RNT va en `perfiles_de_agencia`, no en `tenants`.** La tarea original decía «columna en
  tenants» y contradecía el ADR-0030 (aceptado): fue un error de quien la escribió, por no leerlo.
  El propietario eligió seguir el ADR con una migración mínima.
- **Desviación 1 del ADR-0030: la tabla solo trae `rnt` y `verificado_en`.** El NIT de una persona
  natural es su cédula; primero hay que decidir su cifrado (ADR-0015, R10). `nit`,
  `digito_verificacion` y `razon_social` llegan con T-268.
- **Desviación 2: el disparador conserva `verificado_en` si el RNT no cambia.** El ADR dice que lo
  pone en NULL siempre que escribe `viajapro_app`; con eso, cualquier UPDATE de la API que no toque
  el RNT (por ejemplo, el que fija `actualizado_en`) borraría la verificación. Sí lo anula si el RNT
  cambia, y nunca deja que ese rol lo fije. El ADR no se edita: queda aquí.
- **«La plataforma» es el dueño de la tabla.** El disparador lo pregunta al catálogo
  (`pg_has_role(current_user, relowner, 'USAGE')`); no confía en nada que el cliente pueda fijar.
- **Contrato compatible.** `AjustesDeAgencia` gana `rnt` y `rntVerificado` como opcionales, y
  `ActualizarAjustesDeAgencia` queda intacto mientras la web migraba (los PR no mezclan carriles);
  se retira en T-306.
- **No se ejecutó `auditor-seguridad` en #322 ni en #324.** No traen migración ni acceso nuevo a
  datos; #321 sí tuvo la revisión, y la e2e de #322 prueba el aislamiento.

## Auditoría de #321 (revisión estática de `auditor-seguridad`)

Sin fugas entre agencias ni vía para que un rol de aplicación deje `verificado_en` no nulo. Un
bloqueante de texto, corregido antes de integrar: el comentario decía que T-268 solo añadiría
columnas, y es falso (debe reemplazar el disparador para el NIT). Quedó en la cola:

- Carrera al verificar: la marca debe llevar `AND rnt = <comprobado>` y exigir una fila (T-280).
- «Plataforma = dueño» obliga a T-280 a usar la credencial de las migraciones; conviene un rol
  verificador (T-280).
- Endurecimiento menor: `creado_en` y `actualizado_en` por la base, y dos mutaciones de la prueba
  de aislamiento (T-307).

## Cómo se verificó

- **CI en verde:** #321 (15 de 15, dos veces: antes y después de incorporar `main`) y #322 (14 de 14,
  con `test` corriendo la e2e y `aislamiento-tenants` aplicando la migración). El CI de #324 se
  comprueba al integrarse.
- **Localmente:** `tsc`, `eslint` y las pruebas unitarias del API (145 archivos), de contratos y de
  la web (171 archivos); capturas de Configuración en 1440 y 390 px, sin errores de consola ni
  desborde.
- **No se pudo** ejecutar Postgres en el entorno de trabajo (se denegó arrancarlo): la primera
  ejecución real de la migración y de la e2e fue la del CI.

## Pendiente y supuestos

- **Con la API real nadie tiene el RNT verificado** hasta T-280, así que la propuesta sale sin él. El
  propietario marca la agencia piloto a mano, con el rol dueño, con una sola fila afectada:
  `UPDATE perfiles_de_agencia SET verificado_en = now() WHERE tenant_id = '<id>' AND rnt = '<RNT comprobado>'`
  (antes, si ese rol no es superusuario, `SELECT set_config('app.current_tenant', '<id>', true)`).
- **Supuesto sin verificar contra la fuente oficial:** el RNT son solo dígitos, de 1 a 10. Si el
  registro admitiera otro formato, es una migración nueva que relaja
  `perfiles_de_agencia_rnt_formato`.
- La maqueta de la propuesta (modo demo) es estática: su RNT cuenta como verificado.
- Los commits de #309 (la propuesta al viajero) llevan una línea `Co-Authored-By` con un identificador
  de modelo, contra la instrucción del propietario de no incluirlo. Ya están en `main` y no se
  reescribe la historia; los de #321, #322 y #324 no la llevan.
