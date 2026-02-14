<script setup>
const props = defineProps({
    tabs: {
        type: Array,
        required: true
    },
    activeTabId: {
        type: String,
        default: null
    }
})

const emit = defineEmits(['select', 'close'])

function getTabName(tab) {
    return tab.filename
}
</script>

<template>
    <div class="tab-bar">
        <div
            v-for="tab in tabs"
            :key="tab.id"
            class="tab-item"
            :class="{ active: tab.id === activeTabId }"
            @click="emit('select', tab.id)"
        >
            <span class="tab-name">{{ getTabName(tab) }}</span>
            <button class="tab-close" @click.stop="emit('close', tab.id)">×</button>
        </div>
        <div v-if="tabs.length === 0" class="tab-placeholder">
            No file selected
        </div>
    </div>
</template>

<style scoped>
.tab-bar {
    display: flex;
    align-items: center;
    min-height: 32px;
    background-color: #252526;
    border-bottom: 1px solid #444;
    overflow-x: auto;
    flex-shrink: 0;
}

.tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background-color: #2d2d2d;
    border-right: 1px solid #444;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s;
}

.tab-item:hover {
    background-color: #3c3c3c;
}

.tab-item.active {
    background-color: #1e1e1e;
    border-bottom: 2px solid #007acc;
}

.tab-name {
    font-size: 12px;
    color: #ccc;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
}

.tab-item.active .tab-name {
    color: #fff;
}

.tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: #888;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s;
}

.tab-item:hover .tab-close {
    opacity: 1;
}

.tab-close:hover {
    background-color: #555;
    color: #fff;
}

.tab-placeholder {
    padding: 6px 12px;
    font-size: 12px;
    color: #666;
}
</style>
