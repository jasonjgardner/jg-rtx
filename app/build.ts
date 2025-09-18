import Bun from 'bun';

await Bun.build({
  entrypoints: ['./app/client.tsx'],
  outdir: './app/public',
  target: 'browser',
});

console.log('Build complete.');
