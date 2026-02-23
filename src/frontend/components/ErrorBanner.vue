<script setup>
import { inject, computed } from 'vue'

const errorHandler = inject('errorHandler')

// 使用 computed 确保响应式追踪
const isVisible = computed(() => errorHandler.isVisible.value)
const errorMessage = computed(() => errorHandler.errorMessage.value)
</script>

<template>
    <div v-if="isVisible" class="error-banner" @click="errorHandler.hideError">
        <span class="error-banner-message">{{ errorMessage }}</span>
        <button class="error-banner-close" @click.stop="errorHandler.hideError">
            ×
        </button>
    </div>
</template>

<style scoped>
.error-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background-color: #b91c1c;
    color: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 9999;
    cursor: pointer;
}

.error-banner-message {
    flex: 1;
    font-size: 14px;
    line-height: 1.5;
}

.error-banner-close {
    background: none;
    border: none;
    color: white;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    opacity: 0.8;
}

.error-banner-close:hover {
    opacity: 1;
}
</style>
