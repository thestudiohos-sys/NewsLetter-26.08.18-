import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';

import { generateObjectByLLM } from '~/generate-newsletter/llm-queries/generate-object-by-llm';

const DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1';
const LOCAL_API_KEY_PLACEHOLDER = 'lm-studio-local-placeholder';

const structuredOutputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

type ModelsResponse = {
  data?: Array<{ id?: string }>;
};

function normalizeBaseUrl(value: string | undefined): string {
  return (value?.trim() || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function getRequestHeaders(apiKey: string | undefined): HeadersInit {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function fetchAvailableModelIds(
  baseURL: string,
  apiKey: string | undefined,
): Promise<string[]> {
  const response = await fetch(`${baseURL}/models`, {
    headers: getRequestHeaders(apiKey),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(
      `LM Studio /models request failed: ${response.status} ${response.statusText}`,
    );
  }

  const body = (await response.json()) as ModelsResponse;
  return (body.data ?? [])
    .map(({ id }) => id)
    .filter((id): id is string => Boolean(id));
}

async function main(): Promise<void> {
  const baseURL = normalizeBaseUrl(process.env.LM_STUDIO_BASE_URL);
  const configuredApiKey = process.env.LM_STUDIO_API_KEY?.trim() || undefined;

  console.log(`[1/5] Checking LM Studio server: ${baseURL}`);
  const availableModelIds = await fetchAvailableModelIds(
    baseURL,
    configuredApiKey,
  );
  console.log('[PASS] LM Studio server connection');

  const configuredModelId = process.env.LM_STUDIO_MODEL?.trim();
  const modelId = configuredModelId || availableModelIds[0];

  if (!modelId) {
    throw new Error(
      'No LM Studio model is available. Load a model or set LM_STUDIO_MODEL.',
    );
  }

  if (configuredModelId && !availableModelIds.includes(configuredModelId)) {
    throw new Error(
      `LM_STUDIO_MODEL "${configuredModelId}" was not returned by /v1/models.`,
    );
  }

  console.log(`[2/5] Model identified: ${modelId}`);

  const lmstudio = createOpenAI({
    name: 'lmstudio',
    baseURL,
    apiKey: configuredApiKey || LOCAL_API_KEY_PLACEHOLDER,
  });
  const model = lmstudio.chat(modelId);

  console.log('[3/5] Requesting a simple text response');
  const textResult = await generateText({
    model,
    maxOutputTokens: 32,
    temperature: 0,
    prompt: 'Reply with exactly: LM Studio connection successful',
  });

  if (!textResult.text.trim()) {
    throw new Error('LM Studio returned an empty text response.');
  }
  console.log(`[PASS] Simple text response: ${textResult.text.trim()}`);

  console.log('[4/5] Requesting structured JSON output');
  const { output, finishReason } = await generateObjectByLLM({
    model,
    maxOutputTokens: 512,
    temperature: 0,
    schema: structuredOutputSchema,
    prompt:
      'Return a test object. Set title to "테스트 제목" and content to "테스트 본문".',
  });

  console.log(`[PASS] Structured output received (${finishReason})`);

  console.log('[5/5] Validating structured output with Zod');
  const validatedOutput = structuredOutputSchema.parse(output);
  console.log('[PASS] Zod validation');
  console.log(JSON.stringify(validatedOutput, null, 2));
}

main().catch((error: unknown) => {
  console.error('[FAIL] LM Studio connection test');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
