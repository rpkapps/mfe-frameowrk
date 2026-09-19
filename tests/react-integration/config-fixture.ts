/** Test-only generated config alias; it does not implement production config/auth. */
export interface TestMfeConfig {
  apiBaseUrl: string;
  persona: string;
}

export const config: TestMfeConfig = {
  apiBaseUrl: 'https://fixture.invalid',
  persona: 'test-user',
};

export function configureTestConfig(next: Partial<TestMfeConfig>): void {
  Object.assign(config, next);
}

export function resetTestConfig(): void {
  config.apiBaseUrl = 'https://fixture.invalid';
  config.persona = 'test-user';
}
