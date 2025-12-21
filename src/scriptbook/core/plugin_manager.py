import os
import json
import copy
from typing import List, Dict, Any, Optional
from scriptbook.models.schemas import PluginInfo

class PluginManager:
    """插件管理器"""

    def __init__(self, plugins_dir: str = "app/plugins"):
        self.plugins_dir = plugins_dir
        self._plugins_cache = None
        self._active_plugins = []

    def scan_plugins(self, force_refresh: bool = False) -> List[PluginInfo]:
        """扫描插件目录，返回所有可用插件"""
        # 如果有缓存且不强制刷新，返回缓存的副本
        if not force_refresh and self._plugins_cache is not None:
            return copy.deepcopy(self._plugins_cache)

        plugins = []

        if not os.path.exists(self.plugins_dir):
            os.makedirs(self.plugins_dir, exist_ok=True)
            return plugins

        for plugin_name in os.listdir(self.plugins_dir):
            plugin_path = os.path.join(self.plugins_dir, plugin_name)

            # 必须是目录
            if not os.path.isdir(plugin_path):
                continue

            manifest_path = os.path.join(plugin_path, "manifest.json")

            # 必须有manifest.json文件
            if not os.path.exists(manifest_path):
                continue

            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)

                # 验证必要字段
                if "name" not in manifest:
                    manifest["name"] = plugin_name

                plugin_info = PluginInfo(
                    name=manifest.get("name", plugin_name),
                    version=manifest.get("version", "1.0.0"),
                    description=manifest.get("description", ""),
                    type=manifest.get("type", "theme"),
                    css=manifest.get("css"),
                    js=manifest.get("js")
                )

                plugins.append(plugin_info)

            except (json.JSONDecodeError, IOError) as e:
                print(f"加载插件 {plugin_name} 失败: {e}")
                continue

        # 更新缓存
        self._plugins_cache = plugins
        return copy.deepcopy(plugins)

    def get_plugin(self, plugin_name: str) -> Optional[PluginInfo]:
        """获取指定插件信息"""
        plugins = self.scan_plugins(force_refresh=True)
        for plugin in plugins:
            if plugin.name == plugin_name:
                return plugin
        return None

    def activate_plugin(self, plugin_name: str) -> bool:
        """激活插件"""
        plugin = self.get_plugin(plugin_name)
        if not plugin:
            return False

        # 避免重复激活
        if plugin_name not in self._active_plugins:
            self._active_plugins.append(plugin_name)

        return True

    def deactivate_plugin(self, plugin_name: str) -> bool:
        """停用插件"""
        if plugin_name in self._active_plugins:
            self._active_plugins.remove(plugin_name)
            return True
        return False

    def get_active_plugins(self) -> List[str]:
        """获取当前激活的插件列表"""
        return self._active_plugins.copy()

    def get_active_plugins_info(self) -> List[PluginInfo]:
        """获取当前激活插件的详细信息"""
        active_plugins = []
        for plugin_name in self._active_plugins:
            plugin = self.get_plugin(plugin_name)
            if plugin:
                active_plugins.append(plugin)
        return active_plugins


# 创建全局插件管理器实例
plugin_manager = PluginManager()