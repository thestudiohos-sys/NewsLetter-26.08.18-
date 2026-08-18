import { createOpenAI } from '@ai-sdk/openai';
import { performance } from 'node:perf_hooks';

import { generateObjectByLLM } from '~/generate-newsletter/llm-queries/generate-object-by-llm';

import { OUTPUT_DIR } from './_shared';
import { loadSmartStoreInput } from './smartstore-input';
import {
  createSmartStoreSocialPrompts,
  findSocialContentViolations,
  getXLengthWarning,
  socialContentSchema,
  writeSocialContentFiles,
} from './smartstore-social';

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

async function main(): Promise<void> {
  const totalStartedAt = performance.now();
  const input = await loadSmartStoreInput();
  const baseURL = normalizeBaseUrl(process.env.LM_STUDIO_BASE_URL);
  const modelId = process.env.LM_STUDIO_MODEL?.trim() || DEFAULT_MODEL_ID;
  const configuredApiKey = process.env.LM_STUDIO_API_KEY?.trim() || undefined;

  console.log(`[1/4] 스마트스토어 입력 검증 성공: ${input.products.length}개`);
  console.log(`[2/4] LM Studio 모델 확인: ${modelId}`);
  await assertModelAvailable(baseURL, modelId, configuredApiKey);

  const lmstudio = createOpenAI({
    name: 'lmstudio',
    baseURL,
    apiKey: configuredApiKey || LOCAL_API_KEY_PLACEHOLDER,
  });
  const model = lmstudio.chat(modelId);
  const prompts = createSmartStoreSocialPrompts(input);

  console.log('[3/4] Threads + X + Hooks 단일 구조화 생성 시작');
  const generationStartedAt = performance.now();
  const { output, usage, finishReason } = await generateObjectByLLM({
    model,
    schema: socialContentSchema,
    system: prompts.system,
    prompt: prompts.prompt,
    maxOutputTokens: 4_096,
    maxRetries: 0,
    temperature: 0.2,
  });
  const generationMilliseconds = performance.now() - generationStartedAt;

  const validatedOutput = socialContentSchema.parse(output);
  const violations = findSocialContentViolations(input, validatedOutput);
  if (violations.length > 0) {
    throw new Error(
      `SNS 생성 결과 사실 보존 검증 실패:\n${violations.map((item) => `- ${item}`).join('\n')}`,
    );
  }

  const files = await writeSocialContentFiles(validatedOutput, OUTPUT_DIR);
  const xLengthWarning = getXLengthWarning(validatedOutput.x);
  if (xLengthWarning) console.warn(`[WARN] ${xLengthWarning}`);

  const totalMilliseconds = performance.now() - totalStartedAt;
  const generatedCharacters =
    validatedOutput.threads.length +
    validatedOutput.x.length +
    validatedOutput.hooks.reduce(
      (total, { productName, hook }) =>
        total + productName.length + hook.length,
      0,
    );

  console.log('[4/4] SNS Markdown 3개 저장 및 사실 보존 검증 성공');
  console.log(
    JSON.stringify(
      {
        model: modelId,
        finishReason,
        productCount: input.products.length,
        llmCalls: 1,
        totalSeconds: Number((totalMilliseconds / 1_000).toFixed(3)),
        generationSeconds: Number((generationMilliseconds / 1_000).toFixed(3)),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? null,
        totalTokens: usage.totalTokens,
        generatedCharacters,
        xCharacters: Array.from(validatedOutput.x).length,
        xLengthWarning,
        outputFiles: files,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error('[FAIL] 스마트스토어 SNS 콘텐츠 생성');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
