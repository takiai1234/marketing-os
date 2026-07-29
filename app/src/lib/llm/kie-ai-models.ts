// Client-safe image model definitions — không import SDK/DB.
// Server dùng kie-ai.ts; client component dùng file này.

export interface KieImageModelClient {
  id: string;
  label: string;
  description: string;
  aspectRatios?: readonly string[];
  resolutions?: readonly string[];
  estimatedCost?: string;
}

export const IMAGE_MODELS_CLIENT: readonly KieImageModelClient[] = [
  {
    id: 'gpt-image-2-text-to-image',
    label: 'GPT Image 2',
    description: 'OpenAI · realistic, good for product shots',
    aspectRatios: ['auto', '1:1', '16:9', '9:16', '4:3', '3:4'],
    resolutions: ['1K', '2K', '4K'],
    estimatedCost: '~$0.04',
  },
  {
    id: 'nano-banana-2',
    label: 'Nano Banana 2',
    description: 'Google Gemini Image · multi-panel, text-in-image',
    aspectRatios: ['auto', '1:1', '16:9', '9:16'],
    resolutions: ['1K', '2K'],
    estimatedCost: '~$0.04',
  },
  {
    id: 'flux-2/flex-text-to-image',
    label: 'Flux 2 Flex',
    description: 'Black Forest Labs · nhanh, rẻ, OSS-friendly',
    aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    resolutions: ['1K', '2K'],
    estimatedCost: '~$0.01',
  },
  {
    id: 'grok-imagine/text-to-image',
    label: 'Grok Imagine',
    description: 'xAI · cinematic, photographic',
    aspectRatios: ['1:1', '16:9', '9:16', '3:2', '2:3'],
    estimatedCost: '~$0.05',
  },
] as const;
