import { TravelDocumentAiService } from './types.js';
import { MockAiService } from './mockAiService.js';

export * from './types.js';
export { MockAiService } from './mockAiService.js';

/**
 * Factory function to create AI service based on environment configuration
 *
 * To add real AI/OCR provider later:
 * 1. Create service implementing TravelDocumentAiService
 * 2. Add case here with appropriate configuration
 *
 * Example providers to consider:
 * - Google Cloud Vision + Vertex AI
 * - AWS Textract + Bedrock
 * - Azure Form Recognizer + OpenAI
 * - Direct OpenAI GPT-4 Vision API
 */
export function createAiService(): TravelDocumentAiService {
  const aiProvider = process.env.AI_PROVIDER || 'mock';

  switch (aiProvider) {
    case 'mock':
      return new MockAiService();

    // Future implementations:
    // case 'openai':
    //   return new OpenAiDocumentService({
    //     apiKey: process.env.OPENAI_API_KEY!,
    //   });
    //
    // case 'google':
    //   return new GoogleVisionService({
    //     projectId: process.env.GOOGLE_PROJECT_ID!,
    //     credentials: process.env.GOOGLE_CREDENTIALS!,
    //   });

    default:
      console.warn(`Unknown AI provider: ${aiProvider}, falling back to mock`);
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
