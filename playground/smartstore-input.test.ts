import { z } from 'zod';

import {
  formatSmartStoreValidationError,
  parseSmartStoreInput,
  smartStoreInputSchema,
} from './smartstore-input';

function createProduct(index: number) {
  return {
    name: `가상 테스트 상품 ${index}`,
    price: `${index}9,900원`,
    features: [`가상 특징 ${index}`],
    recommendationReason: `가상 추천 이유 ${index}`,
    url: `https://smartstore.naver.com/example/products/${index}`,
  };
}

function createInput(productCount: number) {
  return {
    storeName: 'House of Sea',
    category: '생활용품',
    targetCustomer: '실용적인 생활용품을 찾는 고객',
    newsletterTopic: '이번 주 추천 상품',
    tone: '친근하고 신뢰감 있는 문체',
    products: Array.from({ length: productCount }, (_, index) =>
      createProduct(index + 1),
    ),
  };
}

describe('smartStoreInputSchema', () => {
  test.each([1, 3, 5])('상품 %i개 정상 데이터를 보존한다', (count) => {
    const input = createInput(count);

    expect(parseSmartStoreInput(input)).toEqual(input);
  });

  test('상품 0개를 거부한다', () => {
    const result = smartStoreInputSchema.safeParse(createInput(0));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        '상품은 최소 1개 입력해야 합니다.',
      );
    }
  });

  test('상품 6개를 거부한다', () => {
    const result = smartStoreInputSchema.safeParse(createInput(6));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        '상품은 최대 5개까지만 입력할 수 있습니다.',
      );
    }
  });

  test('필수값 누락 오류를 이해하기 쉽게 표시한다', () => {
    const { storeName: _storeName, ...missingStoreName } = createInput(1);
    const result = smartStoreInputSchema.safeParse(missingStoreName);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatSmartStoreValidationError(result.error)).toContain(
        '- storeName: 스토어명은(는) 문자열로 입력해야 합니다.',
      );
    }
  });

  test('잘못된 URL을 거부한다', () => {
    const input = createInput(1);
    input.products[0]!.url = 'not-a-url';

    expect(() => parseSmartStoreInput(input)).toThrow(z.ZodError);
    const result = smartStoreInputSchema.safeParse(input);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        '상품 URL은 올바른 URL 형식이어야 합니다.',
      );
    }
  });
});
