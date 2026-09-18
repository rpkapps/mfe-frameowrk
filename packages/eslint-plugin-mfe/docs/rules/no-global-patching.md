# mfe/no-global-patching

Shared browser APIs belong to the page. Replacing them changes every application and can leak authenticated requests or break independent router/listener ownership.

The rule rejects direct assignment/deletion (including destructuring assignments), `Object.assign`, `Object.defineProperty`, `Object.defineProperties`, `Reflect.defineProperty`, and `Reflect.set` for global fetch, History methods, and global event-listener methods. It follows lexical bindings, immutable aliases, direct destructuring, namespace access, string-literal member names, and transparent TypeScript assertions. Shadowed globals and unrelated local methods are allowed.

Invalid:

```js
const navigation = window.history;
navigation.pushState = synchronizeRouters;
Object.defineProperty(globalThis, 'fetch', { value: authenticatedFetch });
```

Valid:

```js
const request = createOwnedRequestService();
window.addEventListener('popstate', onPopState);
// The owning lifecycle removes this subscription on disposal.
window.removeEventListener('popstate', onPopState);

function configure(testWindow) {
  testWindow.fetch = fakeFetch;
}
```

Repair by using the framework's explicit navigation/request service or a normal owned subscription. A local test double may replace its own methods. Patches reproduced in dependency feasibility tests require a local, explained exception; they do not authorize production patches.

There is no autofix: choosing a replacement service and preserving cleanup cannot be inferred safely. Dynamic aliases, runtime-computed property names, prototype manipulation, and arbitrary helper implementations are not fully analyzed. This is a focused correctness check, not a security sandbox or proof that third-party code never patches globals.
