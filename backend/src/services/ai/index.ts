import { TravelDocumentAiService } from './types.js';
import { MockAiService } from './mockAiService.js';
import { ClaudeAiService } from './claudeAiService.js';

export * from './types.js';
export { MockAiService } from './mockAiService.js';
export { ClaudeAiService } from './claudeAiService.js';

/**
 * Factory function to create AI service based on environment configuration
 *
 * Uses Claude Vision API when ANTHROPIC_API_KEY is set,
 * otherwise falls back to mock service for development.
 */
export function createAiService(): TravelDocumentAiService {
  const aiProvider = process.env.AI_PROVIDER || 'auto';

  // Auto-detect: use Claude if API key is available
  if (aiProvider === 'auto') {
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('[AI Service] Using Claude Vision API for document analysis');
      return new ClaudeAiService();
    } else {
      console.log('[AI Service] No ANTHROPIC_API_KEY found, using mock service');
      return new MockAiService();
    }
  }

  switch (aiProvider) {
    case 'claude':
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('[AI Service] ANTHROPIC_API_KEY not set, falling back to mock');
        return new MockAiService();
      }
      console.log('[AI Service] Using Claude Vision API for document analysis');
      return new ClaudeAiService();

    case 'mock':
      console.log('[AI Service] Using mock AI service');
      return new MockAiService();

    default:
      console.warn(`[AI Service] Unknown provider: ${aiProvider}, falling back to mock`);
      return new MockAiService();
  }
}

// Singleton instance
let aiInstance: TravelDocumentAiService | null = null;

export function getAiService(): TravelDocumentAiService {
  if (!aiInstance) {
    aiInstance = createAiService();
  }
  return aiInstance;
}
