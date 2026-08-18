import type { SmartStoreInput } from './smartstore-input';

import { toNewsletterArticles } from './smartstore-adapter';
import {
  createSmartStorePromptProvider,
  findNewsletterFactViolations,
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

describe('smartstore newsletter adapter and prompt', () => {
  test('상품 사실을 변경하지 않고 기사 모델로 변환한다', () => {
    const [article] = toNewsletterArticles(input);

    expect(article).toMatchObject({
      id: 'smartstore-product-1',
      title: input.products[0]!.name,
      url: input.products[0]!.url,
      targetUrl: input.products[0]!.url,
      contentType: input.category,
      importanceScore: 1,
      hasAttachedImage: false,
      imageContextByLlm: null,
      tag1: input.category,
      tag2: null,
      tag3: null,
    });
    expect(article!.detailContent).toContain(input.products[0]!.price);
    expect(article!.detailContent).toContain(input.products[0]!.features[0]!);
    expect(article!.detailContent).toContain(
      input.products[0]!.recommendationReason,
    );
  });

  test('PromptBuilder가 스토어 맥락과 변환된 상품 원문을 포함한다', () => {
    const articles = toNewsletterArticles(input);
    const builder =
      createSmartStorePromptProvider(input).contentGenerate!
        .generateNewsletter!;
    const context = {
      expertFields: [input.category],
      outputLanguage: '한국어',
      dateService: {
        getPublicationDisplayDateString: () => '2026. 8. 18.',
        getPublicationISODateString: () => '2026-08-18',
      },
      targetArticles: articles,
      newsletterBrandName: input.storeName,
    };
    const prompt = builder.user!(context);

    for (const value of [
      input.storeName,
      input.category,
      input.targetCustomer,
      input.newsletterTopic,
      input.tone,
      input.products[0]!.name,
      input.products[0]!.price,
      input.products[0]!.features[0]!,
      input.products[0]!.recommendationReason,
      input.products[0]!.url,
    ]) {
      expect(prompt).toContain(value);
    }
  });

  test('생성 결과의 원문 누락과 입력에 없는 정보를 찾는다', () => {
    const validNewsletter = {
      title: '가상 상품을 소개하는 충분히 긴 테스트 뉴스레터 제목',
      content: `가상 상품\n19,900원\n원문 특징 A\n원문 특징 B\n원문 추천 이유\nhttps://smartstore.naver.com/example/products/1`,
    };

    expect(findNewsletterFactViolations(input, validNewsletter)).toEqual([]);
    expect(
      findNewsletterFactViolations(input, {
        ...validNewsletter,
        content: `${validNewsletter.content}\n무료배송`,
      }),
    ).toContain('입력에 없는 금지 정보 언급: 무료배송');
  });

  test('가격 원문에 통화 단위를 덧붙인 결과를 거부한다', () => {
    const numericPriceInput: SmartStoreInput = {
      ...input,
      products: [{ ...input.products[0]!, price: '19900' }],
    };
    const newsletter = {
      title: '가상 상품을 소개하는 충분히 긴 테스트 뉴스레터 제목',
      content: `가상 상품\n19900원\n원문 특징 A\n원문 특징 B\n원문 추천 이유\nhttps://smartstore.naver.com/example/products/1`,
    };

    expect(
      findNewsletterFactViolations(numericPriceInput, newsletter),
    ).toContain('가격 원문 누락: 19900');
  });
});
