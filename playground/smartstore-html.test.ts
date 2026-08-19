import type { SmartStoreInput } from './smartstore-input';

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  parseNewsletterMarkdown,
  renderSmartStoreHtml,
} from './smartstore-html';
import { parseSmartStoreInput } from './smartstore-input';
import { renderSmartStoreNewsletterMarkdown } from './smartstore-prompts';

const template = readFileSync(
  fileURLToPath(
    new URL(
      './data-examples/smartstore-template.example.html',
      import.meta.url,
    ),
  ),
  'utf-8',
);

function createProduct(index: number) {
  return {
    name: `가상 테스트 상품 ${index}`,
    price: `${index}9,900원`,
    features: [`가상 특징 ${index}-A`, `가상 특징 ${index}-B`],
    recommendationReason: `가상 추천 이유 ${index}를 원문 그대로 표시합니다.`,
    url: `https://smartstore.naver.com/example/products/${index}`,
  };
}

function createInput(productCount: number): SmartStoreInput {
  return parseSmartStoreInput({
    storeName: '테스트 스토어',
    category: '생활용품',
    targetCustomer: '실용적인 생활용품을 찾는 고객',
    newsletterTopic: '이번 주 생활용품 큐레이션',
    tone: '친근하고 신뢰감 있는 문체',
    products: Array.from({ length: productCount }, (_, index) =>
      createProduct(index + 1),
    ),
  });
}

function createMarkdown(input: SmartStoreInput): string {
  return renderSmartStoreNewsletterMarkdown(input, {
    title: '테스트 고객을 위한 이번 주 생활용품 큐레이션 이야기',
    intro:
      '실용적인 생활용품을 찾는 분들이 차분하게 살펴볼 수 있도록 이번 셀렉션을 준비했습니다.',
    cta: '관심 있는 상품은 각 상품의 상세 URL에서 확인해 보세요.',
  });
}

function renderMagazine(input: SmartStoreInput): {
  html: string;
  document: Document;
} {
  const html = renderSmartStoreHtml(createMarkdown(input), template, input);
  return { html, document: new JSDOM(html).window.document };
}

