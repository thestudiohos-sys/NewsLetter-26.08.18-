import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYGROUND_DIR = fileURLToPath(new URL('.', import.meta.url));

const routes = new Map([
  [
    '/',
    {
      file: 'smartstore-input-ui.html',
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/smartstore-input-ui.html',
    {
      file: 'smartstore-input-ui.html',
      contentType: 'text/html; charset=utf-8',
    },
  ],
  [
    '/smartstore-input-ui.css',
    { file: 'smartstore-input-ui.css', contentType: 'text/css; charset=utf-8' },
  ],
  [
    '/smartstore-input-ui.js',
    {
      file: 'smartstore-input-ui.js',
      contentType: 'text/javascript; charset=utf-8',
    },
  ],
]);

export function createSmartStoreInputUiServer() {
  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    const route = routes.get(requestUrl.pathname);

    if (!route) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }

    try {
      const content = await readFile(resolve(PLAYGROUND_DIR, route.file));
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': route.contentType,
      });
      response.end(content);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('UI 파일을 읽을 수 없습니다.');
      console.error(error);
    }
  });
}

function isDirectExecution(): boolean {
  return Boolean(
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]),
  );
}

if (isDirectExecution()) {
  const port = Number(process.env.HOS_SMARTSTORE_UI_PORT ?? 4173);
  const server = createSmartStoreInputUiServer();

  server.listen(port, '127.0.0.1', () => {
    console.log('[PASS] H.O.S 상품 입력 UI 서버 실행');
    console.log(`URL: http://127.0.0.1:${port}`);
    console.log('종료하려면 Ctrl+C를 누르십시오.');
  });
}
