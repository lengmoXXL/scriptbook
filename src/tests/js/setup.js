// Jest 设置文件
// 在每个测试之前设置全局环境

// 模拟 DOM 环境
document.body.innerHTML = `
  <div id="file-select"></div>
  <div id="current-file"></div>
  <div id="markdown-content"></div>
`;

// 模拟 fetch
global.fetch = jest.fn();

// 模拟 WebSocket
global.WebSocket = jest.fn(() => ({
  close: jest.fn(),
  send: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1,
  OPEN: 1,
}));

// 模拟 Clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn(),
  },
  writable: true,
});

// 模拟 console
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};