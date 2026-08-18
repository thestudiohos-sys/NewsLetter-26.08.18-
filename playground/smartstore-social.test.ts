import type { SmartStoreInput } from './smartstore-input';

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  createSmartStoreSocialPrompts,
  findSocialContentViolations,
  getXLengthWarning,
  socialContentSchema,
  writeSocialContentFiles,
} from './smartstore-social';

function createInput(productCount: number): SmartStoreInput {
  return {
    storeName: 'House of Sea',
    category: '생활용품',
    targetCustomer: '실용적인 상품을 찾는 고객',
    newsletterTopic: '일상을 편리하게 만드는 추천 상품',
    tone: '친근하고 신뢰감 있게',
    products: Array.from({ length: productCount }, (_, index) => ({
      name: `가상 테스트 상품 ${index + 1}`,
      price: `${index + 1}9,900원`,
      features: [`가상 특징 ${index + 1}`],
      recommendationReason: `가상 추천 이유 ${index + 1}`,
      url: `https://smartstore.naver.com/example/products/${index + 1}`,
    })),
  };
}

function createValidOutput(input: SmartStoreInput) {
  return {
    threads: `${input.products.map(({ name }) => name).join(', ')}을 일상에 맞게 살펴보세요.`,
    x: `${input.products[0]!.name}, 생활에 맞는 선택인지 확인해 보세요.`,
    hooks: input.products.map(({ name, features }) => ({
      productName: name,
      hook: `${features[0]}이 필요하신가요?`,
    })),
  };
}

