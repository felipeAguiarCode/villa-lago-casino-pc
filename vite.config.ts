import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Dev-only endpoint that saves the Game Select preview pictures: the page posts a JPEG of a table
 * (see src/dev/previews.ts) and it lands in public/assets/previews/<id>.jpg. Not part of the build.
 */
const previewCapture: Plugin = {
  name: 'preview-capture',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__preview', (req, res) => {
      const id = new URL(req.url ?? '', 'http://local').searchParams.get('id') ?? '';
      if (req.method !== 'POST' || !/^[a-z0-9]{2,20}$/.test(id)) {
        res.statusCode = 400;
        res.end('bad request');
        return;
      }
      const parts: Buffer[] = [];
      req.on('data', (c: Buffer) => parts.push(c));
      req.on('end', () => {
        const dir = path.resolve(__dirname, 'public/assets/previews');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${id}.jpg`), Buffer.concat(parts));
        res.end('ok');
      });
    });
  },
};

export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5174 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [previewCapture],
  test: { include: ['tests/**/*.test.ts'], testTimeout: 60000 },
} as any);
