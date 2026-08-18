import { createOpenAI } from '@ai-sdk/openai';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import GenerateNewsletter from '~/generate-newsletter/llm-queries/generate-newsletter.llm';
import { LoggingExecutor } from '~/logging/logging-executor';

import {
  OUTPUT_DIR,
  consoleLogger,
  createDateService,
  ensureDir,
} from './_shared';
import { toNewsletterArticles } from './smartstore-adapter';
import { loadSmartStoreInput } from './smartstore-input';
import {
  createSmartStorePromptProvider,
  findNewsletterFactViolations,
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
  const modelIds = (body.data ?? []).map(({ id }) => id).filter(Boolean);
  if (!modelIds.includes(modelId)) {
    throw new Error(
      `LM Studio에서 모델 "${modelId}"을 찾을 수 없습니다. 모델을 먼저 로드하십시오.`,
    );
  }
}

function getTodayStrings(): { isoDate: string; displayDate: string } {
  const now = new Date();
  return {
    isoDate: now.toISOString().split('T')[0]!,
    displayDate: now.toLocaleDateString('ko-KR'),
  };
}

async function main(): Promise<void> {
  const totalStartedAt = performance.now();
  const input = await loadSmartStoreInput();
  const targetArticles = toNewsletterArticles(input);
  const promptProvider = createSmartStorePromptProvider(input);

  const baseURL = normalizeBaseUrl(process.env.LM_STUDIO_BASE_URL);
  const modelId = process.env.LM_STUDIO_MODEL?.trim() || DEFAULT_MODEL_ID;
  const configuredApiKey = process.env.LM_STUDIO_API_KEY?.trim() || undefined;

  console.log(`[1/4] 입력 검증 및 상품 변환 성공: ${targetArticles.length}개`);
  console.log(`[2/4] LM Studio 모델 확인: ${modelId}`);
  await assertModelAvailable(baseURL, modelId, configuredApiKey);

  const lmstudio = createOpenAI({
    name: 'lmstudio',
    baseURL,
    apiKey: configuredApiKey || LOCAL_API_KEY_PLACEHOLDER,
  });
  const model = lmstudio.chat(modelId);
  const taskId = `smartstore-newsletter-${Date.now()}`;
  const { isoDate, displayDate } = getTodayStrings();

  const query = new GenerateNewsletter({
    model,
    maxOutputTokens: 4_096,
    temperature: 0.2,
    logger: consoleLogger,
    taskId,
    loggingExecutor: new LoggingExecutor(consoleLogger, taskId),
    options: {
      content: {
        outputLanguage: '한국어',
        expertField: input.category,
        freeFormIntro: true,
      },
      llm: { maxRetries: 2 },
    },
    targetArticles,
    dateService: createDateService(displayDate, isoDate),
    newsletterBrandName: input.storeName,
    promptBuilder: promptProvider.contentGenerate?.generateNewsletter,
  });

  console.log('[3/4] LM Studio 뉴스레터 생성 시작');
  const generationStartedAt = performance.now();
  const { result, usage } = await query.execute();
  const generationMilliseconds = performance.now() - generationStartedAt;

  const violations = findNewsletterFactViolations(input, result);
  if (violations.length > 0) {
    throw new Error(
      `생성 결과 사실 보존 검증 실패:\n${violations.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  const markdown = `---\ntitle: ${JSON.stringify(result.title)}\n---\n\n${result.content}\n`;
  await ensureDir(OUTPUT_DIR);
  await writeFile(resolve(OUTPUT_DIR, 'newsletter.md'), markdown, 'utf-8');

  const totalMilliseconds = performance.now() - totalStartedAt;
  console.log('[4/4] newsletter.md 저장 및 사실 보존 검증 성공');
  console.log(
    JSON.stringify(
      {
        model: modelId,
        productCount: input.products.length,
        totalSeconds: Number((totalMilliseconds / 1_000).toFixed(3)),
        generationSeconds: Number((generationMilliseconds / 1_000).toFixed(3)),
        outputCharacters: markdown.length,
        usage,
        outputFile: resolve(OUTPUT_DIR, 'newsletter.md'),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[FAIL] 스마트스토어 뉴스레터 생성');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
