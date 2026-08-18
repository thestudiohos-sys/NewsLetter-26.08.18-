import type { SmartStoreInput } from './smartstore-input';

import type { ArticleForGenerateContent } from '~/generate-newsletter/models/article';

export function toNewsletterArticles(
  input: SmartStoreInput,
): ArticleForGenerateContent[] {
  return input.products.map((product, index) => ({
    id: `smartstore-product-${index + 1}`,
    title: product.name,
    detailContent: [
      `가격: ${product.price}`,
      '특징:',
      ...product.features.map((feature) => `- ${feature}`),
      `추천 이유: ${product.recommendationReason}`,
    ].join('\n'),
    hasAttachedImage: false,
    imageContextByLlm: null,
    tag1: input.category,
    tag2: null,
    tag3: null,
    targetUrl: product.url,
    importanceScore: 1,
    contentType: input.category,
    url: product.url,
  }));
}
