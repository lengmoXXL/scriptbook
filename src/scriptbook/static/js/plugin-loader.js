// 插件加载器 - 主题管理

class PluginLoader {
    constructor() {
        this.activeTheme = localStorage.getItem('scriptbook_theme') || 'default';
        this.plugins = [];
        this.loadedStylesheets = [];
    }

    async init() {
        console.log('插件加载器初始化...');
        await this.loadPlugins();
        this.bindEvents();
        // 恢复保存的主题
        this.restoreTheme();
        console.log('插件加载器初始化完成');
    }

    restoreTheme() {
        const savedTheme = localStorage.getItem('scriptbook_theme') || 'default';
        this.switchTheme(savedTheme);
        // 更新选择器值
        const select = document.getElementById('plugin-select');
        if (select) {
            select.value = savedTheme;
        }
    }

    async loadPlugins() {
        try {
            const response = await fetch('/api/plugins');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            this.plugins = await response.json();
            this.updateThemeSelect();
            return this.plugins;
        } catch (error) {
            console.error('加载插件列表失败:', error);
            return [];
        }
    }

    updateThemeSelect() {
        const select = document.getElementById('plugin-select');
        if (!select) return;

        select.innerHTML = '';

        this.plugins.forEach(plugin => {
            const option = document.createElement('option');
            option.value = plugin.name;
            option.textContent = plugin.description || plugin.name;
            if (plugin.name === 'default') {
                option.selected = true;
            }
            select.appendChild(option);
        });

        if (this.plugins.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '无可用主题';
            select.appendChild(defaultOption);
        }
    }

    bindEvents() {
        const select = document.getElementById('plugin-select');
        if (select) {
            select.addEventListener('change', (e) => {
                this.switchTheme(e.target.value);
            });
        }
    }

    switchTheme(themeName) {
        console.log('切换主题:', themeName);

        // 保存到 localStorage
        localStorage.setItem('scriptbook_theme', themeName);

        // 移除所有已加载的主题样式表（包括暗色主题）
        this.loadedStylesheets.forEach(link => {
            if (link && link.parentNode) {
                link.parentNode.removeChild(link);
            }
        });
        this.loadedStylesheets = [];

        // 额外清除所有暗色主题相关的CSS链接
        const allLinks = document.querySelectorAll('link[href*="dark-theme"], link[href*="dark"]');
        allLinks.forEach(link => {
            if (link.parentNode) {
                link.parentNode.removeChild(link);
            }
        });

        // 如果是默认主题，重置样式
        if (themeName === 'default' || !themeName) {
            // 重置body样式
            document.body.style.backgroundColor = '';
            document.body.style.color = '';
            // 重置main样式
            const mainEl = document.querySelector('main');
            if (mainEl) {
                mainEl.style.backgroundColor = '';
                mainEl.style.color = '';
            }

            this.activeTheme = 'default';
            console.log('已切换到默认主题');
        } else {

        // 加载新主题的CSS
        const plugin = this.plugins.find(p => p.name === themeName);
        if (plugin) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = `/static/plugins/${themeName}/style.css`;
            // 添加data-theme属性便于追踪
            link.setAttribute('data-theme', themeName);
            document.head.appendChild(link);
            this.loadedStylesheets.push(link);
            this.activeTheme = themeName;

            // 强制设置样式（确保覆盖）
            setTimeout(() => {
                if (themeName === 'dark-theme') {
                    document.body.style.backgroundColor = '#0f172a';
                    document.body.style.color = '#e2e8f0';
                    const mainEl = document.querySelector('main');
                    if (mainEl) {
                        mainEl.style.backgroundColor = '#0f172a';
                        mainEl.style.color = '#e2e8f0';
                    }
                }
            }, 100);

            console.log('已加载主题:', themeName);
        }
        }
    }
}

// 创建全局插件加载器实例
window.pluginLoader = new PluginLoader();

// 页面加载完成后初始化插件加载器
document.addEventListener('DOMContentLoaded', async () => {
    await window.pluginLoader.init();
});
