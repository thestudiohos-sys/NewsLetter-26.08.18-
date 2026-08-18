import type { SmartStoreInput } from "./smartstore-input";

import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

import {
  parseNewsletterMarkdown,
  renderSmartStoreHtml,
} from "./smartstore-html";

const products = [
  {
    name: "접이식 실리콘 보관용기 세트",
    price: "29,900원",
    url: "https://smartstore.naver.com/example/products/100000001",
  },
  {
    name: "무선 미니 테이블 조명",
    price: "24900",
    url: "https://smartstore.naver.com/example/products/100000002",
  },
  {
    name: "다용도 케이블 정리 클립",
    price: "9,900원",
    url: "https://smartstore.naver.com/example/products/100000003",
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
  .join("\n\n")}`;

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

const magazineTemplate = readFileSync(
  new URL("./data-examples/smartstore-template.example.html", import.meta.url),
  "utf-8",
);

function createMagazineInput(productCount: number): SmartStoreInput {
  return {
    storeName: "My All Korea",
    heroImage: "playground/assets/brand/host-main.jpg",
    category: "생활·잡화",
    targetCustomer: "실용적인 상품을 찾는 고객",
    newsletterTopic: "신상품 출시",
    tone: "상냥한 쇼핑 호스트 말투",
    products: Array.from({ length: productCount }, (_, index) => ({
      name: `긴 상품명 테스트 ${index + 1} ${"가".repeat(index * 20)}`,
      price: `${index + 1}9,900 원`,
      features: [`원문 특징 ${index + 1}-1`, `원문 특징 ${index + 1}-2`],
      recommendationReason: `원문 추천 이유 ${index + 1} ${"설명".repeat(index * 25)}`,
      mainImage:
        index === 1
          ? undefined
          : `playground/assets/products/item-${index + 1}.jpg`,
      secondaryImage:
        index === 0 ? "playground/assets/products/item-1-sub.jpg" : undefined,
      url: `https://smartstore.naver.com/example/products/${index + 1}`,
    })),
  };
}

function createMagazineMarkdown(input: SmartStoreInput): string {
  const productsMarkdown = input.products
    .map(
      (product) =>
        `### ${product.name}\n**가격:** ${product.price}\n**특징:**\n${product.features.map((feature) => `- ${feature}`).join("\n")}\n**추천 이유:** ${product.recommendationReason}\n**상품 URL:** ${product.url}`,
    )
    .join("\n\n");

  return `---\ntitle: "실용적인 일상을 위한 이번 주 신상품 큐레이션"\n---\n\n이번 주 일상에 필요한 신상품을 차분하게 소개합니다.\n\n***\n\n${productsMarkdown}\n\n***\n\n각 상품의 실제 URL에서 자세한 내용을 확인해 보세요.\n`;
}

