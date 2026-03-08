// packages/server/src/integrations/index.ts
// Barrel export for the integrations module.

export { IntegrationAgent } from './IntegrationAgent.js';
export { TelegramAdapter } from './TelegramAdapter.js';
export { NotificationBridge } from './NotificationBridge.js';
export type {
  MessagingPlatform,
  InboundMessage,
  OutboundMessage,
  ChatSession,
  NotificationEvent,
  NotificationCategory,
  TelegramConfig,
  MessagingAdapter,
} from './types.js';
