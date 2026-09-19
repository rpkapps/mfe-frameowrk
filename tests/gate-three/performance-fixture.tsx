import { useEffect } from 'react';
import { useGroups, useTheme, useUser } from '@company/mfe-react';

/** Gate 3 scale shape used by an executable profiling runner. */
export const GATE_THREE_SCALE = Object.freeze({
  appMounts: 2,
  widgetMounts: 50,
  storageKeys: 100,
});

export interface CommitProbeProps {
  readonly onCommit?: () => void;
  readonly testId?: string;
}

/**
 * A probe reports after React commits. It deliberately avoids render counters
 * and mutable render-time bookkeeping, which are not evidence of committed UI.
 */
function CommittedProbe({ onCommit, testId }: CommitProbeProps) {
  useEffect(() => {
    onCommit?.();
  });
  return <output data-testid={testId ?? 'shell-state-probe'} />;
}

export function ShellStateProbe({ onCommit, testId }: CommitProbeProps = {}) {
  useUser();
  useGroups();
  useTheme();
  return (
    <CommittedProbe
      {...(onCommit === undefined ? {} : { onCommit })}
      {...(testId === undefined ? {} : { testId })}
    />
  );
}

export function UserProbe(props: CommitProbeProps = {}) {
  useUser();
  return (
    <CommittedProbe
      {...(props.onCommit === undefined ? {} : { onCommit: props.onCommit })}
      testId={props.testId ?? 'user-probe'}
    />
  );
}

export function GroupsProbe(props: CommitProbeProps = {}) {
  useGroups();
  return (
    <CommittedProbe
      {...(props.onCommit === undefined ? {} : { onCommit: props.onCommit })}
      testId={props.testId ?? 'groups-probe'}
    />
  );
}

export function ThemeProbe(props: CommitProbeProps = {}) {
  useTheme();
  return (
    <CommittedProbe
      {...(props.onCommit === undefined ? {} : { onCommit: props.onCommit })}
      testId={props.testId ?? 'theme-probe'}
    />
  );
}
