/** @type {import('@commitlint/types').UserConfig} */

/**
 * Convención de mensajes de commit.
 *
 * Esto estuvo escrito pero desconectado: no existía `.husky/commit-msg`, así que la regla no
 * se aplicaba nunca. Al conectarla salió a la luz que el propio historial de `main` no la
 * cumplía — usaba tipos (`design`, `release`) y ámbitos (`hilo`, `stitch`, `dx`) que el enum
 * no contemplaba.
 *
 * Se corrigió el archivo, no el historial: la convención debe describir cómo trabaja el
 * proyecto de verdad. Una regla que obliga a inventar un ámbito falso para poder commitear
 * no mejora nada; solo enseña a esquivarla.
 */
export default {
  extends: ['@commitlint/config-conventional'],

  /**
   * Los commits de integración los produce el agente `integrador` con su propio formato,
   * `release(vX.Y.Z)`, donde el ámbito es la versión. `scope-enum` no sabe expresar un
   * patrón, así que se exceptúan aquí en vez de abrir el enum a cualquier cosa.
   * Las fusiones las escribe git.
   */
  ignores: [
    (mensaje) => /^release\(v\d+\.\d+\.\d+\)/.test(mensaje),
    (mensaje) => /^Merge /.test(mensaje),
  ],

  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'style',
        // Propios del proyecto:
        'design', // exploración y sistema de diseño
        'release', // integración a main por el agente `integrador`
      ],
    ],
    'scope-enum': [
      2,
      'always',
      [
        // Contextos delimitados (CLAUDE.md §5)
        'identity',
        'inbox',
        'crm',
        'quoting',
        'booking',
        'payments',
        'automation',
        'analytics',
        'notifications',
        'audit',
        // Aplicaciones y paquetes
        'api',
        'web',
        'worker',
        'db',
        'contracts',
        'domain',
        'ui',
        'sdk',
        // Transversales
        'whatsapp',
        'infra',
        'deps',
        'ci',
        'dx', // fricciones del entorno de desarrollo
        'lint',
        'test',
        // Documentación y gobierno del hilo (CLAUDE.md §9)
        'docs',
        'adr',
        'hilo', // ESTADO.md, bitácora, coherencia documental
        'estado',
        'estructura',
        'entregables',
        'roadmap',
        // Capa de ingeniería asistida por IA
        'agentes',
        'skills',
        'hooks',
        'mcp',
        'stitch',
        'diseno',
        // Seguridad
        'seguridad',
        'rls',
      ],
    ],
    'body-max-line-length': [0, 'always'],
  },
};
