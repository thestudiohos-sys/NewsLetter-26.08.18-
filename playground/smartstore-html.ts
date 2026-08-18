import { JSDOM } from 'jsdom';
import juice from 'juice';
import safeMarkdown2Html from 'safe-markdown2html';

import { ensureHrBeforeH2 } from '~/utils/string';

export type ParsedNewsletterMarkdown = {
  title: string;
  content: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseNewsletterMarkdown(
  markdown: string,
): ParsedNewsletterMarkdown {
  const frontmatter = markdown.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/,
  );

  if (!frontmatter) {
    throw new Error('newsletter.md에서 제목 frontmatter를 찾을 수 없습니다.');
  }

  const titleLine = frontmatter[1]!.match(/^title:\s*(.+)$/m);
  if (!titleLine) {
    throw new Error('newsletter.md frontmatter에 title이 없습니다.');
  }

  const rawTitle = titleLine[1]!.trim();
  let title = rawTitle;
  if (rawTitle.startsWith('"') && rawTitle.endsWith('"')) {
    try {
      title = JSON.parse(rawTitle) as string;
    } catch {
      throw new Error('newsletter.md의 title 문자열 형식이 올바르지 않습니다.');
    }
  }

  if (!title.trim()) {
    throw new Error('newsletter.md의 title이 비어 있습니다.');
  }

  return { title, content: frontmatter[2]! };
}

export function renderSmartStoreHtml(
  markdown: string,
  template: string,
): string {
  if (!template.includes('{{title}}') || !template.includes('{{content}}')) {
    throw new Error(
      'HTML 템플릿에는 {{title}}과 {{content}} marker가 필요합니다.',
    );
  }

  const { title, content } = parseNewsletterMarkdown(markdown);
  const contentHtml = safeMarkdown2Html(ensureHrBeforeH2(content.trim()), {
    window: new JSDOM('').window,
    linkTargetBlank: true,
    fixMalformedUrls: true,
    fixBoldSyntax: true,
    convertStrikethrough: true,
  });

  const rendered = template
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{content}}', contentHtml);

  return juice(rendered);
}