describe("smartstore HTML renderer", () => {
  test("newsletter Markdown의 제목과 본문을 분리한다", () => {
    expect(parseNewsletterMarkdown(markdown)).toMatchObject({
      title: "테스트 스마트스토어 뉴스레터",
    });
  });

  test("상품명, 가격, URL을 보존하고 URL을 링크로 만든다", () => {
    const html = renderSmartStoreHtml(markdown, template);
    const document = new JSDOM(html).window.document;
    const text = document.body.textContent ?? "";
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")]
      .map((anchor) => anchor.href)
      .filter((href) => href.startsWith("https://smartstore.naver.com/"));

    for (const product of products) {
      expect(text).toContain(product.name);
      expect(text).toContain(product.price);
      expect(hrefs).toContain(product.url);
    }
  });

  test("유효한 문서 구조를 만들고 CSS를 inline 처리한다", () => {
    const html = renderSmartStoreHtml(markdown, template);
    const document = new JSDOM(html).window.document;
    const container = document.querySelector<HTMLElement>(".container");

    expect(html.toLowerCase()).toContain("<!doctype html>");
    expect(document.documentElement.lang).toBe("ko");
    expect(document.title).toBe("테스트 스마트스토어 뉴스레터");
    expect(container?.style.maxWidth).toBe("680px");
    expect(container?.style.padding).toBe("24px");
    expect(document.querySelector("script")).toBeNull();
    expect(html).not.toContain("{{title}}");
    expect(html).not.toContain("{{content}}");
  });

  test("필수 template marker가 없으면 거부한다", () => {
    expect(() => renderSmartStoreHtml(markdown, "<html></html>")).toThrow(
      "{{title}}과 {{content}} marker가 필요합니다.",
    );
  });

  test.each([1, 3, 5])(
    "상품 %i개를 수작업 없이 magazine section으로 렌더링한다",
    (productCount) => {
      const input = createMagazineInput(productCount);
      const html = renderSmartStoreHtml(
        createMagazineMarkdown(input),
        magazineTemplate,
        input,
      );
      const document = new JSDOM(html).window.document;

      expect(document.querySelectorAll("[data-product-index]")).toHaveLength(
        productCount,
      );
      for (const product of input.products) {
        const text = document.body.textContent ?? "";
        expect(text).toContain(product.name);
        expect(text).toContain(product.price);
        expect(text).toContain(product.recommendationReason);
        for (const feature of product.features) expect(text).toContain(feature);
        expect(
          document.querySelector(`a[href="${product.url}"]`),
        ).not.toBeNull();
      }
    },
  );

  test("Hero와 상품 이미지를 alt text 및 상품 링크와 함께 렌더링한다", () => {
    const input = createMagazineInput(3);
    const html = renderSmartStoreHtml(
      createMagazineMarkdown(input),
      magazineTemplate,
      input,
    );
    const document = new JSDOM(html).window.document;
    const firstProduct = input.products[0]!;
    const mainImage = document.querySelector<HTMLImageElement>(
      `img[alt="${firstProduct.name}"]`,
    );

    expect(document.querySelector(".hero-image")).not.toBeNull();
    expect(mainImage?.getAttribute("src")).toContain("../assets/products/");
    expect(mainImage?.closest("a")?.getAttribute("href")).toBe(
      firstProduct.url,
    );
    expect(document.querySelector(".secondary-image")).not.toBeNull();
  });

  test("이미지가 없는 상품과 Hero를 텍스트 fallback으로 렌더링한다", () => {
    const input = createMagazineInput(1);
    delete input.heroImage;
    delete input.products[0]!.mainImage;
    delete input.products[0]!.secondaryImage;
    const html = renderSmartStoreHtml(
      createMagazineMarkdown(input),
      magazineTemplate,
      input,
    );
    const document = new JSDOM(html).window.document;

    expect(document.querySelector(".hero-image-fallback")).not.toBeNull();
    expect(document.querySelector(".product-image-fallback")).not.toBeNull();
    expect(document.querySelector(".product-image")).toBeNull();
  });

  test("secondaryImage가 없는 상품도 정상 렌더링한다", () => {
    const input = createMagazineInput(1);
    delete input.products[0]!.secondaryImage;
    const html = renderSmartStoreHtml(
      createMagazineMarkdown(input),
      magazineTemplate,
      input,
    );
    const document = new JSDOM(html).window.document;

    expect(document.querySelector(".product-image")).not.toBeNull();
    expect(document.querySelector(".secondary-image")).toBeNull();
  });

  test("모바일 규칙, magazine 섹션, 외부 JS 없는 문서를 유지한다", () => {
    const input = createMagazineInput(3);
    const html = renderSmartStoreHtml(
      createMagazineMarkdown(input),
      magazineTemplate,
      input,
    );
    const document = new JSDOM(html).window.document;

    expect(html).toContain("@media only screen and (max-width: 600px)");
    expect(document.querySelector(".hero")).not.toBeNull();
    expect(document.querySelector(".store-story")).not.toBeNull();
    expect(document.querySelector(".bottom-cta")).not.toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(html).not.toContain("{{title}}");
    expect(html).not.toContain("{{content}}");
  });
});
