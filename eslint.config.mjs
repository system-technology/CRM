// @ts-check
/**
 * Configuración de ESLint para todo el monorepo (formato plano, un solo archivo).
 *
 * Por qué existe: la compuerta de lint del agente `integrador` llevaba desde el inicio
 * invocando un `eslint` que no estaba instalado en ninguna parte. Una compuerta que no
 * puede ponerse en verde es peor que no tenerla: da la impresión de que se verificó algo.
 *
 * Criterio de selección de reglas: aquí solo entra lo que TypeScript NO puede atrapar por
 * sí mismo. El proyecto ya compila con `strict` y `noUncheckedIndexedAccess`; duplicar eso
 * en reglas de lint solo produce ruido. Lo que queda son errores de ejecución silenciosos
 * —promesas sin esperar, `catch` vacíos— y las fronteras del proyecto.
 *
 * El formato queda fuera a propósito: de eso se encarga Prettier (`eslint-config-prettier`
 * desactiva todo lo que se solape).
 */

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      // Cliente generado por Prisma: no es código nuestro y es enorme.
      'packages/database/generated/**',
      'packages/database/src/generated/**',
      // Lo genera Next en cada build y su cabecera dice explícitamente que no se edite.
      '**/next-env.d.ts',
      // Configuración de herramientas: vive fuera de `rootDir`, así que el analizador con
      // tipos no la alcanza. Incluirla en el tsconfig rompería el build, que sí usa `rootDir`.
      '**/vitest.config.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: {
        // Resuelve el tsconfig de cada paquete sin tener que enumerarlos aquí.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // R-errores (CLAUDE.md §6): nunca un `catch` silencioso.
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Una promesa sin esperar es un fallo que no aparece en ningún log y que `tsc` no ve.
      // En una API con transacciones de base de datos, es el defecto más caro de los baratos.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // `any` explícito se avisa, no se bloquea: hay fronteras con librerías externas donde
      // es legítimo. Lo que no es legítimo es que entre sin que nadie lo note.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Permite el prefijo `_` para lo que se descarta a propósito.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Pruebas y utilidades de scripting: mismo rigor en lo que importa, menos ceremonia.
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/tests/**/*.ts', '**/scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  // Scripts operativos en JavaScript plano: corren en Node, no en el navegador, y quedan
  // fuera de los tsconfig. Sin declarar el entorno, `process` y `console` parecen errores.
  {
    files: ['**/*.mjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      // Hay que CONSERVAR el languageOptions de `disableTypeChecked` —ahí viene el apagado
      // del servicio de proyecto— y añadirle los globales. Reemplazarlo entero devuelve el
      // error de que el archivo no pertenece a ningún tsconfig.
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { ...globals.node },
    },
  },

  // La web corre en el navegador: ahí los globales son otros.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
