// The real-extension test must never discover or change a developer's existing native host.
export function assertIsolatedExtensionTestPlatform(platform) {
  if (platform !== 'linux') throw new Error('The isolated extension automation runs on Linux only. Use the documented manual macOS Chrome checks.');
}
