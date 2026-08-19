import type { AddressInfo } from 'node:net';

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

import { createSmartStoreInputUiServer } from './serve-smartstore-input-ui';
import { smartStoreInputSchema } from './smartstore-input';

type UiWindow = Window & {
  HOSSmartStoreInputUI: {
    getInputData: () => unknown;
    setInputData: (input: unknown) => void;
  };
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

function summaryValue(
  document: Document,
  containerSelector: string,
  label: string,
): string | undefined {
  const rows = document.querySelectorAll(`${containerSelector} .summary-row`);
  const row = [...rows].find(
    (item) => item.querySelector('dt')?.textContent === label,
  );
  return row?.querySelector('dd')?.textContent ?? undefined;
}

async function settle(window: UiWindow): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
    expect(document.querySelector('#preview-title')?.textContent).toBe(
      '입력 내용 요약',
    );
    expect(summaryValue(document, '#store-summary', '스토어명')).toBe('미입력');
    expect(summaryValue(document, '#store-summary', '등록 상품 수')).toBe(
      '1개',
    );
    expect(
      document.querySelector('.summary-product-title strong')?.textContent,
    ).toBe('미입력');
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
    expect(document.querySelector('#summary-product-count')?.textContent).toBe(
      `${count}개`,
    );
    expect(document.querySelectorAll('.summary-product-card')).toHaveLength(
      count,
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
    expect(summaryValue(document, '#store-summary', '등록 상품 수')).toBe(
      '2개',
    );

    click(document, '.remove-product');
    expect(document.querySelectorAll('.product-card')).toHaveLength(1);
    expect(document.querySelectorAll('.summary-product-card')).toHaveLength(1);
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
    expect(summaryValue(document, '#store-summary', '스토어명')).toBe(
      '변경된 스토어',
    );
    expect(
      document.querySelector('.summary-product-title strong')?.textContent,
    ).toBe('변경된 상품');
  });

  test('스토어 정보 일부만 입력해도 빈 값과 입력값을 구분해 요약한다', () => {
    const { window, document } = loadUi();

    input(
      window,
      document,
      '[data-store-field="storeName"]',
      '부분 입력 스토어',
    );
    input(window, document, '[data-store-field="category"]', '리빙');

    expect(summaryValue(document, '#store-summary', '스토어명')).toBe(
      '부분 입력 스토어',
    );
    expect(summaryValue(document, '#store-summary', '카테고리')).toBe('리빙');
    expect(summaryValue(document, '#store-summary', '스토어 URL')).toBe(
      '미입력',
    );
    expect(summaryValue(document, '#store-summary', '말투')).toBe('미입력');
  });

  test('상품 1개의 입력 상태를 사용자용 항목으로 요약한다', () => {
    const { window, document } = loadUi();
    fillValidSingleProduct(window, document);

    expect(
      document.querySelector('.summary-product-title strong')?.textContent,
    ).toBe('가상 상품');
    expect(summaryValue(document, '.summary-product-card', '가격')).toBe(
      '19,900원',
    );
    expect(summaryValue(document, '.summary-product-card', '특징')).toBe('1개');
    expect(summaryValue(document, '.summary-product-card', '추천 이유')).toBe(
      '있음',
    );
    expect(summaryValue(document, '.summary-product-card', '상품 URL')).toBe(
      '있음',
    );
    expect(summaryValue(document, '.summary-product-card', '이미지')).toBe(
      '있음',
    );
  });

  test('상세 JSON은 기본으로 닫혀 있고 사용자가 펼칠 수 있다', () => {
    const { document } = loadUi();
    const details = document.querySelector<HTMLDetailsElement>('#json-details');
    const summary = details?.querySelector('summary');

    expect(details?.open).toBe(false);
    summary?.click();
    expect(details?.open).toBe(true);
    expect(preview(document)).toHaveProperty('products');
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

  test('기존 3개 상품과 특징 배열을 모든 입력 필드에 복원한다', () => {
    const { window, document } = loadUi();
    const input = {
      storeName: '불러온 스토어',
      storeUrl: 'https://smartstore.naver.com/loaded',
      category: '생활용품',
      targetCustomer: '실용 소비층',
      newsletterTopic: '불러온 큐레이션',
      tone: '친절한 말투',
      products: Array.from({ length: 3 }, (_, index) => ({
        name: `상품 ${index + 1}`,
        price: `${index + 1},000원`,
        features: [`특징 ${index + 1}-1`, `특징 ${index + 1}-2`],
        recommendationReason: `추천 ${index + 1}`,
        url: `https://example.com/${index + 1}`,
      })),
    };

    window.HOSSmartStoreInputUI.setInputData(input);

    expect(document.querySelectorAll('.product-card')).toHaveLength(3);
    expect(document.querySelectorAll('.feature-input')).toHaveLength(6);
    expect(preview(document)).toEqual(input);
  });

  test('검증 오류를 화면에 사람이 읽을 수 있게 표시한다', async () => {
    const { window, document } = loadUi();
    window.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: false,
            message: '입력 내용을 확인해 주세요.',
            issues: [
              { path: 'storeName', message: '스토어명은(는) 필수입니다.' },
            ],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    click(document, '#validate-input');
    await settle(window);

    expect(document.querySelector('#workflow-status')?.textContent).toContain(
      '입력 내용을 확인해 주세요.',
    );
    expect(document.querySelector('#validation-errors')?.textContent).toContain(
      'storeName: 스토어명은(는) 필수입니다.',
    );
  });

  test('확정 후 생성하고 미리보기 버튼을 연다', async () => {
    const { window, document } = loadUi();
    fillValidSingleProduct(window, document);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            confirmedHash: 'confirmed-input',
            message: '입력 내용을 확정했습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            previewUrl: '/preview/newsletter.html',
            message: '뉴스레터와 HTML 생성을 완료했습니다.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    window.fetch = fetchMock;
    const open = vi.fn();
    window.open = open as typeof window.open;

    click(document, '#confirm-input');
    await settle(window);
    expect(
      document.querySelector<HTMLButtonElement>('#generate-newsletter')
        ?.disabled,
    ).toBe(false);

    click(document, '#generate-newsletter');
    await settle(window);
    expect(
      document.querySelector<HTMLButtonElement>('#open-preview')?.disabled,
    ).toBe(false);

    click(document, '#open-preview');
    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/^\/preview\/newsletter\.html\?t=\d+$/),
      '_blank',
    );
  });
});