describe('smartstore HTML renderer', () => {
  test('newsletter Markdown의 제목과 본문을 분리한다', () => {
    const input = createInput(1);
    expect(parseNewsletterMarkdown(createMarkdown(input))).toMatchObject({
      title: '테스트 고객을 위한 이번 주 생활용품 큐레이션 이야기',
    });
  });

  test.each([1, 3, 5])('상품 %i개를 매거진 섹션으로 렌더링한다', (count) => {
    const { document } = renderMagazine(createInput(count));

    expect(document.querySelectorAll('.product-section')).toHaveLength(count);
  });

  test('이미지 없는 Hero와 상품에 fallback을 표시한다', () => {
    const { document } = renderMagazine(createInput(1));

    expect(document.querySelector('.hero-image-fallback')).not.toBeNull();
    expect(document.querySelector('.product-image-fallback')).not.toBeNull();
  });

  test('상품명, 가격, 특징, 추천 이유, URL을 원문 그대로 보존한다', () => {
    const input = createInput(3);
    const { document } = renderMagazine(input);
    const text = document.body.textContent ?? '';
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((anchor) => anchor.href)
      .filter((href) => href.includes('/products/'));

    for (const product of input.products) {
      expect(text).toContain(product.name);
      expect(text).toContain(product.price);
      for (const feature of product.features) expect(text).toContain(feature);
      expect(text).toContain(product.recommendationReason);
      expect(hrefs).toContain(product.url);
    }
  });

  test('사용자 입력을 HTML escape한다', () => {
    const input = parseSmartStoreInput({
      ...createInput(1),
      storeName: '<script>brand</script>',
      products: [
        {
          ...createProduct(1),
          name: '<em>escape 상품</em>',
          features: ['<script>feature</script>'],
        },
      ],
    });
    const { html, document } = renderMagazine(input);

    expect(document.querySelector('script')).toBeNull();
    expect(document.body.textContent).toContain('<em>escape 상품</em>');
    expect(html).toContain('&lt;em&gt;escape 상품&lt;/em&gt;');
  });

  test('이미지 alt text를 상품명으로 만들고 클릭 시 상품 URL로 이동한다', () => {
    const base = createInput(1);
    const input = parseSmartStoreInput({
      ...base,
      heroImage: 'playground/assets/brand/host_main3.jpeg',
      products: [
        {
          ...base.products[0],
          mainImage: 'playground/assets/product/wool-dryer-main.png',
          secondaryImage: 'playground/assets/product/wool-dryer-sub1.png',
        },
      ],
    });
    const { document } = renderMagazine(input);
    const mainImage =
      document.querySelector<HTMLImageElement>('.product-image');
    const secondaryImage =
      document.querySelector<HTMLImageElement>('.secondary-image');

    expect(
      document.querySelector<HTMLImageElement>('.hero-image')?.src,
    ).toContain('../assets/brand/host_main3.jpeg');
    expect(mainImage?.alt).toBe(input.products[0]!.name);
    expect(mainImage?.src).toContain('../assets/product/wool-dryer-main.png');
    expect(mainImage?.closest('a')?.href).toBe(input.products[0]!.url);
    expect(secondaryImage?.alt).toBe(`${input.products[0]!.name} 보조 이미지`);
    expect(secondaryImage?.closest('a')?.href).toBe(input.products[0]!.url);
  });

  test('공개 https 이미지 URL을 변경하지 않는다', () => {
    const base = createInput(1);
    const input = parseSmartStoreInput({
      ...base,
      heroImage: 'https://cdn.example.com/hero.jpg',
      products: [
        {
          ...base.products[0],
          mainImage: 'https://cdn.example.com/product.jpg',
        },
      ],
    });
    const { document } = renderMagazine(input);

    expect(document.querySelector<HTMLImageElement>('.hero-image')?.src).toBe(
      input.heroImage,
    );
    expect(
      document.querySelector<HTMLImageElement>('.product-image')?.src,
    ).toBe(input.products[0]!.mainImage);
  });

  test('storeUrl이 있으면 입력 URL의 CTA 버튼을 생성한다', () => {
    const input = parseSmartStoreInput({
      ...createInput(1),
      storeUrl: 'https://smartstore.naver.com/example',
    });
    const { document } = renderMagazine(input);
    const button = document.querySelector<HTMLAnchorElement>('.store-button');

    expect(button?.href).toBe(input.storeUrl);
    expect(button?.textContent).toContain(input.storeName);
  });

  test('storeUrl이 없으면 Store CTA 링크를 생성하지 않는다', () => {
    const { document } = renderMagazine(createInput(1));
    const cta = document.querySelector('.bottom-cta');

    expect(cta?.querySelector('.store-button')).toBeNull();
    expect(cta?.querySelector('a')).toBeNull();
    expect(cta?.querySelector('.store-link-fallback')).not.toBeNull();
  });

  test('특정 스토어명과 URL을 하드코딩하지 않는다', () => {
    const { html } = renderMagazine(createInput(1));

    expect(html).not.toContain('MY ALL KOREA');
    expect(html).not.toContain('myallkorea1');
    expect(html).not.toContain('NEW ARRIVALS');
  });

  test('긴 상품명과 추천 이유를 생략하지 않는다', () => {
    const base = createInput(1);
    const longName = `매우 긴 상품명 ${'상세한 이름 '.repeat(12)}`.trim();
    const longReason =
      `긴 추천 이유 ${'입력 원문을 그대로 유지합니다. '.repeat(20)}`.trim();
    const input = parseSmartStoreInput({
      ...base,
      products: [
        {
          ...base.products[0],
          name: longName,
          recommendationReason: longReason,
        },
      ],
    });
    const { document } = renderMagazine(input);

    expect(document.querySelector('.product-name')?.textContent).toBe(longName);
    expect(document.querySelector('.recommendation-reason')?.textContent).toBe(
      longReason,
    );
  });

  test('newsletter.md와 JSON이 다르면 text renderer로 조용히 fallback하지 않는다', () => {
    const markdownInput = createInput(1);
    const changedInput = parseSmartStoreInput({
      ...markdownInput,
      products: [{ ...markdownInput.products[0], name: '변경된 상품명' }],
    });

    expect(() =>
      renderSmartStoreHtml(
        createMarkdown(markdownInput),
        template,
        changedInput,
      ),
    ).toThrow('사실 데이터가 일치하지 않습니다.');
  });

  test('매거진용 editorial 구조가 잘못되면 명확히 거부한다', () => {
    const input = createInput(1);
    const malformed = `---\ntitle: "잘못된 매거진 뉴스레터 구조를 확인하는 충분히 긴 제목"\n---\n\n구분선 없는 본문`;

    expect(() => renderSmartStoreHtml(malformed, template, input)).toThrow(
      '매거진 렌더링에 필요한 newsletter.md 구조를 찾을 수 없습니다.',
    );
  });

  test('기존 2인자 text renderer를 유지한다', () => {
    const input = createInput(1);
    const markdown = createMarkdown(input);
    const html = renderSmartStoreHtml(markdown, template);
    const document = new JSDOM(html).window.document;

    expect(document.querySelector('.magazine')).toBeNull();
    expect(document.body.textContent).toContain(input.products[0]!.name);
    expect(
      document.querySelector(`a[href="${input.products[0]!.url}"]`),
    ).not.toBeNull();
  });

  test('유효한 문서, inline CSS, media query, 외부 JS 없는 HTML을 만든다', () => {
    const { html, document } = renderMagazine(createInput(1));
    const container = document.querySelector<HTMLElement>('.container');

    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(document.documentElement.lang).toBe('ko');
    expect(container?.style.maxWidth).toBe('680px');
    expect(document.querySelector('script')).toBeNull();
    expect(html).toContain('@media only screen and (max-width: 600px)');
    expect(html).not.toContain('{{title}}');
    expect(html).not.toContain('{{content}}');
  });

  test('필수 template marker가 없으면 거부한다', () => {
    expect(() =>
      renderSmartStoreHtml(createMarkdown(createInput(1)), '<html></html>'),
    ).toThrow('{{title}}과 {{content}} marker가 필요합니다.');
  });
});
