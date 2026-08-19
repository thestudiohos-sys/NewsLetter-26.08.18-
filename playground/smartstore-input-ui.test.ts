import type { AddressInfo } from 'node:net';

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

import { createSmartStoreInputUiServer } from './serve-smartstore-input-ui';
import { smartStoreInputSchema } from './smartstore-input';

type UiWindow = Window & {
  HOSSmartStoreInputUI: { getInputData: () => unknown };
};

const html = readFileSync(
  new URL('./smartstore-input-ui.html', import.meta.url),
  'utf-8',
);
const script = readFileSync(
  new URL('./smartstore-input-ui.js', import.meta.url),
  'utf-8',
);

function loadUi(): { window: UiWindow; document: Document } {
  const executableHtml = html.replace(
    '<script src="smartstore-input-ui.js"></script>',
    `<script>${script}</script>`,
  );
  const dom = new JSDOM(executableHtml, {
    runScripts: 'dangerously',
    url: 'http://127.0.0.1:4173/',
  });

  return {
    window: dom.window as unknown as UiWindow,
    document: dom.window.document,
  };
}

function click(document: Document, selector: string): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  expect(button).not.toBeNull();
  button!.click();
}

function input(
  _window: UiWindow,
  document: Document,
  selector: string,
  value: string,
): void {
  const element = document.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector);
  expect(element).not.toBeNull();
  element!.value = value;
  element!.dispatchEvent(
    new element!.ownerDocument.defaultView!.Event('input', { bubbles: true }),
  );
}

function preview(document: Document): Record<string, unknown> {
  return JSON.parse(document.querySelector('#json-preview')!.textContent!);
}

function fillValidSingleProduct(window: UiWindow, document: Document): void {
  input(window, document, '[data-store-field="storeName"]', 'House of Sea');
  input(
    window,
    document,
    '[data-store-field="storeUrl"]',
    'https://smartstore.naver.com/example',
  );
  input(window, document, '[data-store-field="category"]', '생활용품');
  input(
    window,
    document,
    '[data-store-field="targetCustomer"]',
    '실용적인 상품을 찾는 고객',
  );
  input(
    window,
    document,
    '[data-store-field="newsletterTopic"]',
    '이번 주 생활용품 큐레이션',
  );
  input(window, document, '[data-store-field="tone"]', '친근하고 신뢰감 있게');
  input(
    window,
    document,
    '[data-store-field="heroImage"]',
    'playground/assets/brand/host_main3.jpeg',
  );
  input(
    window,
    document,
    '[data-product-field="url"]',
    'https://example.com/1',
  );
  input(window, document, '[data-product-field="name"]', '가상 상품');
  input(window, document, '[data-product-field="price"]', '19,900원');
  input(window, document, '.feature-input', '접어서 보관 가능');
  input(
    window,
    document,
    '[data-product-field="recommendationReason"]',
    '수납공간이 부족한 경우 활용하기 좋습니다.',
  );
  input(
    window,
    document,
    '[data-product-field="mainImage"]',
    'playground/assets/product/wool-dryer-main.png',
  );
}

describe('smartstore input UI', () => {
  test('로컬 HTTP 서버에서 UI 파일을 연다', async () => {
    const server = createSmartStoreInputUiServer();
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('<title>H.O.S 상품 입력</title>');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test('초기 화면에 편집 가능한 전체 필드와 상품 1개를 표시한다', () => {
    const { document } = loadUi();

    expect(document.querySelectorAll('[data-store-field]')).toHaveLength(7);
    expect(document.querySelectorAll('[data-product-field]')).toHaveLength(6);
    expect(document.querySelectorAll('.product-card')).toHaveLength(1);
    expect(document.querySelectorAll('.feature-input')).toHaveLength(1);
  });

  test('입력 결과를 기존 SmartStoreInput schema로 검증할 수 있다', () => {
    const { window, document } = loadUi();
    fillValidSingleProduct(window, document);

    const result = smartStoreInputSchema.safeParse(preview(document));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.products[0]).toMatchObject({
        name: '가상 상품',
        price: '19,900원',
        features: ['접어서 보관 가능'],
      });
    }
  });

  test.each([3, 5])('상품을 %i개까지 추가한다', (count) => {
    const { document } = loadUi();

    while (document.querySelectorAll('.product-card').length < count) {
      click(document, '#add-product');
    }

    expect(document.querySelectorAll('.product-card')).toHaveLength(count);
    expect(document.querySelector('#product-count')?.textContent).toBe(
      `상품 ${count} / 5`,
    );
  });

  test('6번째 상품 추가를 방지한다', () => {
    const { document } = loadUi();

    for (let index = 0; index < 6; index += 1) click(document, '#add-product');

    expect(document.querySelectorAll('.product-card')).toHaveLength(5);
    expect(
      document.querySelector<HTMLButtonElement>('#add-product')?.disabled,
    ).toBe(true);
  });

  test('상품을 삭제하고 최소 1개를 유지한다', () => {
    const { document } = loadUi();
    click(document, '#add-product');
    click(document, '#add-product');

    click(document, '.remove-product');
    expect(document.querySelectorAll('.product-card')).toHaveLength(2);

    click(document, '.remove-product');
    expect(document.querySelectorAll('.product-card')).toHaveLength(1);
    expect(
      document.querySelector<HTMLButtonElement>('.remove-product')?.disabled,
    ).toBe(true);
  });

  test('특징을 추가하고 삭제하며 최소 1개를 유지한다', () => {
    const { document } = loadUi();

    click(document, '.add-feature');
    expect(document.querySelectorAll('.feature-input')).toHaveLength(2);

    click(document, '.remove-feature');
    expect(document.querySelectorAll('.feature-input')).toHaveLength(1);
    expect(
      document.querySelector<HTMLButtonElement>('.remove-feature')?.disabled,
    ).toBe(true);
  });

  test('입력할 때 JSON Preview를 즉시 갱신한다', () => {
    const { window, document } = loadUi();

    input(window, document, '[data-store-field="storeName"]', '변경된 스토어');
    input(window, document, '[data-product-field="name"]', '변경된 상품');

    expect(preview(document)).toMatchObject({
      storeName: '변경된 스토어',
      products: [{ name: '변경된 상품' }],
    });
  });

  test('비어 있는 선택 필드는 JSON Preview에서 제외한다', () => {
    const { document } = loadUi();
    const data = preview(document);
    const product = (data.products as Array<Record<string, unknown>>)[0]!;

    expect(data).not.toHaveProperty('storeUrl');
    expect(data).not.toHaveProperty('heroImage');
    expect(product).not.toHaveProperty('mainImage');
    expect(product).not.toHaveProperty('secondaryImage');
  });
});
