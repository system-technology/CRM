# 2026-11-21 — El manual vuelve a describir las pantallas de hoy (T-576)

**Participantes:** agente `documentador`
**Duración / alcance:** `docs/06-manual/`: dos notas obsoletas, capturas regeneradas, menú del asesor.

## Qué se hizo
- Paso 1 del recorrido del asesor: se quitó la nota del recuadro verde «Conectado a la API» (T-565 lo retiró).
- Paso 11: se quitó la advertencia del filtro «Míos». `capturas.mjs` ahora toma `asesor-11-mis-numeros` con
  `/reportes?vista=asesor` (vista de asesor puro de la demostración, T-566). La captura muestra el título «Mis números».
- `regenerar-capturas.md`: se quitó la misma afirmación del recuadro verde.
- Se regeneraron las 16 capturas (la de ingreso con una compilación aparte con `NEXT_PUBLIC_USE_REAL_AUTH=true`).
- El menú de la introducción decía que era «siempre el mismo»: ya no lo es. El dueño ve además «Cobros» (T-332).

## Decisiones tomadas
| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| Las capturas salvo la 11 siguen en vista de dueño | La vista de asesor quita entradas del menú; cambiarlas todas era alcance extra | Introducción del recorrido del asesor |

## Qué quedó pendiente
- [ ] El saludo de «Hoy» («buenas tardes/noches») depende de la hora de la captura: la imagen cambia sin que cambie la pantalla.
- [ ] El manual no explica la insignia «Vista: dueño/asesor» más que con una línea en el paso 11.

## Qué aprendimos
- Al regenerar todo, casi todas las capturas cambian por la barra lateral (insignia «Vista», entrada «Cobros»), no por T-583.
- T-569 hizo visibles el botón «Guardar etapas» y los iconos de «Etapas del Pipeline»; T-583 cambió contrastes en reportes.
- La captura de ingreso exige reconstruir la web con `NEXT_PUBLIC_USE_REAL_AUTH=true`.
