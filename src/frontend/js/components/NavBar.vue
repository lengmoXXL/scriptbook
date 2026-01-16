<template>
  <header class="navbar">
    <div class="navbar-brand">
      <h1>Scriptbook</h1>
    </div>
    <div class="navbar-controls">
      <div class="control-item">
        <select id="file-select" :value="currentFile" @change="onFileChange">
          <option value="" disabled>加载中...</option>
          <template v-if="files.length > 0">
            <option v-for="file in files" :key="file.name" :value="file.name">
              {{ file.name }} ({{ formatFileSize(file.size) }})
            </option>
          </template>
          <option v-else value="">没有找到markdown文件</option>
        </select>
      </div>
      <div class="control-item">
        <select id="plugin-select" :value="currentTheme" @change="onThemeChange">
          <option v-for="plugin in plugins" :key="plugin.name" :value="plugin.name">
            {{ plugin.description || plugin.name }}
          </option>
          <option v-if="plugins.length === 0" value="">无可用主题</option>
        </select>
      </div>
      <a href="https://github.com/lengmoXXL/scriptbook" target="_blank" class="github-link" title="GitHub">
        <svg height="20" width="20" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
      </a>
    </div>
  </header>
</template>

<script>
export default {
  name: 'NavBar',
  props: {
    files: {
      type: Array,
      default: () => []
    },
    plugins: {
      type: Array,
      default: () => []
    },
    currentFile: {
      type: String,
      default: ''
    },
    currentTheme: {
      type: String,
      default: 'theme-light'
    }
  },
  emits: ['select-file', 'select-theme'],
  setup(props, { emit }) {
    const formatFileSize = (bytes) => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const onFileChange = (e) => {
      emit('select-file', e.target.value)
    }

    const onThemeChange = (e) => {
      emit('select-theme', e.target.value)
    }

    return {
      formatFileSize,
      onFileChange,
      onThemeChange
    }
  }
}
</script>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: var(--navbar-bg, #f8f9fa);
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.navbar-brand h1 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary, #333);
}

.navbar-controls {
  display: flex;
  align-items: center;
  gap: 15px;
}

.control-item select {
  padding: 8px 12px;
  border: 1px solid var(--border-color, #ccc);
  border-radius: 4px;
  background: var(--bg-primary, #fff);
  color: var(--text-primary, #333);
  font-size: 14px;
  cursor: pointer;
  min-width: 150px;
}

.control-item select:focus {
  outline: none;
  border-color: var(--primary-color, #007bff);
}

.github-link {
  color: var(--text-primary, #333);
  display: flex;
  align-items: center;
  transition: opacity 0.2s;
}

.github-link:hover {
  opacity: 0.7;
}
</style>
