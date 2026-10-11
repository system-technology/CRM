# Revisión — `685ec53` — 2026-10-10

Entrega: *Rediseño de 3 columnas, componentes de bandeja y pruebas puras*.

## Veredicto: **PASA con una corrección bloqueante**

El salto es grande y se nota al abrirlo. Lo que pedía la tarea 0b está hecho, y lo comprobé
mirándolo, no leyendo el código:

| Lo que pedía 0b | Estado |
|---|---|
| Sacar el instrumental de desarrollo | **Hecho.** Cero apariciones de «Mock Simulador», «Guard R5/UI» o «v0.1.0» |
| Matar el `alert()` de plantillas | **Hecho.** Cero `alert(` en el hilo |
| Armazón de tres columnas | **Hecho.** `layout.tsx` existe y abrir una conversación ya no pierde la lista |
| Barra lateral de módulos | **Hecho**, con la métrica del asesor abajo |
| Ficha del contacto a la derecha | **Hecha**, con oportunidad viva, valor estimado, archivos de viaje y consentimientos |
| Acción principal visible | **Hecha.** «Crear cotización» en azul, abajo a la derecha, y «Nueva cotización» arriba |

Compuertas: `lint` limpio, `typecheck` limpio, `test` 8/8. Sin errores de consola salvo un
`favicon.ico` 404, que es cosmético.

Y el acento azul está aplicado. Se ve como el producto que el propietario aprobó.

---

## Lo bloqueante: la ficha enseña a otro viajero

Abrí tres conversaciones seguidas y la ficha de la derecha **no cambió**:

| Conversación abierta | Teléfono en la ficha |
|---|---|
| Juan Pérez | `+573001234567` |
| Ana Martínez | `+573001234567` |
| Sonia López | `+573001234567` |

Siempre Sofía Gómez. La cabecera dice «Juan Pérez · +573000012345» y treinta centímetros a la
derecha, bajo «Ficha del Viajero», hay otra persona con otro número, otras etiquetas y otra
oportunidad de 12.500.000 COP.

**Por qué esto no es un detalle de datos simulados.** Un asesor que mira esa pantalla cotiza
Cancún para quien preguntó por San Andrés. Y si esos datos fueran reales, estaría viendo el
expediente de un viajero dentro de la conversación de otro — que es lo mismo que todo el
aislamiento entre agencias intenta impedir, pero dentro de la misma agencia. La ficha tiene que
estar atada al `conversacionId` igual que el hilo.

Corrección: que el componente reciba el contacto de la conversación abierta, no una constante.
Con `FichaDeContacto` de `@viajapro/contracts` y el simulador devolviendo la ficha **del id que
se le pide**.

**Y una prueba que falle hoy**: abrir dos conversaciones distintas y afirmar que el teléfono de
la ficha es distinto. Con el código actual tiene que salir en rojo.

## A la cola — no bloquea (R13)

| | Qué | Dónde |
|---|---|---|
| 1 | `favicon.ico` da 404 | `app/` |
| 2 | La ventana de 24 h dice «11 h 59 min» en casi todas las filas: el dato simulado es constante y no enseña el caso que importa, el que está por vencer | `lib/mock-inbox.ts` |
| 3 | «Ver archivo completo (Próximamente)» — un botón que anuncia lo que no existe. O se quita o se deshabilita sin promesa | panel de la ficha |
| 4 | El contraste del tono 500 sobre blanco es 3.68 y no vale para texto; revisar que no se use en etiquetas | `globals.css` |

---

## Siguiente bloque

1. **La ficha atada a su conversación**, con la prueba en rojo antes y en verde después.
2. **Rehacer las pruebas de la tarea 5**, que devolví: cuatro de las seis reescribían la lógica
   dentro del propio `it` en vez de importarla. Ahora que hay componentes de verdad y funciones
   separadas, ya hay algo que importar — era la mitad del problema y la has resuelto tú sola al
   partir la pantalla en piezas.
3. Luego, lo que esté en `COLA.md`.

Una cosa más, y va de método: esta entrega salió bien porque la cola tenía **una sola tarea**.
Las tres anteriores se saltaron la misma tarea con siete opciones delante. No era tuyo el fallo:
era mío, por poner un menú donde tenía que haber una instrucción. Lo mantengo así.
