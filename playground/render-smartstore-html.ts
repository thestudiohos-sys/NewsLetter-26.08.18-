import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DATA_DIR, OUTPUT_DIR, ensureDir, loadText } from './_shared';
import { renderSmartStoreHtml } from './smartstore-html';

async function main(): Promise<void> {
  const markdownPath = resolve(OUTPUT_DIR, 'newsletter.md');
  const templatePath = resolve(DATA_DIR, 'smartstore-template.html');
  const outputPath = resolve(OUTPUT_DIR, 'newsletter.html');

  let markdown: string;
  let template: string;

  try {
    markdown = await loadText(markdownPath);
  } catch (error) {
    throw new Error(
      `newsletter.md를 찾을 수 없습니다: ${markdownPath}\n먼저 npm run playground:smartstore-newsletter를 실행하십시오.`,
      { cause: error },
    );
  }

  try {
    template = await loadText(templatePath);
  } catch (error) {
    throw new Error(
      `HTML 템플릿을 찾을 수 없습니다: ${templatePath}\nplayground/data-examples/smartstore-template.example.html을 복사하십시오.`,
      { cause: error },
    );
  }

  const html = renderSmartStoreHtml(markdown, template);
  await ensureDir(OUTPUT_DIR);
  await writeFile(outputPath, html, 'utf-8');

  console.log('[PASS] 스마트스토어 뉴스레터 HTML 렌더링 성공');
  console.log(`Input: ${markdownPath}`);
  console.log(`Template: ${templatePath}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Characters: ${html.length}`);
}

main().catch((error: unknown) => {
  console.error('[FAIL] 스마트스토어 뉴스레터 HTML 렌더링');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
