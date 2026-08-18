import type { PromptProvider } from '@llm-newsletter-kit/core';

import type { SmartStoreInput } from './smartstore-input';

const FORBIDDEN_FACTS = [
  '할인',
  '쿠폰',
  '배송비',
  '무료배송',
  '재고',
  '판매량',
  '리뷰 수',
  '효능',
  '인증',
  '원산지',
  '소재',
  '크기',
  '성능',
  '비교 우위',
  '1위',
  '최저가',
  '베스트셀러',
];

export function createSmartStorePromptProvider(
  input: SmartStoreInput,
): PromptProvider {
  return {
    contentGenerate: {
      generateNewsletter: {
        system: () => `당신은 스마트스토어 상품 큐레이션 뉴스레터 편집자입니다.

목표는 상품 광고 문구를 나열하는 것이 아니라 타깃 고객이 제공된 상품 정보를 편하게 이해하도록 돕는 것입니다.

반드시 지킬 규칙:
1. 제공된 입력 데이터만 사용하고 추측, 보완, 상식에 의한 확장을 하지 마십시오.
2. 상품명, 가격, URL은 한 글자도 바꾸지 말고 각 상품 소개에 그대로 포함하십시오.
3. 가격은 계산 대상이 아닌 원문 문자열입니다. 통화 단위나 기호를 추가하거나 제거하지 마십시오. 예를 들어 입력 가격이 "24900"이면 반드시 "24900"으로 쓰고 "24900원"으로 바꾸지 마십시오.
4. 상품 특징과 추천 이유도 요약하거나 재작성하지 말고 원문 그대로 포함하십시오.
5. 상품별 섹션에는 상품명, 가격, 특징, 추천 이유, 상품 URL 외의 별도 설명 문장을 추가하지 마십시오.
6. 입력에 없는 다음 정보는 언급하지 마십시오: ${FORBIDDEN_FACTS.join(', ')}.
7. 자연스러운 한국어로 작성하고 번역체, 과장 표현, 비교 우위 표현을 피하십시오.
8. 동일한 CTA를 반복하지 말고 마지막에 자연스러운 CTA를 한 번만 작성하십시오.
9. Markdown으로 작성하되 표는 사용하지 마십시오.
10. 제목은 한국어 20자 이상 70자 이하로 작성하십시오.
11. 본문은 짧은 인트로, 상품별 소개, 특징, 추천 이유, 정확한 상품 URL, 마지막 CTA 순서로 구성하십시오.
12. 구조화 응답의 언어·저작권·사실성 검증값은 위 규칙을 실제로 모두 지킨 경우에만 true로 반환하십시오.`,
        user: (context) => {
          const products = context.targetArticles
            .map(
              (article, index) => `### 상품 ${index + 1}
상품명: ${article.title}
${article.detailContent}
상품 URL: ${article.url}`,
            )
            .join('\n\n');

          return `다음 정보만 사용하여 한국어 스마트스토어 상품 큐레이션 뉴스레터를 작성하십시오.

스토어명: ${input.storeName}
카테고리: ${input.category}
타깃 고객: ${input.targetCustomer}
뉴스레터 주제: ${input.newsletterTopic}
원하는 문체: ${input.tone}

${products}

작성 확인사항:
- 뉴스레터 주제와 타깃 고객을 인트로와 추천 맥락에 반영하십시오.
- 입력된 문체를 따르십시오.
- ${context.targetArticles.length}개 상품을 빠짐없이 소개하십시오.
- 각 상품 섹션은 다음 필드만 사용하십시오: 상품명, 가격, 특징, 추천 이유, 상품 URL.
- 각 필드의 값은 위 원문을 그대로 복사하고, 상품별 별도 요약 문장을 만들지 마십시오.
- 입력에 없는 판매 조건이나 제품 정보를 만들지 마십시오.`;
        },
      },
    },
  };
}

export function findNewsletterFactViolations(
  input: SmartStoreInput,
  newsletter: { title: string; content: string },
): string[] {
  const output = `${newsletter.title}\n${newsletter.content}`;
  const inputText = JSON.stringify(input);
  const violations: string[] = [];

  const containsStandaloneValue = (value: string): boolean => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `(?<![\\p{L}\\p{N},.])${escaped}(?![\\p{L}\\p{N},.])`,
      'u',
    ).test(output);
  };

  for (const product of input.products) {
    for (const [label, value] of [
      ['상품명', product.name],
      ['가격', product.price],
      ['URL', product.url],
    ] as const) {
      if (!containsStandaloneValue(value)) {
        violations.push(`${label} 원문 누락: ${value}`);
      }
    }

    for (const feature of product.features) {
      if (!output.includes(feature)) {
        violations.push(`상품 특징 원문 누락: ${feature}`);
      }
    }

    if (!output.includes(product.recommendationReason)) {
      violations.push(`추천 이유 원문 누락: ${product.recommendationReason}`);
    }
  }

  for (const term of FORBIDDEN_FACTS) {
    if (!inputText.includes(term) && output.includes(term)) {
      violations.push(`입력에 없는 금지 정보 언급: ${term}`);
    }
  }

  return violations;
}
