import { describe, expect, it } from 'vitest';
import { assertIsolatedExtensionTestPlatform } from './browser-platform.mjs';

describe('real extension test isolation',()=>{
  it('runs only where the temporary native-host registration is isolated',()=>{
    expect(()=>assertIsolatedExtensionTestPlatform('linux')).not.toThrow();
    expect(()=>assertIsolatedExtensionTestPlatform('darwin')).toThrow(/Linux|manual/i);
    expect(()=>assertIsolatedExtensionTestPlatform('win32')).toThrow(/Linux|manual/i);
  });
});
