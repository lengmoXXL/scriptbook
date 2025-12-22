# Scriptbook 更新日志

## [1.2.0] - 2025-12-22

### 📚 新增功能
- **发布流程文档**: 新增RELEASE_PROCESS.md，规范化代码整理和发布流程
- **项目结构文档**: 新增CLAUDE.md，详细说明项目目录结构
- **更新日志文档**: 新增CHANGELOG.md，完整记录版本变更

### 🔧 技术改进
- **项目结构优化**: 清理开发过程文档，整理docs/testing/目录
- **文档体系完善**: 建立README、CHANGELOG、RELEASE_PROCESS、CLAUDE四大文档体系
- **发布流程简化**: 优化RELEASE_PROCESS.md，从6KB简化为2KB，提高可读性

### 🎨 界面改进
- 无

### 📚 文档更新
- 更新README.md添加v1.2.0功能说明
- 创建完整的文档导航体系

### 🧪 测试增强
- 无

### 🔧 工具改进
- 无

## [1.1.0] - 2025-12-22

### ✨ 新增功能
- **脚本结果持久化**: 页面刷新后自动恢复脚本执行结果（使用localStorage）
- **停止脚本执行**: 点击红色停止按钮立即终止正在执行的脚本
- **WebSocket并发优化**: 改进连接处理，支持页面刷新场景

### 🐛 错误修复
- 修复WebSocket "Unexpected ASGI message" 错误
- 修复停止按钮不可见问题
- 改进异常处理和资源清理

### 🧪 测试增强
- 新增25个JavaScript测试用例
- 总测试数更新为138个（61 JS + 64 Python + 13 集成）
- 新增测试文件：
  - `script-results-persistence.test.js` - 结果持久化测试
  - `script-results-persistence-integration.test.js` - 集成测试
  - `websocket-concurrency.test.js` - 并发处理测试
  - `script-stop-functionality.test.js` - 停止功能测试

### 🎨 界面改进
- 停止按钮：红色背景 + 白色边框，清晰可见
- 按钮状态：执行时启用，停止后恢复
- 视觉反馈：显示"=== 脚本已被用户停止 ==="

### 📚 文档更新
- 更新README.md，添加新功能说明
- 创建PROJECT_STRUCTURE.md项目结构文档
- 移动测试文档到`docs/testing/`目录

### 🔧 技术改进
- 前端：`app.js`添加持久化和停止逻辑
- 后端：`scripts.py`改进WebSocket错误处理
- 样式：`main.css`修复按钮可见性
- 渲染：`markdown.py`添加内联样式确保显示

## [1.0.0] - 2025-12-21

### ✨ 初始版本
- 项目重命名为Scriptbook
- 交互式输入功能（stdin支持）
- WebSocket实时输出流
- 多文档支持
- 主题切换（明亮/暗色）
- 25个JavaScript单元测试
- 64个Python单元测试
- 13个集成测试

---

## 测试覆盖率详情

### JavaScript测试 (61个)
- App类基础功能：25个
- 脚本结果持久化：9个
- 脚本结果持久化集成：7个
- WebSocket并发处理：8个
- 脚本停止功能：12个

### Python测试 (64个)
- 文件扫描：15个
- Markdown解析：20个
- 插件管理：15个
- 脚本执行：14个

### 集成测试 (13个)
- WebSocket集成：8个
- 端到端测试：5个

**总测试数：138个，全部通过 ✅**

## 贡献者

- **lzy** - 初始开发和所有功能实现

## 许可证

MIT License
