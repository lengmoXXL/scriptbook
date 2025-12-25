/**
 * TerminalManager - 管理 xterm.js 终端实例
 * 负责创建终端、处理 ANSI 转义序列、持久化等
 */
class TerminalManager {
    constructor() {
        this.terminals = new Map(); // scriptId -> { term, fitAddon }
        this.fitAddon = null;
    }

    /**
     * 初始化 FitAddon（需要在 xterm 加载后调用）
     */
    init(addon) {
        this.fitAddon = addon;
    }

    /**
     * 获取当前主题名称
     * @returns {string} 主题名称，如 'theme-light', 'theme-dark'
     */
    getCurrentThemeName() {
        if (window.pluginLoader) {
            return window.pluginLoader.activeTheme || 'theme-light';
        }
        return localStorage.getItem('scriptbook_theme') || 'theme-light';
    }

    /**
     * 获取当前主题的终端配色
     * @returns {object} terminal theme 配置
     */
    getTerminalTheme() {
        // 优先从插件加载器获取
        if (window.pluginLoader) {
            return window.pluginLoader.getTerminalTheme();
        }
        // 回退到本地插件列表
        if (window.plugins) {
            const currentTheme = this.getCurrentThemeName();
            const plugin = window.plugins.find(p => p.name === currentTheme);
            if (plugin && plugin.terminalTheme) {
                return plugin.terminalTheme;
            }
        }
        // 默认返回 light 主题配置
        return {
            background: '#ffffff',
            foreground: '#333333',
            cursor: '#333333',
            cursorAccent: '#ffffff',
            selectionBackground: '#b4d5ff'
        };
    }

    /**
     * 为指定脚本创建终端
     * @param {string} scriptId - 脚本ID
     * @param {HTMLElement} container - 终端容器元素
     */
    createTerminal(scriptId, container) {
        if (this.terminals.has(scriptId)) {
            this.disposeTerminal(scriptId);
        }

        // 从当前主题获取终端配色
        const terminalTheme = this.getTerminalTheme();

        // 创建终端实例（使用 Canvas renderer 以获得更好的滚动体验）
        const term = new window.Terminal({
            cursorBlink: false, // 禁用闪烁，避免视觉干扰
            cursorStyle: 'block', // 使用方块光标
            convertEol: true, // 转换 \n 为 \r\n
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', monospace",
            fontSize: 13,
            rendererType: 'canvas', // 使用 Canvas renderer
            theme: terminalTheme,
            rows: 10,
            allowTransparency: true,
            scrollback: 1000, // 滚动缓冲区大小
            wraparoundLinesEnabled: false, // 禁用自动换行
        });

        // 挂载到容器
        term.open(container);

        term.write('\x1b[2m执行结果将显示在这里...\x1b[0m\r\n');

        // 保存终端实例
        this.terminals.set(scriptId, { term });

        // 如果有 FitAddon，应用适配
        if (this.fitAddon) {
            this.fitAddon.fit();
        }

        return term;
    }

    /**
     * 获取终端实例
     * @param {string} scriptId - 脚本ID
     */
    getTerminal(scriptId) {
        const terminal = this.terminals.get(scriptId);
        return terminal ? terminal.term : null;
    }

    /**
     * 向终端写入内容（支持 ANSI 转义序列）
     * @param {string} scriptId - 脚本ID
     * @param {string} content - 要写入的内容
     */
    write(scriptId, content) {
        const term = this.getTerminal(scriptId);
        if (term) {
            term.write(content);
        }
    }

    /**
     * 向终端写入一行内容
     * @param {string} scriptId - 脚本ID
     * @param {string} content - 要写入的内容
     * @param {string} type - 输出类型 (stdout, stderr, stdin)
     */
    writeln(scriptId, content, type = 'stdout') {
        const term = this.getTerminal(scriptId);
        if (!term) return;

        // 根据类型添加颜色标记
        let prefix = '';
        if (type === 'stderr') {
            prefix = '\x1b[31m'; // 红色
        } else if (type === 'stdin') {
            prefix = '\x1b[36m'; // 青色
        } else if (type === 'exit') {
            prefix = '\x1b[33m'; // 黄色
        }

        const suffix = (type === 'stderr' || type === 'exit') ? '\x1b[0m' : '';

        term.write(`${prefix}${content}${suffix}\r\n`);
    }

    /**
     * 清除终端内容
     * @param {string} scriptId - 脚本ID
     */
    clear(scriptId) {
        const term = this.getTerminal(scriptId);
        if (term) {
            term.clear();
        }
    }

    /**
     * 重置终端
     * @param {string} scriptId - 脚本ID
     */
    reset(scriptId) {
        const term = this.getTerminal(scriptId);
        if (term) {
            term.reset();
        }
    }

    /**
     * 获取终端原始内容（用于持久化）
     * @param {string} scriptId - 脚本ID
     */
    getContent(scriptId) {
        const term = this.getTerminal(scriptId);
        if (term) {
            return term.getContent();
        }
        return '';
    }

    /**
     * 获取终端缓冲区行数
     * @param {string} scriptId - 脚本ID
     */
    getRows(scriptId) {
        const term = this.getTerminal(scriptId);
        if (term) {
            return term.rows;
        }
        return 0;
    }

    /**
     * 释放终端实例
     * @param {string} scriptId - 脚本ID
     */
    disposeTerminal(scriptId) {
        const terminal = this.terminals.get(scriptId);
        if (terminal) {
            try {
                terminal.term.dispose();
            } catch (e) {
                console.warn('释放终端失败:', e);
            }
            this.terminals.delete(scriptId);
        }
    }

    /**
     * 释放所有终端
     */
    disposeAll() {
        this.terminals.forEach((_, scriptId) => {
            this.disposeTerminal(scriptId);
        });
    }

    /**
     * 应用主题
     * @param {string} theme - 主题类型 ('light' 或 'dark')
     */
    applyTheme(theme) {
        // 从插件配置获取终端配色
        const terminalTheme = this.getTerminalTheme();
        this.terminals.forEach((terminal) => {
            const term = terminal.term;
            term.options.theme = terminalTheme;
            // 强制刷新 Canvas renderer
            term.refresh(0, term.rows - 1);
        });
    }
}

// 导出到全局
window.TerminalManager = TerminalManager;
