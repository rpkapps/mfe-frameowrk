export type {
  AppDescriptor,
  ContractMetadata,
  MfeDescriptor,
  NormalizedRegistryRecord,
  WidgetDescriptor,
} from './definition';
export { MFE_CONTRACT_MAJOR } from './definition';
export { createMfeError, isMfeError } from './error';
export type { MfeError, MfeErrorCode, MfeErrorOptions } from './error';
export type { MountHandle, MountState } from './lifecycle';
export type { ShellState, ShellStateStore } from './shell-state';

export type {
  MfeStorage,
  MfeStorageKey,
  StorageKeyOptions,
  StorageRetention,
  StorageSchema,
  StorageSubscriptionOptions,
  StorageStore,
  StorageUpdater,
} from './storage-contracts';

export { findJsonValidationIssue, freezeJsonValue, isJsonSerializable } from './json-validation';
export type { JsonValidationIssue, JsonValue } from './json-validation';

export type {
  WidgetContract,
  WidgetContractAttribution,
  WidgetEventName,
  WidgetEventPayload,
  WidgetEventSchemas,
  WidgetInputRuntime,
  WidgetInputRuntimeOptions,
  WidgetInputValidationFailure,
  WidgetInputValidationOptions,
  WidgetInputValidationResult,
  WidgetInputValidationSuccess,
  WidgetInputUpdateResult,
  WidgetInputsOf,
  WidgetSchema,
} from './widget-contract';
export { createWidgetInputRuntime, validateWidgetInputs } from './widget-contract';

export type {
  WidgetChannel,
  WidgetChannelOptions,
  WidgetEventSubscription,
} from './widget-channel';
export { createWidgetChannel } from './widget-channel';
