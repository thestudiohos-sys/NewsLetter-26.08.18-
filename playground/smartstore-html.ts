import type { SmartStoreInput } from './smartstore-input';

import { JSDOM } from 'jsdom';
import juice from 'juice';
import safeMarkdown2Html from 'safe-markdown2html';

import { ensureHrBeforeH2 } from '~/utils/string';

import { findNewsletterFactViolations } from './smartstore-prompts';

export type ParsedNewsletterMarkdown = {
  title: string;
  content: string;
};

type NewsletterEditorial = {
  title: string;
  intro: string;
  cta: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPlainText(value: string): string {
  return escapeHtml(value).replaceAll(/\r?\n/gu, '<br />');
}

function toHtmlImageSource(imageSource: string): string {
  const normalized = imageSource.replaceAll('\\', '/');
  if (normalized.startsWith('playground/assets/')) {
    return `../assets/${normalized.slice('playground/assets/'.length)}`;
  }
  return normalized;
}

export function parseNewsletterMarkdown(
  markdown: string,
): ParsedNewsletterMarkdown {
  const frontmatter = markdown.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/,
  );

  if (!frontmatter) {
    throw new Error('newsletter.md에서 제목 frontmatter를 찾을 수 없습니다.');
  }

  const titleLine = frontmatter[1]!.match(/^title:\s*(.+)$/m);
  if (!titleLine) {
    throw new Error('newsletter.md frontmatter에 title이 없습니다.');
  }

  const rawTitle = titleLine[1]!.trim();
  let title = rawTitle;
  if (rawTitle.startsWith('"') && rawTitle.endsWith('"')) {
    try {
      title = JSON.parse(rawTitle) as string;
    } catch {
      throw new Error('newsletter.md의 title 문자열 형식이 올바르지 않습니다.');
    }
  }

  if (!title.trim()) {
    throw new Error('newsletter.md의 title이 비어 있습니다.');
  }

  return { title, content: frontmatter[2]! };
}

function parseNewsletterEditorial(
  parsed: ParsedNewsletterMarkdown,
): NewsletterEditorial {
  const sections = parsed.content
    .trim()
    .split(/\r?\n\*\*\*\r?\n/u)
    .map((section) => section.trim());

  if (sections.length !== 3 || !sections[0] || !sections[2]) {
    throw new Error(
      '매거진 렌더링에 필요한 newsletter.md 구조를 찾을 수 없습니다. 인트로, 상품 사실 영역, CTA가 *** 구분선으로 나뉘어야 합니다.',
    );
  }

  return { title: parsed.title, intro: sections[0], cta: sections[2] };
}

function assertNewsletterMatchesInput(
  parsed: ParsedNewsletterMarkdown,
  input: SmartStoreInput,
): void {
  const violations = findNewsletterFactViolations(input, parsed);
  if (violations.length > 0) {
    throw new Error(
      `newsletter.md와 smartstore.json의 사실 데이터가 일치하지 않습니다.\n${violations.map((violation) => `- ${violation}`).join('\n')}`,
    );
  }
}

function renderHeroImage(input: SmartStoreInput): string {
  if (!input.heroImage) {
    return `<div class="hero-image-fallback" role="img" aria-label="${escapeHtml(input.storeName)} Hero 이미지 없음"><span>CURATED<br />SELECTION</span></div>`;
  }

  return `<img class="hero-image" src="${escapeHtml(toHtmlImageSource(input.heroImage))}" alt="${escapeHtml(input.storeName)} Hero 이미지" width="260" />`;
}

function renderProductImages(
  product: SmartStoreInput['products'][number],
): string {
  if (!product.mainImage) {
    return `<div class="product-image-fallback" role="img" aria-label="${escapeHtml(product.name)} 이미지 없음"><span>PRODUCT<br />IMAGE</span></div>`;
  }

  const mainImage = `<td class="main-image-cell"><a class="product-image-link" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer"><img class="product-image" src="${escapeHtml(toHtmlImageSource(product.mainImage))}" alt="${escapeHtml(product.name)}" width="300" /></a></td>`;
  const secondaryImage = product.secondaryImage
    ? `<td class="secondary-image-cell" width="34%"><a class="secondary-image-link" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer"><img class="secondary-image" src="${escapeHtml(toHtmlImageSource(product.secondaryImage))}" alt="${escapeHtml(product.name)} 보조 이미지" width="112" /></a></td>`
    : '';

  return `<table class="product-images" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>${mainImage}${secondaryImage}</tr></table>`;
}

