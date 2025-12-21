# Scriptbook - Executable Markdown Server

[中文](README.md)

An online Markdown server with script execution support. Inspired by Jupyter Notebook, it allows embedding and running scripts directly within Markdown documents, making it ideal for SOP (Standard Operating Procedure) automation and interactive documentation.

## Features

- **Interactive Documents** - Embed executable scripts in Markdown, similar to Jupyter Notebook
- **Interactive Input** - Support user input during script execution (e.g., `read` command)
- **Real-time Execution** - WebSocket-based real-time script output streaming
- **Independent Output** - Each script block has its own output area below
- **Multi-document Support** - Switch between multiple documents
- **Theme Switching** - Support for light and dark themes
- **SOP Automation** - Ideal for displaying and executing enterprise standard operating procedures
- **Comprehensive Testing** - Includes 102 unit and integration tests

## Screenshot

![Scriptbook Interface](docs/screenshot.png)

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
# Start the server (using default content directory)
scriptbook content/

# Specify a custom document directory
scriptbook /path/to/my/documents/

# Specify a port
scriptbook content/ --port 9000

# Allow external access
scriptbook content/ --host 0.0.0.0

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

- Current Version: 1.0.0
- Python Requirement: >=3.10

### Changelog

#### v1.0.0 (2025-12-21)
- Project renamed to Scriptbook
- Added interactive input feature, supporting user input during script execution
- Added 25 JavaScript unit tests
- Reorganized test directory structure for unified test file management
- Optimized WebSocket communication with stdin bidirectional interaction support
- All 102 tests passed

### License

MIT License

### GitHub Repository

- Source Code: https://github.com/lengmoXXL/scriptbook
- Issues: https://github.com/lengmoXXL/scriptbook/issues

## Testing

This project includes a comprehensive test suite with a total of 102 test cases.

### Run All Tests

```bash
# Run all tests (unit tests + integration tests)
pytest src/ src/integration_tests/ -v
```

### Run Tests Separately

```bash
# Python unit tests
pytest src/tests/ -v

# JavaScript unit tests
cd src/tests/js
npm test

# Integration tests
pytest src/integration_tests/ -v
```

### Test Coverage

- **JavaScript Tests**: 25 test cases (using Jest + JSDOM)
- **Python Unit Tests**: 64 test cases
- **Integration Tests**: 13 test cases
- **Total Tests**: 102, all passing

Test Coverage Includes:
- App class initialization and basic functionality
- Global functions (executeScript, copyCode, sendInput)
- WebSocket event handling
- File scanning and Markdown parsing
- Plugin management system
- Script executor
- Interactive input functionality

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
