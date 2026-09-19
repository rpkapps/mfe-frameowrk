/** Adapter/host integration only. App and Widget authors use the package root. */
export { createAppMount } from './app-mount';
export { createReactAdapter } from './app-host';
export { retireQueryClientNow } from './query-session';
export { createNavigationHistory } from './navigation-history';

export {
  MountServicesProvider,
  useMfeMountServices,
} from '@company/mfe-react/internal/mount-services-context';
export type {
  MfeMountServices,
  MfeReactMountEnvironment,
} from '@company/mfe-react/internal/mount-services-context';

export {
  MfeHostProvider,
  useMfeHostEnvironment,
  MFE_HOST_CONTEXT,
  MFE_APP_BASE_PATH,
} from '@company/mfe-react/internal/host-context';
export type { MfeHostEnvironment, MfeRouteHost } from '@company/mfe-react/internal/host-context';

export { WidgetMount } from './widget-mount';
export type { WidgetMountProps } from './widget-mount';
export { createReactWidgetAdapter } from './widget-adapter';
