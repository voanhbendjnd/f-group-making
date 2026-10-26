import '@testing-library/jest-dom/vitest';
import '@/locales/i18n';

// jsdom has no layout observer; Ant Design Tabs/Select use this browser API.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
