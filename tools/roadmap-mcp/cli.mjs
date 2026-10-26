#!/usr/bin/env node
// CLI humano: node tools/roadmap-mcp/cli.mjs <state|next|list|validate|render>
import * as R from './roadmap.mjs';
const [cmd = 'state', ...rest] = process.argv.slice(2);
const store = R.load();
switch (cmd) {
  case 'state':
    console.log(R.renderState(store.data));
    break;
  case 'next':
    console.log(JSON.stringify(R.nextTask(store.data), null, 2));
    break;
  case 'list':
    console.table(
      store.data.tasks
        .filter((t) => !rest[0] || t.status === rest[0])
        .map(({ id, status, priority, effort, phase, title }) => ({
          id,
          status,
          priority,
          effort,
          phase,
          title,
        })),
    );
    break;
  case 'validate': {
    const e = R.validate(store.data);
    console.log(e.length ? e.join('\n') : 'OK');
    process.exit(e.length ? 1 : 0);
  }
  case 'render':
    R.writeState(store.data);
    console.log('roadmap/STATE.md actualizado');
    break;
  default:
    console.log('uso: cli.mjs state|next|list [status]|validate|render');
}
