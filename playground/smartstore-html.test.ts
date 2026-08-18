import { JSDOM } from 'jsdom';

import {
  parseNewsletterMarkdown,
  renderSmartStoreHtml,
} from './smartstore-html';

const products = [
  {
    name: '접이식 실리콘 보관용기 세트',
    price: '29,900원',
    url: 'https://smartstore.naver.com/example/products/100000001',
  },
  {
    name: '무선 미니 테이블 조명',
    price: '24900',
    url: 'https://smartstore.naver.com/example/products/100000002',
  },
  {
    name: '다용도 케이블 정리 클립',
    price: '9,900원',
    url: 'https://smartstore.naver.com/example/products/100000003',
  },
];

const markdown = `---
title: "테스트 스마트스토어 뉴스레터"
---

안녕하세요. House of Sea입니다.

${products
  .map(
    (product) => `### ${product.name}
**가격:** ${product.price}
**상품 URL:** ${product.url}`,
  )
  .join('\n\n')}`;

const template = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>{{title}}</title>
    <style>
      body { background: #f4f4f4; color: #222; }
      .container { max-width: 680px; margin: 0 auto; padding: 24px; }
      a { color: #235b73; }
    </style>
  </head>
  <body>
    <main class="container">
      <h1>{{title}}</h1>
      {{content}}
    </main>
  </body>
</html>`;

describe('smartstore HTML renderer', () => {
  test('newsletter Markdown의 제목과 본문을 분리한다', () => {
    expect(parseNewsletterMarkdown(markdown)).toMatchObject({
      title: '테스트 스마트스토어 뉴스레터',
    });
  });

  test('상품명, 가격, URL을 보존하고 URL을 링크로 만든다', () => {
    const html = renderSmartStoreHtml(markdown, template);
    const document = new JSDOM(html).window.document;
    const text = document.body.textContent ?? '';
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((anchor) => anchor.href)
      .filter((href) => href.startsWith('https://smartstore.naver.com/'));

    for (const product of products) {
      expect(text).toContain(product.name);
      expect(text).toContain(product.price);
      expect(hrefs).toContain(product.url);
    }
  });

  test('유효한 문서 구조를 만들고 CSS를 inline 처리한다', () => {
    const html = renderSmartStoreHtml(markdown, template);
    const document = new JSDOM(html).window.document;
    const container = document.querySelector<HTMLElement>('.container');

    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(document.documentElement.lang).toBe('ko');
    expect(document.title).toBe('테스트 스마트스토어 뉴스레터');
    expect(container?.style.maxWidth).toBe('680px');
    expect(container?.style.padding).toBe('24px');
    expect(document.querySelector('script')).toBeNull();
    expect(html).not.toContain('{{title}}');
    expect(html).not.toContain('{{content}}');
  });

  test('필수 template marker가 없으면 거부한다', () => {
    expect(() => renderSmartStoreHtml(markdown, '<html></html>')).toThrow(
      '{{title}}과 {{content}} marker가 필요합니다.',
    );
  });
});
