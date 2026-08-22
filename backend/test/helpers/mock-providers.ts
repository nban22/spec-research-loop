import { TestingModuleBuilder } from '@nestjs/testing';
import {
  LLM_PROVIDER,
  LlmProvider,
} from '../../src/llm/llm-provider.interface';
import { SourceClient } from '../../src/sources/source.client';
import { EmbedderService } from '../../src/verifier/embedder.service';

export const mockLlmProvider: LlmProvider = {
  complete: () =>
    Promise.resolve({
      content:
        '```json\n{"status": "ok", "options": [], "question": "Fake LLM question"}\n```',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
};

export const mockSourceClient = {
  search: () =>
    Promise.resolve({
      sources: [
        {
          retrieved_from: 'SEMANTIC_SCHOLAR',
          external_id: 's2-test-1',
          title: 'Mocked Research Paper',
          authors: ['Test Author'],
          year: 2024,
          venue: 'NeurIPS',
          doi: '10.1109/TEST.2024.123',
          url: 'https://example.com/paper.pdf',
          abstract: 'This is a mocked abstract for testing.',
          citation_count: 42,
          raw: {},
        },
      ],
      providersUsed: ['SEMANTIC_SCHOLAR'],
      providerErrors: [],
    }),
  verifyDoi: () => Promise.resolve(true),
  fetchAbstractByDoi: () => Promise.resolve('Mocked abstract fetched by DOI.'),
};

export const mockEmbedderService = {
  embed: () => Promise.resolve([0.1, 0.2, 0.3, 0.4]),
};

export function applyTestOverrides(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideProvider(LLM_PROVIDER)
    .useValue(mockLlmProvider)
    .overrideProvider(SourceClient)
    .useValue(mockSourceClient)
    .overrideProvider(EmbedderService)
    .useValue(mockEmbedderService);
}
