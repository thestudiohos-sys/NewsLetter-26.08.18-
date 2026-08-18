import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { DATA_DIR } from './_shared';

function requiredText(label: string) {
  return z
    .string({ error: `${label}은(는) 문자열로 입력해야 합니다.` })
    .refine((value) => value.trim().length > 0, {
      message: `${label}은(는) 필수입니다.`,
    });
}

const productSchema = z.strictObject({
  name: requiredText('상품명'),
  price: requiredText('가격'),
  features: z
    .array(requiredText('상품 특징'), {
      error: '상품 특징은 문자열 배열로 입력해야 합니다.',
    })
    .min(1, '상품 특징은 최소 1개 입력해야 합니다.'),
  recommendationReason: requiredText('추천 이유'),
  url: requiredText('상품 URL')
    .refine((value) => URL.canParse(value), {
      message: '상품 URL은 올바른 URL 형식이어야 합니다.',
    })
    .refine(
      (value) => {
        if (!URL.canParse(value)) return true;
        return ['http:', 'https:'].includes(new URL(value).protocol);
      },
      { message: '상품 URL은 http 또는 https 주소여야 합니다.' },
    ),
});

export const smartStoreInputSchema = z.strictObject({
  storeName: requiredText('스토어명'),
  category: requiredText('카테고리'),
  targetCustomer: requiredText('타깃 고객'),
  newsletterTopic: requiredText('뉴스레터 주제'),
  tone: requiredText('콘텐츠 톤'),
  products: z
    .array(productSchema, {
      error: '상품 목록은 배열로 입력해야 합니다.',
    })
    .min(1, '상품은 최소 1개 입력해야 합니다.')
    .max(5, '상품은 최대 5개까지만 입력할 수 있습니다.'),
});

export type SmartStoreInput = z.infer<typeof smartStoreInputSchema>;

export function parseSmartStoreInput(input: unknown): SmartStoreInput {
  return smartStoreInputSchema.parse(input);
}

export function formatSmartStoreValidationError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '입력';
      return `- ${path}: ${issue.message}`;
    })
    .join('\n');

  return `smartstore.json 검증에 실패했습니다:\n${details}`;
}

export async function loadSmartStoreInput(
  filePath = resolve(DATA_DIR, 'smartstore.json'),
): Promise<SmartStoreInput> {
  let raw: string;

  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(
        `스마트스토어 입력 파일을 찾을 수 없습니다: ${filePath}`,
        { cause: error },
      );
    }
    throw error;
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    throw new Error(`smartstore.json의 JSON 형식이 올바르지 않습니다.`, {
      cause: error,
    });
  }

  const result = smartStoreInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatSmartStoreValidationError(result.error), {
      cause: result.error,
    });
  }

  return result.data;
}

function isDirectExecution(): boolean {
  return Boolean(
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]),
  );
}

async function main(): Promise<void> {
  try {
    const input = await loadSmartStoreInput();
    console.log(
      `[PASS] 스마트스토어 입력 검증 성공: ${input.products.length}개 상품`,
    );
    console.log(JSON.stringify(input, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : '알 수 없는 오류가 발생했습니다.',
    );
    process.exitCode = 1;
  }
}

if (isDirectExecution()) {
  void main();
}
