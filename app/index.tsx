import { runBuilds, BuildOptions, Variant } from '../src/scripts/build-packs';
import path from 'path';
import sharp from 'sharp';
import { globby } from 'globby';

const AppShell = `
<!DOCTYPE html>
<html>
  <head>
    <title>JG RTX Customizer</title>
    <style>
      body { font-family: sans-serif; padding: 2em; }
      form > div { margin-bottom: 1em; }
      h2, h3, h4 { margin-top: 0; }
      label { display: block; margin-bottom: 0.5em; }
      input[type="text"] { width: 300px; }
      #texture-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 1em; }
      #texture-list img { width: 100%; aspect-ratio: 1; object-fit: contain; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="/client.js"></script>
  </body>
</html>
`;

const CWD = process.cwd();
const SRC_TEXTURES = path.join(CWD, 'bedrock/pack/RP/textures');
const DIST_DIR = path.join(CWD, 'dist');


Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/' && req.method === 'GET') {
      return new Response(AppShell, {
        headers: {
          'Content-Type': 'text/html',
        },
      });
    }

    if (url.pathname === '/client.js' && req.method === 'GET') {
        const clientScript = await Bun.file('app/public/client.js').text();
        return new Response(clientScript, {
            headers: {
                'Content-Type': 'application/javascript',
            },
        });
    }

    if (url.pathname.startsWith('/textures/')) {
        const texturePath = url.pathname.substring('/textures/'.length);
        const fullPath = path.join(SRC_TEXTURES, texturePath);

        try {
            const file = Bun.file(fullPath);
            if (await file.exists()) {
                if (url.searchParams.has('thumbnail')) {
                    const buffer = await file.arrayBuffer();
                    const thumbnailBuffer = await sharp(buffer).resize(128, 128).png().toBuffer();
                    return new Response(thumbnailBuffer, {
                        headers: { 'Content-Type': 'image/png' },
                    });
                } else {
                    return new Response(file, {
                        headers: { 'Content-Type': file.type },
                    });
                }
            }
        } catch (error) {
            console.error(error);
        }
        return new Response('Not Found', { status: 404 });
    }

    if (url.pathname === '/api/textures' && req.method === 'GET') {
        const files = await globby(['**/*.{png,tga}'], {
            cwd: SRC_TEXTURES,
            ignore: [
              '**/*_normal.*',
              '**/*_heightmap.*',
              '**/*_mer.*',
              '**/*_mers.*',
              '**/*.texture_set.json',
            ],
        });
        return new Response(JSON.stringify(files), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (url.pathname.startsWith('/dist/')) {
        const filePath = url.pathname.substring('/dist/'.length);
        const fullPath = path.join(DIST_DIR, filePath);
        try {
            const file = Bun.file(fullPath);
            if (await file.exists()) {
                return new Response(file, {
                    headers: {
                        'Content-Type': 'application/zip',
                        'Content-Disposition': `attachment; filename="${path.basename(fullPath)}"`
                    },
                });
            }
        } catch (error) {
            console.error(error);
        }
        return new Response('Not Found', { status: 404 });
    }

    if (url.pathname === '/build' && req.method === 'POST') {
      try {
        const options = await req.json();
        // Add default values for options that are not part of the form yet
        const fullOptions: BuildOptions & { nameRTX: string; nameVV: string; } = {
          ...options,
          outBase: 'dist',
          zipPacks: true,
          rewriteManifest: true,
          updateCapabilities: true,
          newUUIDs: true,
          fallbackMERSForRTX: true,
          fallbackMERForVV: true,
          processScope: 'allTextures',
          minifyJSON: true,
          dryRun: false,
        };
        const zipPaths = await runBuilds(fullOptions);
        const relativePaths = zipPaths.map(p => path.relative(CWD, p));
        return new Response(JSON.stringify({
            message: 'Build successful!',
            zipPaths: relativePaths,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ message: 'Build failed.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log('Server running at http://localhost:3000/');
