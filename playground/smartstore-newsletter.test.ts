import type { SmartStoreInput } from './smartstore-input';

import { toNewsletterArticles } from './smartstore-adapter';
import {
  createNewsletterEditorialPrompts,
  findNewsletterEditorialViolations,
  findNewsletterFactViolations,
  newsletterEditorialSchema,
  renderSmartStoreNewsletterMarkdown,
} from './smartstore-prompts';

const input: SmartStoreInput = {
  storeName: 'House of Sea',
  category: '생활용품',
  targetCustomer: '실용적인 상품을 찾는 고객',
  newsletterTopic: '이번 주 추천 상품',
  tone: '친근하고 신뢰감 있게',
  products: [
    {
      name: '가상 상품',
      price: '19,900원',
      features: ['원문 특징 A', '원문 특징 B'],
      recommendationReason: '원문 추천 이유',
      url: 'https://smartstore.naver.com/example/products/1',
    },
  ],
};

const editorial = {
  title: '일상을 편리하게 살펴보는 이번 주 생활용품 큐레이션',
  intro:
    '실용적인 생활용품을 찾는 분들을 위해 이번 주 상품 구성을 차분하게 소개합니다.',
  cta: '각 상품의 입력된 URL에서 필요한 정보를 직접 확인해 보세요.',
};

describe('smartstore deterministic newsletter', () => {
  test('기존 상품 어댑터가 상품 사실을 변경하지 않는다', () => {
    const [article] = toNewsletterArticles(input);

    expect(article).toMatchObject({
      title: input.products[0]!.name,
      url: input.products[0]!.url,
      contentType: input.category,
    });
    expect(article!.detailContent).toContain(input.products[0]!.price);
    expect(article!.detailContent).toContain(input.products[0]!.features[0]!);
    expect(article!.detailContent).toContain(
      input.products[0]!.recommendationReason,
    );
  });

  test('LLM Prompt에는 편집 맥락과 상품명만 전달한다', () => {
    const prompts = createNewsletterEditorialPrompts(input);
    const fullPrompt = `${prompts.system}\n${prompts.prompt}`;

    for (const value of [
      input.storeName,
      input.category,
      input.targetCustomer,
      input.newsletterTopic,
      input.tone,
      input.products[0]!.name,
    ]) {
      expect(fullPrompt).toContain(value);
    }

    for (const fact of [
      input.products[0]!.price,
      ...input.products[0]!.features,
      input.products[0]!.recommendationReason,
      input.products[0]!.url,
    ]) {
      expect(fullPrompt).not.toContain(fact);
    }
  });

  test('편집 출력 스키마는 제목, 인트로, CTA만 허용한다', () => {
    expect(newsletterEditorialSchema.parse(editorial)).toEqual(editorial);
    expect(
      newsletterEditorialSchema.safeParse({
        ...editorial,
        content: '상품 사실을 다시 작성한 본문',
      }).success,
    ).toBe(false);
    expect(
      newsletterEditorialSchema.safeParse({ ...editorial, intro: '' }).success,
    ).toBe(false);
  });

  test('상품 사실을 deterministic Markdown에 원문 그대로 삽입한다', () => {
    const markdown = renderSmartStoreNewsletterMarkdown(input, editorial);
    const product = input.products[0]!;

    expect(markdown).toContain(`title: ${JSON.stringify(editorial.title)}`);
    expect(markdown).toContain(editorial.intro);
    expect(markdown).toContain(editorial.cta);
    expect(markdown).toContain(`### ${product.name}`);
    expect(markdown).toContain(`**가격:** ${product.price}`);
    for (const feature of product.features) {
      expect(markdown).toContain(`- ${feature}`);
    }
    expect(markdown).toContain(
      `**추천 이유:** ${product.recommendationReason}`,
    );
    expect(markdown).toContain(`**상품 URL:** ${product.url}`);
    expect(
      findNewsletterFactViolations(input, {
        title: editorial.title,
        content: markdown,
      }),
    ).toEqual([]);
  });

  test('LLM 편집 영역의 상품 사실, 금지 정보, 외부 CTA를 차단한다', () => {
    const product = input.products[0]!;

    expect(
      findNewsletterEditorialViolations(input, {
        ...editorial,
        intro: `무료배송 상품이며 가격은 ${product.price}입니다.`,
        cta: '프로필 링크에서 확인해 보세요.',
      }),
    ).toEqual(
      expect.arrayContaining([
        '입력에 없는 금지 정보 언급: 무료배송',
        '입력에 없는 CTA 경로: 프로필 링크',
        `LLM 편집 영역에 상품 사실이 포함됨: ${product.price}`,
      ]),
    );
  });

  test('결과 보장 표현을 차단하고 사실 기반 활용 표현은 허용한다', () => {
    expect(
      findNewsletterEditorialViolations(input, {
        ...editorial,
        intro: '수납공간 고민 해결과 공간 확보를 위한 상품을 소개합니다.',
      }),
    ).toEqual(
      expect.arrayContaining([
        '근거 없는 결과 보장 표현: 고민 해결',
        '근거 없는 결과 보장 표현: 공간 확보',
      ]),
    );

    expect(
      findNewsletterEditorialViolations(input, {
        ...editorial,
        intro:
          '일상에서 필요에 따라 활용할 수 있는 생활용품 구성을 소개합니다.',
      }),
    ).toEqual([]);
  });

  test('가격 원문에 통화 단위를 덧붙인 조립 결과를 거부한다', () => {
    const numericPriceInput: SmartStoreInput = {
      ...input,
      products: [{ ...input.products[0]!, price: '19900' }],
    };
    const markdown = renderSmartStoreNewsletterMarkdown(
      numericPriceInput,
      editorial,
    ).replace('**가격:** 19900', '**가격:** 19900원');

    expect(
      findNewsletterFactViolations(numericPriceInput, {
        title: editorial.title,
        content: markdown,
      }),
    ).toContain('가격 원문 누락: 19900');
  });
});
