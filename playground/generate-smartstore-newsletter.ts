import { createOpenAI } from '@ai-sdk/openai';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { generateObjectByLLM } from '~/generate-newsletter/llm-queries/generate-object-by-llm';

import { OUTPUT_DIR, ensureDir } from './_shared';
import { loadSmartStoreInput } from './smartstore-input';
import {
  createNewsletterEditorialPrompts,
  findNewsletterEditorialViolations,
  findNewsletterFactViolations,
  newsletterEditorialSchema,
  renderSmartStoreNewsletterMarkdown,
} from './smartstore-prompts';

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';
const DEFAULT_MODEL_ID = 'google/gemma-4-e4b';
const LOCAL_API_KEY_PLACEHOLDER = 'lm-studio-local-placeholder';

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

function normalizeBaseUrl(value: string | undefined): string {
  return (value?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

async function assertModelAvailable(
  baseURL: string,
  modelId: string,
  apiKey: string | undefined,
): Promise<void> {
  const response = await fetch(`${baseURL}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `LM Studio /models 요청 실패: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as ModelsResponse;
  const modelIds = (body.data ?? [])
    .map(({ id }) => id)
    .filter((id): id is string => Boolean(id));

  if (!modelIds.includes(modelId)) {
    throw new Error(
      `LM Studio에서 모델 "${modelId}"을 찾을 수 없습니다. 모델을 먼저 로드하십시오.`,
    );
  }
}

export type SmartStoreNewsletterGenerationResult = {
  model: string;
  productCount: number;
  llmCalls: 1;
  totalSeconds: number;
  generationSeconds: number;
  outputFile: string;
};

export async function generateSmartStoreNewsletter(): Promise<SmartStoreNewsletterGenerationResult> {
  const totalStartedAt = performance.now();
  const input = await loadSmartStoreInput();
  const baseURL = normalizeBaseUrl(process.env.LM_STUDIO_BASE_URL);
  const modelId = process.env.LM_STUDIO_MODEL?.trim() || DEFAULT_MODEL_ID;
  const configuredApiKey = process.env.LM_STUDIO_API_KEY?.trim() || undefined;

  console.log(
    `[1/4] 입력 검증 및 상품 사실 고정 성공: ${input.products.length}개`,
  );
  console.log(`[2/4] LM Studio 모델 확인: ${modelId}`);
  await assertModelAvailable(baseURL, modelId, configuredApiKey);

  const lmstudio = createOpenAI({
    name: 'lmstudio',
    baseURL,
    apiKey: configuredApiKey || LOCAL_API_KEY_PLACEHOLDER,
  });
  const model = lmstudio.chat(modelId);
  const prompts = createNewsletterEditorialPrompts(input);

  console.log('[3/4] 제목 + 인트로 + CTA 단일 구조화 생성 시작');
  const generationStartedAt = performance.now();
  const { output, usage, finishReason } = await generateObjectByLLM({
    model,
    schema: newsletterEditorialSchema,
    system: prompts.system,
    prompt: prompts.prompt,
    maxOutputTokens: 2_048,
    maxRetries: 0,
    temperature: 0.2,
  });
  const generationMilliseconds = performance.now() - generationStartedAt;
  const editorial = newsletterEditorialSchema.parse(output);

  const editorialViolations = findNewsletterEditorialViolations(
    input,
    editorial,
  );
  if (editorialViolations.length > 0) {
    throw new Error(
      `LLM 편집 영역 검증 실패:\n${editorialViolations.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  const markdown = renderSmartStoreNewsletterMarkdown(input, editorial);
  const factViolations = findNewsletterFactViolations(input, {
    title: editorial.title,
    content: markdown,
  });
  if (factViolations.length > 0) {
    throw new Error(
      `뉴스레터 사실 보존 검증 실패:\n${factViolations.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  await ensureDir(OUTPUT_DIR);
  const outputFile = resolve(OUTPUT_DIR, 'newsletter.md');
  await writeFile(outputFile, markdown, 'utf-8');

  const totalMilliseconds = performance.now() - totalStartedAt;
  console.log('[4/4] deterministic 상품 조립 및 newsletter.md 저장 성공');
  const result: SmartStoreNewsletterGenerationResult = {
    model: modelId,
    productCount: input.products.length,
    llmCalls: 1,
    totalSeconds: Number((totalMilliseconds / 1_000).toFixed(3)),
    generationSeconds: Number((generationMilliseconds / 1_000).toFixed(3)),
    outputFile,
  };

  console.log(
    JSON.stringify(
      {
        ...result,
        finishReason,
        llmScope: ['title', 'intro', 'cta'],
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? null,
        totalTokens: usage.totalTokens,
        outputCharacters: markdown.length,
      },
      null,
      2,
    ),
  );

  return result;
}

function isDirectExecution(): boolean {
  return Boolean(
    process.argv[1] &&
    fileURLToPath(import.meta.url) === resolve(process.argv[1]),
  );
}

if (isDirectExecution()) {
  generateSmartStoreNewsletter().catch((error: unknown) => {
    console.error('[FAIL] 스마트스토어 뉴스레터 생성');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
