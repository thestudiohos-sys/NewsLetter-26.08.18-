import type { SmartStoreInput } from './smartstore-input';

import { z } from 'zod';

const FORBIDDEN_FACTS = [
  '할인',
  '쿠폰',
  '배송비',
  '무료배송',
  '재고',
  '판매량',
  '리뷰',
  '효능',
  '인증',
  '원산지',
  '소재',
  '성능',
  '비교 우위',
  '1위',
  '최저가',
  '베스트셀러',
] as const;

const UNSUPPORTED_CTA_PATHS = [
  { label: '프로필 링크', pattern: /프로필(?:의)?\s*링크/u },
  { label: '바이오 링크', pattern: /바이오(?:의)?\s*링크/u },
  { label: 'DM', pattern: /(?<![\p{L}\p{N}])(?:DM|디엠)(?![\p{L}\p{N}])/iu },
  {
    label: '댓글 링크',
    pattern: /(?:고정\s*)?댓글(?:에|의)?\s*(?:있는\s*)?(?:링크|주소)/u,
  },
  { label: '간접 구매 경로', pattern: /(?:구매|주문|스토어)\s*(?:링크|경로)/u },
] as const;

const UNSUPPORTED_RESULT_CLAIMS = [
  { label: '고민 끝', pattern: /고민(?:은|이)?\s*끝/u },
  { label: '고민 해결', pattern: /고민(?:을)?\s*해결/u },
  { label: '완벽 해결', pattern: /완벽(?:하게)?\s*해결/u },
  { label: '확실하게 해결', pattern: /확실하게\s*해결/u },
  { label: '공간 확보', pattern: /공간(?:을)?\s*확보/u },
  { label: '한 번에 정리', pattern: /한\s*번에\s*정리/u },
  { label: '삶의 질 향상', pattern: /삶의\s*질(?:을)?\s*(?:향상|높)/u },
  {
    label: '생활의 질 향상',
    pattern: /생활의\s*질(?:을)?\s*(?:향상|높)/u,
  },
  { label: '무조건', pattern: /무조건/u },
  { label: '필수템', pattern: /필수템/u },
  { label: '최고의', pattern: /최고의/u },
  { label: '완벽한', pattern: /완벽한/u },
] as const;

const editorialText = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum, `${label}은(는) ${minimum}자 이상이어야 합니다.`)
    .max(maximum, `${label}은(는) ${maximum}자를 초과할 수 없습니다.`);

export const newsletterEditorialSchema = z.strictObject({
  title: editorialText('뉴스레터 제목', 20, 70),
  intro: editorialText('뉴스레터 인트로', 20, 500),
  cta: editorialText('뉴스레터 CTA', 5, 200),
});

export type NewsletterEditorial = z.infer<typeof newsletterEditorialSchema>;

export function createNewsletterEditorialPrompts(input: SmartStoreInput): {
  system: string;
  prompt: string;
} {
  const productNames = input.products
    .map(({ name }, index) => `${index + 1}. ${name}`)
    .join('\n');

  return {
    system: `당신은 한국어 상품 큐레이션 뉴스레터 편집자입니다.

프로그램이 상품명, 가격, 특징, 추천 이유, URL을 원문 그대로 별도 렌더링합니다. 당신은 상품 사실을 작성하지 말고 뉴스레터의 편집 문맥만 생성하십시오.

규칙:
1. title, intro, cta 세 필드만 생성하십시오.
2. title은 20~70자의 자연스러운 한국어 제목으로 작성하십시오.
3. intro는 타깃 고객과 주제를 연결하는 짧은 도입부로 작성하되 상품의 가격, 특징, 효능, 판매 조건을 설명하지 마십시오.
4. cta는 독자가 아래에 이미 표시된 실제 상품 URL을 필요에 따라 살펴보도록 안내하는 짧은 문장으로 작성하십시오.
5. 프로필 링크, 바이오 링크, DM, 댓글 링크 등 입력에 없는 이동 경로를 만들지 마십시오.
6. 할인, 쿠폰, 배송, 재고, 리뷰, 판매량, 효능, 인증, 원산지, 소재, 성능, 비교 우위, 1위, 최저가, 베스트셀러를 생성하지 마십시오.
7. 고민 해결, 고민 끝, 공간 확보, 한 번에 정리, 완벽 해결, 삶의 질 향상처럼 결과를 보장하는 표현을 사용하지 마십시오.
8. 자연스럽고 신뢰감 있는 한국어를 사용하고 과장, 해시태그, 이모지를 피하십시오.
9. 상품별 사실이나 상품 섹션을 작성하지 마십시오.`,
    prompt: `다음 편집 정보와 상품명만 참고하여 뉴스레터의 제목, 인트로, 마지막 CTA를 생성하십시오.

스토어명: ${input.storeName}
카테고리: ${input.category}
타깃 고객: ${input.targetCustomer}
뉴스레터 주제: ${input.newsletterTopic}
원하는 문체: ${input.tone}

상품명:
${productNames}

가격, 특징, 추천 이유, URL은 프로그램이 원문 그대로 삽입하므로 생성하거나 추측하지 마십시오.`,
  };
}

export function findNewsletterEditorialViolations(
  input: SmartStoreInput,
  editorial: NewsletterEditorial,
): string[] {
  const output = `${editorial.title}\n${editorial.intro}\n${editorial.cta}`;
  const inputText = JSON.stringify(input);
  const violations: string[] = [];

  for (const term of FORBIDDEN_FACTS) {
    if (!inputText.includes(term) && output.includes(term)) {
      violations.push(`입력에 없는 금지 정보 언급: ${term}`);
    }
  }

  for (const { label, pattern } of UNSUPPORTED_CTA_PATHS) {
    if (pattern.test(output)) {
      violations.push(`입력에 없는 CTA 경로: ${label}`);
    }
  }

  for (const { label, pattern } of UNSUPPORTED_RESULT_CLAIMS) {
    if (pattern.test(output)) {
      violations.push(`근거 없는 결과 보장 표현: ${label}`);
    }
  }

  if (/https?:\/\//u.test(output)) {
    violations.push('LLM 편집 영역에 URL이 포함됨');
  }

  for (const product of input.products) {
    for (const fact of [
      product.price,
      ...product.features,
      product.recommendationReason,
    ]) {
      if (output.includes(fact)) {
        violations.push(`LLM 편집 영역에 상품 사실이 포함됨: ${fact}`);
      }
    }
  }

  return [...new Set(violations)];
}

export function renderSmartStoreNewsletterMarkdown(
  input: SmartStoreInput,
  editorial: NewsletterEditorial,
): string {
  const productSections = input.products
    .map(
      (product) => `### ${product.name}
**가격:** ${product.price}
**특징:**
${product.features.map((feature) => `- ${feature}`).join('\n')}
**추천 이유:** ${product.recommendationReason}
**상품 URL:** ${product.url}`,
    )
    .join('\n\n');

  return `---
title: ${JSON.stringify(editorial.title)}
---

${editorial.intro}

***

${productSections}

***

${editorial.cta}
`;
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
