import type { SmartStoreInput } from "./smartstore-input";

import { JSDOM } from "jsdom";
import juice from "juice";
import safeMarkdown2Html from "safe-markdown2html";

import { ensureHrBeforeH2 } from "~/utils/string";

export type ParsedNewsletterMarkdown = {
  title: string;
  content: string;
};

type NewsletterEditorial = {
  title: string;
  intro: string;
  cta: string;
};

const STORE_URL = "https://smartstore.naver.com/myallkorea1";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toHtmlImageSource(imagePath: string): string {
  const normalized = imagePath.replaceAll("\\", "/");

  if (/^[A-Za-z]:\//u.test(normalized)) {
    return `file:///${normalized}`;
  }

  if (normalized.startsWith("playground/")) {
    return `../${normalized.slice("playground/".length)}`;
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
    throw new Error("newsletter.md에서 제목 frontmatter를 찾을 수 없습니다.");
  }

  const titleLine = frontmatter[1]!.match(/^title:\s*(.+)$/m);
  if (!titleLine) {
    throw new Error("newsletter.md frontmatter에 title이 없습니다.");
  }

  const rawTitle = titleLine[1]!.trim();
  let title = rawTitle;
  if (rawTitle.startsWith('"') && rawTitle.endsWith('"')) {
    try {
      title = JSON.parse(rawTitle) as string;
    } catch {
      throw new Error("newsletter.md의 title 문자열 형식이 올바르지 않습니다.");
    }
  }

  if (!title.trim()) {
    throw new Error("newsletter.md의 title이 비어 있습니다.");
  }

  return { title, content: frontmatter[2]! };
}

function parseNewsletterEditorial(
  parsed: ParsedNewsletterMarkdown,
): NewsletterEditorial | null {
  const sections = parsed.content
    .trim()
    .split(/\r?\n\*\*\*\r?\n/u)
    .map((section) => section.trim());

  if (sections.length < 3) return null;

  return {
    title: parsed.title,
    intro: sections[0]!,
    cta: sections.at(-1)!,
  };
}

function renderHeroImage(input: SmartStoreInput): string {
  if (!input.heroImage) {
    return `<div class="hero-image-fallback" role="img" aria-label="${escapeHtml(input.storeName)} 이미지 없음">
      <span>CURATED<br />FOR EVERYDAY</span>
    </div>`;
  }

  return `<img class="hero-image" src="${escapeHtml(toHtmlImageSource(input.heroImage))}" alt="${escapeHtml(input.storeName)} 쇼핑 큐레이터" width="270" />`;
}

function renderProductImages(
  product: SmartStoreInput["products"][number],
): string {
  if (!product.mainImage) {
    return `<div class="product-image-fallback" role="img" aria-label="${escapeHtml(product.name)} 이미지 없음">
      <span>IMAGE<br />COMING SOON</span>
    </div>`;
  }

  const mainImage = `<a class="product-image-link" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer"><img class="product-image" src="${escapeHtml(toHtmlImageSource(product.mainImage))}" alt="${escapeHtml(product.name)}" width="300" /></a>`;
  const secondaryImage = product.secondaryImage
    ? `<a class="secondary-image-link" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer"><img class="secondary-image" src="${escapeHtml(toHtmlImageSource(product.secondaryImage))}" alt="${escapeHtml(product.name)} 상세 이미지" width="124" /></a>`
    : "";

  return `<div class="product-image-stage">${mainImage}${secondaryImage}</div>`;
}

function renderProductCopy(
  product: SmartStoreInput["products"][number],
  index: number,
): string {
  return `<div class="product-copy">
    <p class="product-number">${String(index + 1).padStart(2, "0")}</p>
    <p class="product-label">NEW ARRIVAL</p>
    <h3 class="product-name">${escapeHtml(product.name)}</h3>
    <p class="product-price">${escapeHtml(product.price)}</p>
    <ul class="product-features">${product.features
      .map((feature) => `<li>${escapeHtml(feature)}</li>`)
      .join("")}</ul>
    <p class="recommendation-label">WHY WE PICKED IT</p>
    <p class="recommendation-reason">${escapeHtml(product.recommendationReason)}</p>
    <a class="view-item" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">VIEW ITEM <span aria-hidden="true">→</span></a>
  </div>`;
}

