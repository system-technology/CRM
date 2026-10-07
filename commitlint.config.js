/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'identity',
        'inbox',
        'crm',
        'quoting',
        'booking',
        'payments',
        'automation',
        'analytics',
        'notifications',
        'whatsapp',
        'api',
        'web',
        'worker',
        'db',
        'contracts',
        'ui',
        'infra',
        'docs',
        'deps',
        'release',
      ],
    ],
    'body-max-line-length': [0, 'always'],
  },
};
