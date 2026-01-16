# Scriptbook - Executable Markdown Server

[中文](README.md)

An online Markdown server with script execution support. Inspired by Jupyter Notebook, it allows embedding and running scripts directly within Markdown documents, making it ideal for SOP (Standard Operating Procedure) automation and interactive documentation.

## Features

- **Interactive Documents** - Embed executable scripts in Markdown, similar to Jupyter Notebook
- **Interactive Input** - Support user input during script execution (e.g., `read` command)
- **Real-time Execution** - WebSocket-based real-time script output streaming
- **Result Persistence** - Auto-restore script execution results after page refresh (localStorage)
- **Stop Execution** - Support terminating running scripts anytime
- **Multi-document Support** - Switch between multiple documents, results saved independently
- **Theme Switching** - Support for GitHub Light and GitHub Dark themes
- **Terminal Modal** - Script execution in a modal dialog with full-screen support
- **ANSI Color Support** - Script output colors and formatting displayed correctly in browser
- **SOP Automation** - Ideal for displaying and executing enterprise standard operating procedures
- **Comprehensive Testing** - 200+ tests covering unit, integration, and E2E tests

### Tech Stack

- **Backend**: Python 3.10+ / FastAPI / WebSocket
- **Frontend**: Vue 3 (Composition API) / Vite / xterm.js
- **Testing**: Jest / pytest / Playwright

## Screenshot

![Scriptbook Interface](docs/screenshot-2025-12-25.png)

## Quick Start

### Requirements
- Python 3.10+
- Modern browser

### Installation

```bash
# Direct installation (recommended)
pip install scriptbook

# Or install from source
git clone https://github.com/lengmoXXL/scriptbook.git
cd scriptbook
pip install .
```

### Usage

```bash
# Start the server (using default examples directory)
scriptbook examples/

# Specify a custom document directory
scriptbook /path/to/my/documents/

# Specify a port
scriptbook examples/ --port 9000

# Allow external access
scriptbook examples/ --host 0.0.0.0

# Access the application
open http://localhost:8000
```

**Note**: After modifying the code, please restart the server manually to apply changes.

## Package Information

### PyPI Installation

```bash
pip install scriptbook
```

**PyPI Link**: https://pypi.org/project/scriptbook/

### Version

- Current Version: 1.6.2
- Python Requirement: >=3.10
- Full changelog: [changelog.md](docs/changelog.md)

### License

MIT License

### GitHub Repository

- Source Code: https://github.com/lengmoXXL/scriptbook
- Issues: https://github.com/lengmoXXL/scriptbook/issues

## Testing

This project includes a comprehensive test suite with 200+ test cases.

### Test Types

#### 1. JavaScript Unit Tests (109)
Run with Jest + JSDOM:
```bash
cd src/tests/js
npm test
```

#### 2. Python Unit Tests (70)
Run with pytest:
```bash
pytest src/tests/ -v
```

#### 3. Python Integration Tests (13)
```bash
pytest src/integration_tests/ -v
```

#### 4. Playwright E2E Tests
Real browser testing with Playwright:
```bash
# Install Playwright
npm install -D @playwright/test playwright

# Run E2E tests
npx playwright test test/e2e.test.mjs

# Run integration tests
npx playwright test test/integration.test.mjs
```

### Test Files

- **JavaScript Tests** (`src/tests/js/`):
  - `app.test.js`: App class tests (25)
  - `terminal-manager.test.js`: Terminal manager tests (26)
  - `plugin-loader.test.js`: Plugin loader tests (16)
  - `script-results-persistence.test.js`: Persistence tests (9)
  - `script-results-persistence-integration.test.js`: Integration tests (7)
  - `websocket-concurrency.test.js`: WebSocket concurrency tests (8)
  - `script-stop-functionality.test.js`: Stop functionality tests (12)

- **Playwright Tests** (`test/`):
  - `e2e.test.mjs`: E2E tests for interactive input scenarios
  - `integration.test.mjs`: Integration tests for full user flows

## Development Guide

### Local Development

```bash
# Clone the repository
git clone https://github.com/lengmoXXL/scriptbook.git
cd scriptbook

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -e .
pip install -r requirements-test.txt

# Install JavaScript test dependencies (only needed for testing)
cd src/tests/js
npm install

# Return to root directory
cd /path/to/scriptbook

# Run all tests
pytest src/ src/integration_tests/ -v
```

### Frontend Development

```bash
# Install Node.js dependencies
npm install

# Start dev server (Vite)
npm run dev

# Build for production
npm run build
```

Frontend tech stack:
- **Vue 3** - Composition API
- **Vite** - Build tool
- **xterm.js** - Terminal emulator

### Publish to PyPI

```bash
# Build the package
python -m build

# Upload to PyPI
twine upload dist/*
```

Or use GitHub Actions for automated publishing.

---

**Scriptbook** - Making documents easier to understand and execute
