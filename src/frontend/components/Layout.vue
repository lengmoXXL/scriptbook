<script setup>
import { ref, nextTick } from 'vue'
import FileList from './FileList.vue'
import Sandbox from './Sandbox.vue'

const sidebarWidth = ref(250)
const activeSandboxKey = ref('')

const sandboxStates = ref(new Map())

const sandboxRefs = {}

function getSandboxRef(key) {
    return sandboxRefs[key]
}

function setSandboxRef(key, el) {
    sandboxRefs[key] = el
}

function getSandboxState(key) {
    if (!sandboxStates.value.has(key)) {
        sandboxStates.value.set(key, {
            sandboxId: '',
            docPath: '/workspace',
            mdFile: ''
        })
    }
    return sandboxStates.value.get(key)
}

async function onSandboxFileSelect(selection) {
    const filename = selection.filename
    const sandboxId = selection.sandboxId
    const docPath = selection.docPath || '/workspace'

    const [sandboxConfigFile, mdFile] = filename.split(':')
    const key = sandboxConfigFile

    const state = getSandboxState(key)
    state.sandboxId = sandboxId
    state.docPath = docPath
    state.mdFile = mdFile

    activeSandboxKey.value = key

    await nextTick()
    const sandboxRef = getSandboxRef(key)
    // Only load markdown file if it's not empty
    if (sandboxRef && mdFile) {
        sandboxRef.loadMarkdownFile(mdFile)
    }
}

function startSidebarResize(event) {
    const startX = event.clientX
    const startWidth = sidebarWidth.value

    function onMouseMove(e) {
        const deltaX = e.clientX - startX
        let newWidth = startWidth + deltaX
        newWidth = Math.max(150, Math.min(500, newWidth))
        sidebarWidth.value = newWidth
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
}
</script>

<template>
    <div class="layout">
        <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
            <FileList @select="onSandboxFileSelect" />
        </div>
        <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
        <div class="main">
            <div class="content">
                <template v-if="activeSandboxKey">
                    <Sandbox
                        :ref="el => setSandboxRef(activeSandboxKey, el)"
                        :key="activeSandboxKey"
                        :sandbox-id="getSandboxState(activeSandboxKey).sandboxId"
                        :doc-path="getSandboxState(activeSandboxKey).docPath"
                        :initial-md-file="getSandboxState(activeSandboxKey).mdFile"
                    />
                </template>
                <template v-else>
                    <div class="empty-state">
                        <div class="empty-content">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 2v16a2 2 0 0 2 6a2 2 0 0 2 6a2 2 0 0 2-2 2h16a2 2 0 0 2 6a2 2 0 0 2-2V8z"></path>
                                <polyline points="14 2 16 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <h2>Select a sandbox file to get started</h2>
                            <p>Choose a markdown file from the sidebar to view and interact with its content</p>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout {
    display: flex;
    height: 100vh;
    width: 100vw;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

.sidebar {
    width: 250px;
    height: 100%;
    background-color: #1e1e1e;
}

.sidebar-resizer {
    width: 4px;
    height: 100%;
    background-color: #2a2a2a;
    border-left: 1px solid #333;
    cursor: col-resize;
    transition: background-color 0.2s;
}

.sidebar-resizer:hover {
    background-color: #555;
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #1e1e1e;
}

.empty-content {
    text-align: center;
    color: #666;
}

.empty-content svg {
    color: #444;
    margin-bottom: 16px;
}

.empty-content h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 500;
    color: #888;
}

.empty-content p {
    margin: 0;
    font-size: 14px;
    color: #666;
}
</style>
