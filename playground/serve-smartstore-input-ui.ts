import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import {
  type IncomingMessage,
  type ServerResponse,
  createServer,
} from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATA_DIR, OUTPUT_DIR, ensureDir } from './_shared';
import {
  type SmartStoreInput,
  loadSmartStoreInput,
  smartStoreInputSchema,
} from './smartstore-input';

const PLAYGROUND_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_INPUT_FILE = resolve(DATA_DIR, 'smartstore.json');
const DEFAULT_OUTPUT_FILE = resolve(OUTPUT_DIR, 'newsletter.html');
const ASSETS_DIR = resolve(PLAYGROUND_DIR, 'assets');
const MAX_REQUEST_BYTES = 1_000_000;

const staticRoutes = new Map([
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

type PipelineResult = Record<string, unknown> | void;

export type SmartStoreInputUiServerOptions = {
  inputFile?: string;
  outputFile?: string;
  generateNewsletter?: () => Promise<PipelineResult>;
  renderHtml?: () => Promise<PipelineResult>;
};

type ApiError = {
  status: number;
  message: string;
  issues?: Array<{ path: string; message: string }>;
};

function json(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function validationError(input: unknown): ApiError {
  const result = smartStoreInputSchema.safeParse(input);
  if (result.success) {
    return { status: 400, message: '입력 내용을 확인해 주세요.' };
  }

  return {
    status: 400,
    message: '입력 내용을 확인해 주세요.',
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || 'input',
      message: issue.message,
    })),
  };
}

function asApiError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'validationInput' in error) {
    return validationError(
      (error as { validationInput: unknown }).validationInput,
    );
  }

  return {
    status: 500,
    message:
      error instanceof Error
        ? error.message
        : '알 수 없는 서버 오류가 발생했습니다.',
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error('입력 데이터가 허용 크기를 초과했습니다.');
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
  } catch (error) {
    throw new Error('요청 데이터의 JSON 형식이 올바르지 않습니다.', {
      cause: error,
    });
  }
}

function inputHash(input: SmartStoreInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function writeInputAtomically(
  filePath: string,
  input: SmartStoreInput,
): Promise<void> {
  await ensureDir(dirname(filePath));
  const temporaryFile = `${filePath}.${randomUUID()}.tmp`;

  try {
    await writeFile(
      temporaryFile,
      `${JSON.stringify(input, null, 2)}\n`,
      'utf-8',
    );
    await rename(temporaryFile, filePath);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function contentTypeFor(filePath: string): string {
  const contentTypes: Record<string, string> = {
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  return (
    contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  );
}

async function serveFile(
  response: ServerResponse,
  filePath: string,
  contentType = contentTypeFor(filePath),
): Promise<void> {
  const content = await readFile(filePath);
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  response.end(content);
}

export function createSmartStoreInputUiServer(
  options: SmartStoreInputUiServerOptions = {},
) {
  const inputFile = options.inputFile ?? DEFAULT_INPUT_FILE;
  const outputFile = options.outputFile ?? DEFAULT_OUTPUT_FILE;
  let confirmedHash: string | undefined;

  const generateNewsletter =
    options.generateNewsletter ??
    (async () => {
      const { generateSmartStoreNewsletter } =
        await import('./generate-smartstore-newsletter');
      return generateSmartStoreNewsletter();
    });
  const renderHtml =
    options.renderHtml ??
    (async () => {
      const { renderSmartStoreNewsletterHtml } =
        await import('./render-smartstore-html');
      return renderSmartStoreNewsletterHtml();
    });

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');

    try {
      if (request.method === 'GET' && requestUrl.pathname === '/api/input') {
        if (!(await exists(inputFile))) {
          json(response, 200, { ok: true, exists: false });
          return;
        }
        const input = await loadSmartStoreInput(inputFile);
        json(response, 200, { ok: true, exists: true, input });
        return;
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/status') {
        json(response, 200, {
          ok: true,
          inputExists: await exists(inputFile),
          outputExists: await exists(outputFile),
          confirmed: Boolean(confirmedHash),
        });
        return;
      }

      if (
        request.method === 'POST' &&
        ['/api/validate', '/api/save', '/api/confirm'].includes(
          requestUrl.pathname,
        )
      ) {
        const candidate = await readJsonBody(request);
        const parsed = smartStoreInputSchema.safeParse(candidate);
        if (!parsed.success) throw { validationInput: candidate };

        if (requestUrl.pathname === '/api/save') {
          await writeInputAtomically(inputFile, parsed.data);
          confirmedHash = undefined;
          json(response, 200, {
            ok: true,
            message: '입력 내용을 안전하게 저장했습니다.',
          });
          return;
        }

        if (requestUrl.pathname === '/api/confirm') {
          await writeInputAtomically(inputFile, parsed.data);
          confirmedHash = inputHash(parsed.data);
          json(response, 200, {
            ok: true,
            confirmedHash,
            message:
              '입력 내용을 확정했습니다. 이제 뉴스레터를 생성할 수 있습니다.',
          });
          return;
        }

        json(response, 200, {
          ok: true,
          message: `검증을 통과했습니다. 상품 ${parsed.data.products.length}개`,
        });
        return;
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/generate'
      ) {
        const body = (await readJsonBody(request)) as {
          confirmedHash?: unknown;
        };
        if (
          typeof body.confirmedHash !== 'string' ||
          !confirmedHash ||
          body.confirmedHash !== confirmedHash
        ) {
          json(response, 409, {
            ok: false,
            message: '현재 입력 내용을 먼저 확정해 주세요.',
          });
          return;
        }

        const savedInput = await loadSmartStoreInput(inputFile);
        if (inputHash(savedInput) !== confirmedHash) {
          confirmedHash = undefined;
          json(response, 409, {
            ok: false,
            message:
              '확정 후 저장 데이터가 변경되었습니다. 다시 확정해 주세요.',
          });
          return;
        }

        const generation = await generateNewsletter();
        const rendering = await renderHtml();
        json(response, 200, {
          ok: true,
          message: '뉴스레터와 HTML 생성을 완료했습니다.',
          previewUrl: '/preview/newsletter.html',
          generation: generation ?? null,
          rendering: rendering ?? null,
        });
        return;
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/preview/newsletter.html'
      ) {
        await serveFile(response, outputFile, 'text/html; charset=utf-8');
        return;
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname.startsWith('/assets/')
      ) {
        const relativePath = decodeURIComponent(
          requestUrl.pathname.slice('/assets/'.length),
        );
        const assetPath = resolve(ASSETS_DIR, relativePath);
        const assetRoot = `${ASSETS_DIR}${sep}`.toLowerCase();
        if (!assetPath.toLowerCase().startsWith(assetRoot)) {
          response.writeHead(403).end('Forbidden');
          return;
        }
        await serveFile(response, assetPath);
        return;
      }

      const route = staticRoutes.get(requestUrl.pathname);
      if (request.method === 'GET' && route) {
        await serveFile(
          response,
          resolve(PLAYGROUND_DIR, route.file),
          route.contentType,
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
    } catch (error) {
      const apiError = asApiError(error);
      if (requestUrl.pathname.startsWith('/api/')) {
        json(response, apiError.status, {
          ok: false,
          message: apiError.message,
          ...(apiError.issues ? { issues: apiError.issues } : {}),
        });
        return;
      }

      const code = (error as NodeJS.ErrnoException).code;
      response.writeHead(code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      response.end(
        code === 'ENOENT'
          ? '파일을 찾을 수 없습니다.'
          : '파일을 읽을 수 없습니다.',
      );
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