function renderProductCopy(
  product: SmartStoreInput['products'][number],
  index: number,
): string {
  return `<p class="product-number">${String(index + 1).padStart(2, '0')}</p>
    <p class="product-label">EDITOR'S PICK</p>
    <h3 class="product-name">${escapeHtml(product.name)}</h3>
    <p class="product-price">${escapeHtml(product.price)}</p>
    <ul class="product-features">${product.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')}</ul>
    <p class="recommendation-label">WHY WE PICKED IT</p>
    <p class="recommendation-reason">${escapeHtml(product.recommendationReason)}</p>
    <a class="view-item" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">VIEW ITEM <span aria-hidden="true">→</span></a>`;
}

function renderProductSection(
  product: SmartStoreInput['products'][number],
  index: number,
): string {
  const alternateClass = index % 2 === 1 ? ' product-section-alt' : '';
  return `<table class="product-section${alternateClass}" data-product-index="${index + 1}" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td class="product-column product-media" width="52%">${renderProductImages(product)}</td>
      <td class="product-column product-details" width="48%">${renderProductCopy(product, index)}</td>
    </tr>
  </table>`;
}

function renderStoreCta(
  input: SmartStoreInput,
  editorial: NewsletterEditorial,
): string {
  const storeAction = input.storeUrl
    ? `<a class="store-button" href="${escapeHtml(input.storeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(input.storeName)} 둘러보기</a>`
    : `<p class="store-link-fallback">각 상품의 상세 정보는 위 상품별 URL에서 확인할 수 있습니다.</p>`;

  return `<section class="bottom-cta">
    <p class="section-kicker">KEEP EXPLORING</p>
    <h2>MORE TO EXPLORE</h2>
    <p class="editorial-cta">${renderPlainText(editorial.cta)}</p>
    ${storeAction}
  </section>`;
}

function renderMagazineContent(
  input: SmartStoreInput,
  editorial: NewsletterEditorial,
): string {
  const products = input.products
    .map((product, index) => renderProductSection(product, index))
    .join('');
  const storeStory = `${input.storeName}는 ${input.category} 카테고리의 상품을 소개합니다. 이번 셀렉션은 ${input.targetCustomer}을 위한 구성입니다.`;

  return `<div class="magazine">
    <div class="topline">${escapeHtml(input.storeName)} · PRODUCT CURATION</div>
    <section class="hero">
      <table class="hero-layout" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td class="hero-copy" width="58%">
            <p class="hero-eyebrow">SHOP EDIT</p>
            <p class="hero-topic">${escapeHtml(input.newsletterTopic)}</p>
            <h1 class="hero-title">${escapeHtml(editorial.title)}</h1>
            <p class="hero-intro">${renderPlainText(editorial.intro)}</p>
            <p class="hero-store">${escapeHtml(input.storeName)}</p>
          </td>
          <td class="hero-visual" width="42%">${renderHeroImage(input)}</td>
        </tr>
      </table>
    </section>

    <section class="store-story">
      <p class="section-kicker">STORE STORY</p>
      <p class="store-story-copy">${escapeHtml(storeStory)}</p>
    </section>

    <section class="products-heading">
      <p class="section-kicker">FEATURED</p>
      <h2>EDITOR'S PICK</h2>
      <p>${escapeHtml(input.newsletterTopic)} · ${escapeHtml(input.category)}</p>
    </section>

    <div class="products">${products}</div>
    ${renderStoreCta(input, editorial)}
    <footer class="footer">${escapeHtml(input.storeName)} · PRODUCT CURATION NEWSLETTER</footer>
  </div>`;
}

function renderTextContent(content: string): string {
  return safeMarkdown2Html(ensureHrBeforeH2(content.trim()), {
    window: new JSDOM('').window,
    linkTargetBlank: true,
    fixMalformedUrls: true,
    fixBoldSyntax: true,
    convertStrikethrough: true,
  });
}

export function renderSmartStoreHtml(
  markdown: string,
  template: string,
  input?: SmartStoreInput,
): string {
  if (!template.includes('{{title}}') || !template.includes('{{content}}')) {
    throw new Error(
      'HTML 템플릿에는 {{title}}과 {{content}} marker가 필요합니다.',
    );
  }

  const parsed = parseNewsletterMarkdown(markdown);
  let contentHtml: string;
  if (input) {
    const editorial = parseNewsletterEditorial(parsed);
    assertNewsletterMatchesInput(parsed, input);
    contentHtml = renderMagazineContent(input, editorial);
  } else {
    contentHtml = renderTextContent(parsed.content);
  }

  const rendered = template
    .replaceAll('{{title}}', escapeHtml(parsed.title))
    .replaceAll('{{content}}', contentHtml);

  return juice(rendered);
}