describe('smartstore social content', () => {
  test.each([1, 3, 5])('상품 %i개의 Hook을 정확히 검증한다', (productCount) => {
    const input = createInput(productCount);
    const output = socialContentSchema.parse(createValidOutput(input));

    expect(output.hooks).toHaveLength(productCount);
    expect(output.hooks.map(({ productName }) => productName)).toEqual(
      input.products.map(({ name }) => name),
    );
    expect(findSocialContentViolations(input, output)).toEqual([]);
  });

  test('Prompt가 SNS 세 종류의 규칙과 입력 원문을 포함한다', () => {
    const input = createInput(3);
    const prompts = createSmartStoreSocialPrompts(input);
    const fullPrompt = `${prompts.system}\n${prompts.prompt}`;

    for (const value of [
      'Threads',
      'X',
      'hooks',
      input.storeName,
      input.targetCustomer,
      input.newsletterTopic,
      input.tone,
      input.products[0]!.name,
      input.products[0]!.price,
      input.products[0]!.features[0]!,
      input.products[0]!.recommendationReason,
      input.products[0]!.url,
    ]) {
      expect(fullPrompt).toContain(value);
    }
  });

  test('존재하지 않는 상품명과 Hook 개수 불일치를 차단한다', () => {
    const input = createInput(3);
    const output = socialContentSchema.parse(createValidOutput(input));
    output.hooks = [
      ...output.hooks.slice(0, 2),
      { productName: '존재하지 않는 상품', hook: '허위 Hook' },
    ];

    expect(findSocialContentViolations(input, output)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Hook 상품명 불일치'),
        '입력에 없는 Hook 상품: 존재하지 않는 상품',
      ]),
    );

    output.hooks.pop();
    expect(findSocialContentViolations(input, output)).toEqual(
      expect.arrayContaining([expect.stringContaining('Hook 개수 불일치')]),
    );
  });

  test('입력에 없는 금지 정보와 변경된 URL/가격을 차단한다', () => {
    const input = createInput(1);
    const output = createValidOutput(input);
    output.threads =
      '무료배송 필수템이며 99,900원입니다. https://smartstore.naver.com/example/products/999';
    const parsed = socialContentSchema.parse(output);

    expect(findSocialContentViolations(input, parsed)).toEqual(
      expect.arrayContaining([
        '입력에 없는 금지 정보 언급: 무료배송',
        '근거 없는 결과 보장 표현: 필수템',
        '입력과 일치하지 않는 가격 표현: 99,900원',
        '입력과 일치하지 않는 URL: https://smartstore.naver.com/example/products/999',
      ]),
    );
  });

  test.each([
    ['고민 끝', '수납공간 부족 고민 끝'],
    ['고민 해결', '수납공간 부족 고민 해결'],
    ['완벽 해결', '수납공간 문제 완벽 해결'],
  ])('%s 결과 보장 표현을 차단한다', (label, phrase) => {
    const input = createInput(1);
    const output = socialContentSchema.parse(createValidOutput(input));
    output.threads = phrase;

    expect(findSocialContentViolations(input, output)).toContain(
      `근거 없는 결과 보장 표현: ${label}`,
    );
  });

  test('입력 사실 기반의 가능성·활용 표현은 허용한다', () => {
    const input = createInput(1);
    input.products[0]!.features = [
      '접어서 보관할 수 있습니다.',
      '케이블 정리에 활용할 수 있습니다.',
    ];
    input.products[0]!.recommendationReason =
      '수납공간이 부족한 경우 활용하기 좋습니다.';
    const output = socialContentSchema.parse(createValidOutput(input));
    output.threads = input.products[0]!.recommendationReason;
    output.x = input.products[0]!.features[0]!;
    output.hooks[0]!.hook = input.products[0]!.features[1]!;

    expect(findSocialContentViolations(input, output)).toEqual([]);
  });

  test.each([
    ['프로필 링크', '제품 정보는 프로필 링크를 확인해주세요.'],
    ['바이오 링크', '자세한 내용은 바이오 링크에서 확인하세요.'],
  ])('입력에 없는 %s CTA를 차단한다', (label, phrase) => {
    const input = createInput(1);
    const output = socialContentSchema.parse(createValidOutput(input));
    output.x = phrase;

    expect(findSocialContentViolations(input, output)).toContain(
      `입력에 없는 CTA 경로: ${label}`,
    );
  });

  test('입력 상품의 실제 URL은 허용한다', () => {
    const input = createInput(1);
    const output = socialContentSchema.parse(createValidOutput(input));
    output.x = `상품 정보: ${input.products[0]!.url}`;

    expect(findSocialContentViolations(input, output)).toEqual([]);
  });

  test('빈 결과와 잘못된 구조화 출력을 Zod에서 차단한다', () => {
    expect(
      socialContentSchema.safeParse({ threads: '', x: '', hooks: [] }).success,
    ).toBe(false);
    expect(
      socialContentSchema.safeParse({
        threads: '본문',
        x: '짧은 본문',
        hooks: [{ productName: '상품명' }],
      }).success,
    ).toBe(false);
  });

  test('X가 280자를 넘으면 경고한다', () => {
    expect(getXLengthWarning('가'.repeat(280))).toBeNull();
    expect(getXLengthWarning('가'.repeat(281))).toContain('281자');
  });

  test('SNS 파일만 저장하고 기존 뉴스레터 파일은 변경하지 않는다', async () => {
    const outputDir = await mkdtemp(resolve(tmpdir(), 'hos-social-'));
    const newsletterMarkdown = resolve(outputDir, 'newsletter.md');
    const newsletterHtml = resolve(outputDir, 'newsletter.html');
    const originalMarkdown = '기존 Markdown';
    const originalHtml = '<p>기존 HTML</p>';

    try {
      await writeFile(newsletterMarkdown, originalMarkdown, 'utf-8');
      await writeFile(newsletterHtml, originalHtml, 'utf-8');
      const output = socialContentSchema.parse(
        createValidOutput(createInput(3)),
      );

      const files = await writeSocialContentFiles(output, outputDir);

      expect(await readFile(files.threads, 'utf-8')).toContain(output.threads);
      expect(await readFile(files.x, 'utf-8')).toContain(output.x);
      expect(await readFile(files.hooks, 'utf-8')).toContain(
        output.hooks[0]!.hook,
      );
      expect(await readFile(newsletterMarkdown, 'utf-8')).toBe(
        originalMarkdown,
      );
      expect(await readFile(newsletterHtml, 'utf-8')).toBe(originalHtml);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
