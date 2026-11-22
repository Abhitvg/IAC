import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JavaSandboxPanel } from '../src/components/teleprompter/JavaSandboxPanel';

describe('Java sandbox panel', () => {
  it('is collapsed by default and requires an explicit acknowledgement before execution', () => {
    const markup = renderToString(
      React.createElement(JavaSandboxPanel, { sourceCode: 'class Main {}' })
    );
    expect(markup).toContain('Check Java in local sandbox');
    expect(markup).toContain('Open');
    expect(markup).not.toContain('Compile / run Java');
    expect(markup).not.toContain('I understand this executes generated code');
  });
});
