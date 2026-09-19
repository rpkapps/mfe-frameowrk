# mfe/no-widget-global-effects

Reports browser history navigation and direct document title, metadata, or
favicon mutations in explicitly configured Widget source files. Configure the
scope in the project ESLint flat config:

```js
import mfe from '@company/eslint-plugin-mfe';

export default [...mfe.configs.authorWidget(['src/panels/**'])];
```

The rule intentionally covers known direct syntax only. Mount navigation and
host services remain the supported route for effects that belong to the shell.
