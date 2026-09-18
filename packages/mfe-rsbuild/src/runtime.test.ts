import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import { createRemoteRegistry } from './runtime';

vi.mock('@module-federation/enhanced/runtime', () => ({
  loadRemote: vi.fn(),
  registerRemotes: vi.fn(),
}));

const apps = [{ id: 'example', adapter: 'plain', entry: 'https://example.test/mf-manifest.json' }];
const signal = () => new AbortController().signal;

beforeEach(() => {
  vi.mocked(loadRemote).mockReset();
});

describe('federated transport', () => {
  it('clears a failed remote only on explicit retry and unwraps opaque definitions', async () => {
    const definition = { kind: 'app', id: 'example', customFramework: true };
    vi.mocked(loadRemote)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ default: definition });
    const { registry } = createRemoteRegistry({ apps });
    const registration = registry[0]!;
    await expect(registration.load({ signal: signal(), retry: false })).rejects.toThrow('offline');
    expect(registerRemotes).toHaveBeenCalledTimes(1);
    await expect(registration.load({ signal: signal(), retry: true })).resolves.toBe(definition);
    expect(registerRemotes).toHaveBeenLastCalledWith([{ name: 'example', entry: apps[0]!.entry }], {
      force: true,
    });
    await registration.load({ signal: signal(), retry: true });
    expect(registerRemotes).toHaveBeenCalledTimes(2);
  });

  it('rejects credential and non-HTTP overrides while preserving valid query parameters', () => {
    const warnings: string[] = [];
    for (const override of [
      'https://user:secret@example.test/manifest.json',
      'javascript:alert(1)',
    ]) {
      const { remotes } = createRemoteRegistry({
        apps,
        overrides: { example: override },
        onWarning: (message) => warnings.push(message),
      });
      expect(remotes[0]!.entry).toBe(apps[0]!.entry);
    }
    expect(warnings).toHaveLength(2);
    const { remotes } = createRemoteRegistry({
      apps,
      overrides: { example: 'https://alternate.test/manifest.json?test=1' },
    });
    expect(remotes[0]!.entry).toBe('https://alternate.test/manifest.json?test=1');
  });

  it('retires an aborted consumer without waiting for the transport or accepting late results', async () => {
    let complete!: (value: { default: unknown }) => void;
    vi.mocked(loadRemote).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { registry } = createRemoteRegistry({ apps });
    const controller = new AbortController();
    const pending = registry[0]!.load({ signal: controller.signal, retry: false });
    const result = expect(pending).rejects.toThrow('retired');
    controller.abort(new Error('retired'));
    await result;
    complete({ default: { id: 'late' } });
    await expect(registry[0]!.load({ signal: controller.signal, retry: true })).rejects.toThrow(
      'retired',
    );
    expect(loadRemote).toHaveBeenCalledTimes(1);
  });
});
