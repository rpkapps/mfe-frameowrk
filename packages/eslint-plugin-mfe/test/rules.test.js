import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import noGlobalPatching from '../src/rules/no-global-patching.js';
import noRawStorage from '../src/rules/no-raw-storage.js';
import stableDefinitions from '../src/rules/stable-definitions.js';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

tester.run('no-global-patching', noGlobalPatching, {
  valid: [
    'fetch("/api");',
    'window.addEventListener("popstate", listener);',
    'window.history.pushState({}, "", "/tracer");',
    'const local = { fetch }; local.fetch = replacement;',
    'function configure(window) { window.fetch = replacement; }',
    'function configure(history) { history.pushState = replacement; }',
    'function configure(globalThis) { globalThis.addEventListener = replacement; }',
    'function configure(Object) { Object.defineProperty(window, "fetch", descriptor); }',
    'let request = fetch; request = replacement;',
    'const win = window; function configure(win) { win.fetch = replacement; }',
    'const local = { history: {} }; const { history } = local; history.pushState = replacement;',
    'let target = window; target = {}; target.fetch = replacement;',
    'const a = b; const b = a; a.fetch = replacement;',
    'Object.defineProperty(element, "addEventListener", descriptor);',
    'Object.assign(window, { appVersion: "1" });',
    'import { history } from "own-router"; history.pushState = replacement;',
  ],
  invalid: [
    'window.fetch = replacement;',
    'globalThis.fetch = replacement;',
    'self.fetch = replacement;',
    'globalThis.window.fetch = replacement;',
    'fetch = replacement;',
    'window["fetch"] = replacement;',
    'window.history.pushState = replacement;',
    'history.replaceState = replacement;',
    'const browser = window; browser.history.pushState = replacement;',
    'const navigation = window.history; navigation.replaceState = replacement;',
    'const { history: navigation } = window; navigation.pushState = replacement;',
    'const { history } = window; history.pushState = replacement;',
    'window.addEventListener = replacement;',
    'removeEventListener = replacement;',
    'document.removeEventListener = replacement;',
    'EventTarget.prototype.addEventListener = replacement;',
    'History.prototype.pushState = replacement;',
    'window.History.prototype.replaceState = replacement;',
    'const nav = (window.history as History); nav.replaceState = replacement;',
    'const browser = window satisfies Window; browser.fetch = replacement;',
    'window.history!.replaceState = replacement;',
    'Object.defineProperty(window, "fetch", descriptor);',
    'Reflect.defineProperty(history, "pushState", descriptor);',
    'Reflect.set(window, "fetch", replacement);',
    'const { defineProperty: define } = Object; define(window, "fetch", descriptor);',
    'Object.defineProperties(window, { fetch: descriptor });',
    'Object.assign(history, { pushState: replacement });',
    'delete window.fetch;',
    '({ fetch } = source);',
    '[fetch] = source;',
    '({ fetch: window.fetch = replacement } = source);',
  ].map((code) => ({ code, errors: [{ messageId: 'patch' }] })),
});

tester.run('stable-definitions', stableDefinitions, {
  valid: [
    'import { createApp } from "@company/mfe-react"; export const app = createApp({ id: "tracer" });',
    'import { createApp as define } from "@company/mfe-react"; export default define({ id: "tracer" });',
    'import * as mfe from "@company/mfe-react"; export const app = mfe.createApp({ id: "tracer" });',
    'function createApp() {} function View() { return createApp(); }',
    'import { createApp } from "unrelated-library"; function View() { return createApp(); }',
    'import { createApp } from "@company/mfe-react"; function View(createApp) { return createApp(); }',
    'import * as mfe from "@company/mfe-react"; function View(mfe) { return mfe.createApp(); }',
    'import type { createApp } from "@company/mfe-react"; type Factory = typeof createApp;',
    'import { createApp } from "@company/mfe-react"; function factory() { return {}; } export const app = createApp({ router: factory });',
    'import { createApp } from "@company/mfe-react"; let define = createApp; define = unrelated; function View() { return define(); }',
  ],
  invalid: [
    'import { createApp } from "@company/mfe-react"; function View() { return createApp({ id: "tracer" }); }',
    'import { createApp as define } from "@company/mfe-react"; const View = () => define({ id: "tracer" });',
    'import * as mfe from "@company/mfe-react"; const View = () => mfe.createApp({ id: "tracer" });',
    'import * as mfe from "@company/mfe-react"; const { createApp: define } = mfe; const View = () => define({ id: "tracer" });',
    'import { createApp } from "@company/mfe-react"; const define = createApp; function View() { return define({ id: "tracer" }); }',
    'import { createApp } from "@company/mfe-react"; const View = () => (createApp as typeof createApp)({ id: "tracer" });',
    'import { createApp } from "@company/mfe-react"; function View() { return createApp!({ id: "tracer" }); }',
    'import { createApp } from "@company/mfe-react"; function View() { return useMemo(() => createApp({ id: "tracer" }), []); }',
  ].map((code) => ({ code, errors: [{ messageId: 'unstable' }] })),
});

tester.run('no-raw-storage', noRawStorage, {
  valid: [
    'function read(localStorage) { return localStorage.getItem("key"); }',
    'function read(sessionStorage) { return sessionStorage.getItem("key"); }',
    'function read(window) { return window.localStorage.getItem("key"); }',
    'const localStorage = ownedStorage; localStorage.getItem("key");',
    'const window = { localStorage: ownedStorage }; window.localStorage.getItem("key");',
    'const own = { localStorage: ownedStorage }; const { localStorage } = own; localStorage.getItem("key");',
    'type StorageType = typeof localStorage; type NestedStorageType = typeof window.localStorage;',
    'import { localStorage } from "storage-library"; localStorage.getItem("key");',
    'const other = { localStorage: ownedStorage }; other["localStorage"].getItem("key");',
  ],
  invalid: [
    'localStorage.getItem("key");',
    'const value = { localStorage };',
    'sessionStorage.setItem("key", "value");',
    'window.localStorage.removeItem("key");',
    'globalThis["sessionStorage"].clear();',
    'const browser = window; browser.localStorage.getItem("key");',
    'window.window.localStorage.getItem("key");',
    'const storage = localStorage; storage.getItem("key");',
    'const { localStorage: storage } = window; storage.getItem("key");',
    'const { sessionStorage } = globalThis; sessionStorage.getItem("key");',
    'const { getItem } = localStorage; getItem("key");',
    '({ localStorage: storage } = window); storage.getItem("key");',
  ].map((code) => ({ code, errors: [{ messageId: 'storage' }] })),
});