function renderProductSection(
  product: SmartStoreInput["products"][number],
  index: number,
): string {
  const mediaCell = `<td class="product-column product-media" width="52%">${renderProductImages(product)}</td>`;
  const copyCell = `<td class="product-column product-details" width="48%">${renderProductCopy(product, index)}</td>`;
  const cells =
    index % 2 === 0 ? `${mediaCell}${copyCell}` : `${copyCell}${mediaCell}`;

  return `<section class="product-section product-section-${index + 1}" data-product-index="${index + 1}">
    <table class="product-layout" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>${cells}</tr>
    </table>
  </section>`;
}

function renderMagazineContent(
  input: SmartStoreInput,
  editorial: NewsletterEditorial,
): string {
  const products = input.products
    .map((product, index) => renderProductSection(product, index))
    .join("");

  return `<div class="magazine">
    <section class="hero">
      <table class="hero-layout" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td class="hero-copy" width="58%">
            <p class="hero-eyebrow">MY ALL KOREA EDIT</p>
            <h1 class="hero-title">SHOPPING<br /><span>JOY</span></h1>
            <p class="hero-subtitle">일상에 바로 쓰이는<br />이번 주 신상품 셀렉션</p>
            <p class="hero-store">${escapeHtml(input.storeName)}</p>
          </td>
          <td class="hero-visual" width="42%">${renderHeroImage(input)}</td>
        </tr>
      </table>
    </section>

    <section class="store-story">
      <p class="section-kicker">STORE STORY</p>
      <p class="store-story-copy">마이 올 코리아는 생활에 바로 쓰이는 실용적인 아이템부터<br class="desktop-break" /> 일상의 작은 편리함을 더해주는 제품까지<br class="desktop-break" /> 가볍고 즐겁게 발견할 수 있도록 소개합니다.</p>
    </section>

    <section class="editor-note">
      <p class="section-kicker">EDITOR'S NOTE</p>
      <h2>${escapeHtml(editorial.title)}</h2>
      <p>${escapeHtml(editorial.intro)}</p>
    </section>

    <section class="products-heading">
      <p class="section-kicker">CURATED THIS WEEK</p>
      <h2>NEW ARRIVALS</h2>
      <p>이번 주 새롭게 만나보세요</p>
    </section>

    <div class="products">${products}</div>

    <section class="bottom-cta">
      <p class="section-kicker">KEEP EXPLORING</p>
      <h2>DISCOVER MORE</h2>
      <p class="bottom-copy">마이 올 코리아에서<br />더 많은 생활 아이템을 만나보세요.</p>
      <p class="editorial-cta">${escapeHtml(editorial.cta)}</p>
      <a class="store-button" href="${STORE_URL}" target="_blank" rel="noopener noreferrer">마이 올 코리아 스토어 둘러보기</a>
    </section>
  </div>`;
}

export function renderSmartStoreHtml(
  markdown: string,
  template: string,
  input?: SmartStoreInput,
): string {
  if (!template.includes("{{title}}") || !template.includes("{{content}}")) {
    throw new Error(
      "HTML 템플릿에는 {{title}}과 {{content}} marker가 필요합니다.",
    );
  }

  const parsed = parseNewsletterMarkdown(markdown);
  const editorial = parseNewsletterEditorial(parsed);
  const contentHtml =
    input && editorial
      ? renderMagazineContent(input, editorial)
      : safeMarkdown2Html(ensureHrBeforeH2(parsed.content.trim()), {
          window: new JSDOM("").window,
          linkTargetBlank: true,
          fixMalformedUrls: true,
          fixBoldSyntax: true,
          convertStrikethrough: true,
        });

  const rendered = template
    .replaceAll("{{title}}", escapeHtml(parsed.title))
    .replaceAll("{{content}}", contentHtml);

  return juice(rendered);
}
