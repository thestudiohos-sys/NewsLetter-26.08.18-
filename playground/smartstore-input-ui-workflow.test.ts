import type { AddressInfo } from 'node:net';

import type { SmartStoreInput } from './smartstore-input';

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createSmartStoreInputUiServer } from './serve-smartstore-input-ui';

function validInput(productCount = 1): SmartStoreInput {
  return {
    storeName: 'House of Sea',
    storeUrl: 'https://smartstore.naver.com/example',
    category: '생활용품',
    targetCustomer: '실용적인 상품을 찾는 고객',
    newsletterTopic: '이번 주 생활용품 큐레이션',
    tone: '친근하고 신뢰감 있게',
    products: Array.from({ length: productCount }, (_, index) => ({
      name: `가상 상품 ${index + 1}`,
      price: `${index + 1}9,900원`,
      features: [`특징 ${index + 1}`, '사실 그대로 유지'],
      recommendationReason: `추천 이유 ${index + 1}`,
      url: `https://example.com/products/${index + 1}`,
    })),
  };
}

async function startServer(
  options: Parameters<typeof createSmartStoreInputUiServer>[0],
) {
  const server = createSmartStoreInputUiServer(options);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      ),
  };
}

async function post(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('smartstore input UI workflow API', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'hos-smartstore-ui-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  test.each([1, 3, 5])('상품 %i개의 입력을 검증한다', async (count) => {
    const inputFile = resolve(directory, 'smartstore.json');
    const app = await startServer({ inputFile });

    try {
      const response = await post(
        app.baseUrl,
        '/api/validate',
        validInput(count),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    } finally {
      await app.close();
    }
  });

  test('입력을 저장하고 다시 불러올 때 SmartStoreInput을 그대로 유지한다', async () => {
    const inputFile = resolve(directory, 'smartstore.json');
    const input = validInput(3);
    const app = await startServer({ inputFile });

    try {
      const saveResponse = await post(app.baseUrl, '/api/save', input);
      expect(saveResponse.status).toBe(200);
      expect(JSON.parse(await readFile(inputFile, 'utf-8'))).toEqual(input);

      const loadResponse = await fetch(`${app.baseUrl}/api/input`);
      expect(await loadResponse.json()).toEqual({
        ok: true,
        exists: true,
        input,
      });
    } finally {
      await app.close();
    }
  });

  test('검증 실패를 사람이 읽을 수 있는 필드별 메시지로 반환한다', async () => {
    const app = await startServer({
      inputFile: resolve(directory, 'smartstore.json'),
    });

    try {
      const response = await post(app.baseUrl, '/api/validate', {
        ...validInput(),
        storeName: '',
        products: [{ ...validInput().products[0], url: 'not-a-url' }],
      });
      const body = (await response.json()) as {
        ok: boolean;
        issues: Array<{ path: string; message: string }>;
      };

      expect(response.status).toBe(400);
      expect(body.ok).toBe(false);
      expect(body.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'storeName' }),
          expect.objectContaining({ path: 'products.0.url' }),
        ]),
      );
    } finally {
      await app.close();
    }
  });

  test('확정한 동일 데이터만 생성·HTML 렌더링·미리보기에 연결한다', async () => {
    const inputFile = resolve(directory, 'smartstore.json');
    const outputFile = resolve(directory, 'newsletter.html');
    const generateNewsletter = vi.fn(async () => ({ llmCalls: 1 }));
    const renderHtml = vi.fn(async () => {
      await writeFile(outputFile, '<html lang="ko">완성</html>', 'utf-8');
      return { outputFile };
    });
    const app = await startServer({
      inputFile,
      outputFile,
      generateNewsletter,
      renderHtml,
    });

    try {
      const beforeConfirm = await post(app.baseUrl, '/api/generate', {
        confirmedHash: 'missing',
      });
      expect(beforeConfirm.status).toBe(409);

      const confirmResponse = await post(
        app.baseUrl,
        '/api/confirm',
        validInput(3),
      );
      const confirmation = (await confirmResponse.json()) as {
        confirmedHash: string;
      };
      const generationResponse = await post(app.baseUrl, '/api/generate', {
        confirmedHash: confirmation.confirmedHash,
      });

      expect(generationResponse.status).toBe(200);
      expect(await generationResponse.json()).toMatchObject({
        ok: true,
        previewUrl: '/preview/newsletter.html',
      });
      expect(generateNewsletter).toHaveBeenCalledOnce();
      expect(renderHtml).toHaveBeenCalledOnce();

      const previewResponse = await fetch(
        `${app.baseUrl}/preview/newsletter.html`,
      );
      expect(previewResponse.status).toBe(200);
      expect(await previewResponse.text()).toContain('완성');
    } finally {
      await app.close();
    }
  });

  test('확정 뒤 다시 저장하면 이전 확정을 무효화한다', async () => {
    const inputFile = resolve(directory, 'smartstore.json');
    const generateNewsletter = vi.fn(async () => undefined);
    const app = await startServer({ inputFile, generateNewsletter });

    try {
      const confirmed = (await (
        await post(app.baseUrl, '/api/confirm', validInput())
      ).json()) as { confirmedHash: string };
      await post(app.baseUrl, '/api/save', validInput(3));
      const response = await post(app.baseUrl, '/api/generate', confirmed);

      expect(response.status).toBe(409);
      expect(generateNewsletter).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
