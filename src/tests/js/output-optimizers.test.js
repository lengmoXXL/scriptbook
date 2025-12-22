/**
 * Scriptbook 输出优化器测试
 * 测试 ANSI 转义序列解析功能
 */

describe('ANSI 解析器', () => {
  // 在每个测试前加载 ANSI 解析器
  beforeEach(() => {
    // 设置全局 window 对象
    global.window = {
      location: { host: 'localhost:8888' }
    };

    // 定义 ansiHTML 函数
    global.window.ansiHTML = function(text) {
      // 模拟 ansiHTML 函数
      // 简单的 ANSI 序列替换（支持字面和转义字符）
      return text
        .replace(/\[1;32m/g, '<span style="color: green; font-weight: bold;">')
        .replace(/\[1;33m/g, '<span style="color: yellow; font-weight: bold;">')
        .replace(/\[1;31m/g, '<span style="color: red; font-weight: bold;">')
        .replace(/\[0m/g, '</span>')
        .replace(/\x1b\[1;32m/g, '<span style="color: green; font-weight: bold;">')
        .replace(/\x1b\[1;33m/g, '<span style="color: yellow; font-weight: bold;">')
        .replace(/\x1b\[1;31m/g, '<span style="color: red; font-weight: bold;">')
        .replace(/\x1b\[0m/g, '</span>');
    };

    // 加载 ANSI 解析器
    require('../../scriptbook/static/js/output-optimizers/ansi-parser.js');
  });

  describe('hasAnsiSequences', () => {
    test('应该检测到 ANSI 转义序列', () => {
      const text = '[1;32m绿色文本[0m';
      const result = global.window.OutputOptimizers.ansiParser.hasAnsiSequences(text);
      expect(result).toBe(true);
    });

    test('应该检测到 \\x1b 开头的 ANSI 序列', () => {
      const text = '\x1b[32m绿色文本\x1b[0m';
      const result = global.window.OutputOptimizers.ansiParser.hasAnsiSequences(text);
      expect(result).toBe(true);
    });

    test('应该检测到 \\033 开头的 ANSI 序列', () => {
      const text = String.fromCharCode(27) + '[32m绿色文本' + String.fromCharCode(27) + '[0m';
      const result = global.window.OutputOptimizers.ansiParser.hasAnsiSequences(text);
      expect(result).toBe(true);
    });

    test('应该检测不到普通文本中的 ANSI 序列', () => {
      const text = '这是普通文本';
      const result = global.window.OutputOptimizers.ansiParser.hasAnsiSequences(text);
      expect(result).toBe(false);
    });

    test('应该处理空字符串', () => {
      const text = '';
      const result = global.window.OutputOptimizers.ansiParser.hasAnsiSequences(text);
      expect(result).toBe(false);
    });
  });

  describe('processText', () => {
    test('应该转换包含 ANSI 序列的文本', () => {
      const text = '[1;32m成功[0m';
      const result = global.window.OutputOptimizers.ansiParser.processText(text);
      expect(result).toBe('<span style="color: green; font-weight: bold;">成功</span>');
    });

    test('应该保持普通文本不变', () => {
      const text = '普通文本';
      const result = global.window.OutputOptimizers.ansiParser.processText(text);
      expect(result).toBe('普通文本');
    });

    test('应该处理多行 ANSI 序列', () => {
      const text = '[1;32m成功[0m\n[1;31m错误[0m';
      const result = global.window.OutputOptimizers.ansiParser.processText(text);
      expect(result).toBe('<span style="color: green; font-weight: bold;">成功</span>\n<span style="color: red; font-weight: bold;">错误</span>');
    });

    test('应该处理非字符串输入', () => {
      const result1 = global.window.OutputOptimizers.ansiParser.processText(null);
      expect(result1).toBeNull();

      const result2 = global.window.OutputOptimizers.ansiParser.processText(undefined);
      expect(result2).toBeUndefined();

      const result3 = global.window.OutputOptimizers.ansiParser.processText(123);
      expect(result3).toBe(123);
    });
  });

  describe('集成测试', () => {
    beforeEach(() => {
      // 加载 app.js
      require('../../scriptbook/static/js/app.js');
    });

    test('addScriptOutput 应该正确处理 ANSI 序列', () => {
      // 创建 DOM 元素
      document.body.innerHTML = '<div id="output-test"></div>';

      // 模拟 App 实例的方法
      global.window.app.currentFile = 'test.md';

      // 调用 addScriptOutput
      global.window.app.addScriptOutput('test', 'stdout', '[1;32m✓ 成功[0m');

      // 验证输出
      const outputElement = document.getElementById('output-test');
      expect(outputElement.innerHTML).toContain('✓ 成功');
      expect(outputElement.innerHTML).toContain('style="color: green');
    });

    test('addScriptOutput 应该正确处理普通文本', () => {
      // 创建 DOM 元素
      document.body.innerHTML = '<div id="output-test2"></div>';

      // 模拟 App 实例的方法
      global.window.app.currentFile = 'test.md';

      // 调用 addScriptOutput
      global.window.app.addScriptOutput('test2', 'stdout', '普通文本');

      // 验证输出
      const outputElement = document.getElementById('output-test2');
      expect(outputElement.innerHTML).toContain('普通文本');
    });
  });
});
