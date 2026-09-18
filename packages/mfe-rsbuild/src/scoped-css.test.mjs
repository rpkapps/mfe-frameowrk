import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { scopedCss } from './scoped-css.mjs';

function transform(source, scope = 'discovery') {
  return postcss([scopedCss(scope)]).process(source, { from: undefined });
}

describe('remote CSS boundaries', () => {
  it('keeps authored selectors and shell token references inside a nested mount boundary', async () => {
    const result = await transform(
      '@layer utilities { @media (width > 600px) { .text-sm { color: var(--foreground); } } }',
    );

    expect(result.css).toContain('@scope ([data-mfe-scope="discovery"]) to ([data-mfe-scope])');
    expect(result.css).toContain('.text-sm { color: var(--foreground); }');
    expect(result.root.nodes).toHaveLength(1);
    expect(result.root.first.name).toBe('scope');
  });

  it('gives remote animations and Tailwind registrations independent names', async () => {
    const source = `
      @property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0; }
      @keyframes pulse { to { opacity: 0.5; } }
      .card { --tw-shadow: 2px 2px black; box-shadow: var(--tw-shadow); animation: pulse 1s; }
    `;
    const [discovery, geology] = await Promise.all([
      transform(source),
      transform(source, 'geology'),
    ]);

    expect(discovery.css).toContain('@keyframes mfe-discovery-pulse');
    expect(discovery.css).toContain('animation: mfe-discovery-pulse 1s');
    expect(discovery.css).toContain('var(--mfe-discovery-tw-shadow)');
    expect(discovery.root.first.params).toBe('--mfe-discovery-tw-shadow');
    expect(geology.css).toContain('@keyframes mfe-geology-pulse');
    expect(geology.css).not.toContain('mfe-discovery');
  });

  it.each([
    ':root { --foreground: red; }',
    'html.dark body { background: red; }',
    '@font-face { font-family: unsafe; src: url(font.woff2); }',
    '@import "global.css";',
    '@property --foreground { syntax: "<color>"; inherits: true; initial-value: red; }',
  ])('rejects shell-owned global CSS: %s', async (source) => {
    await expect(transform(source)).rejects.toThrow(/MFE|shell/);
  });

  it.each([undefined, '', 'BadName', 'app"]){body{color:red}}'])(
    'rejects an invalid scope: %s',
    (scope) => {
      expect(() => scopedCss(scope)).toThrow('MFE scope');
    },
  );
});
