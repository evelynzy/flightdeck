/**
 * Adapter barrel export (R9).
 *
 * Re-exports all adapter types, implementations, and the factory function.
 */
export type {
  AgentAdapter,
  AdapterStartOptions,
  AdapterFactory,
  AdapterFactoryOptions,
  ContentBlock,
  PromptContent,
  PromptOptions,
  PromptResult,
  StopReason,
  UsageInfo,
  ToolCallInfo,
  ToolUpdateInfo,
  PlanEntry,
  AdapterCapabilities,
  PermissionRequest,
} from './types.js';

export { AcpAdapter } from './AcpAdapter.js';
export { MockAdapter } from './MockAdapter.js';
export {
  PROVIDER_PRESETS,
  getPreset,
  listPresets,
  isValidProviderId,
  detectInstalledProviders,
} from './presets.js';
export type { ProviderPreset, ProviderId, BinaryChecker } from './presets.js';

import { AcpAdapter } from './AcpAdapter.js';
import { MockAdapter } from './MockAdapter.js';
import type { AgentAdapter, AdapterFactoryOptions } from './types.js';

/**
 * Create an adapter instance. Register this as a singleton factory in the DI container.
 * Individual adapters are transient (one per agent).
 */
export function createAdapter(opts: AdapterFactoryOptions): AgentAdapter {
  switch (opts.type) {
    case 'acp':
      return new AcpAdapter({ autopilot: opts.autopilot });
    case 'mock':
      return new MockAdapter();
    default:
      throw new Error(`Unknown adapter type: ${(opts as any).type}`);
  }
}
