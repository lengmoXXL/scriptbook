import { ref, computed } from 'vue'

let tabIdCounter = 0

function generateTabId() {
    return `tab-${++tabIdCounter}`
}

export function useTabs() {
    const tabs = ref([])
    const activeTabId = ref(null)

    const activeTab = computed(() =>
        tabs.value.find(t => t.id === activeTabId.value) || null
    )

    function findTab(filename) {
        return tabs.value.find(t => t.filename === filename)
    }

    function openTab(filename, options = {}) {
        const newTab = {
            id: generateTabId(),
            filename,
            ...options
        }

        tabs.value.push(newTab)
        activeTabId.value = newTab.id
        return newTab
    }

    function closeTab(id) {
        const index = tabs.value.findIndex(t => t.id === id)
        if (index === -1) return

        tabs.value.splice(index, 1)

        if (activeTabId.value === id) {
            if (tabs.value.length > 0) {
                const newIndex = Math.min(index, tabs.value.length - 1)
                activeTabId.value = tabs.value[newIndex].id
            } else {
                activeTabId.value = null
            }
        }
    }

    function selectTab(id) {
        const tab = tabs.value.find(t => t.id === id)
        if (tab) {
            activeTabId.value = id
        }
    }

    return {
        tabs,
        activeTabId,
        activeTab,
        findTab,
        openTab,
        closeTab,
        selectTab
    }
}
