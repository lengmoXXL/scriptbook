import { ref, readonly } from 'vue'

const errorMessage = ref('')
const showError = ref(false)

function showErrorModal(message) {
    errorMessage.value = message
    showError.value = true
}

function hideErrorModal() {
    showError.value = false
    errorMessage.value = ''
}

export function useError() {
    return {
        errorMessage: readonly(errorMessage),
        showError: readonly(showError),
        showErrorModal,
        hideErrorModal
    }
}
