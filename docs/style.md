# 项目规范

- [文档里减少标题的使用](#文档里减少标题的使用)
- [文档尽可能简洁](#文档尽可能简洁)
- [代码应 fail fast](#代码应-fail-fast)
- [注释应描述为什么而不是做什么](#注释应描述为什么而不是做什么)

## 文档里减少标题的使用

## 文档尽可能简洁

## 代码应 fail fast

**错误示例** (静默失败)
```javascript
if (terminalContainer.value) {
  term.value.open(terminalContainer.value)
  // ... 其他初始化代码
}
// 如果 terminalContainer.value 为空，静默跳过
```

**正确示例** (快速失败)
```javascript
if (!terminalContainer.value) {
  console.error('Terminal container not found, component may not be mounted correctly')
  throw new Error('Terminal container missing: terminalContainer ref is null')
}

term.value.open(terminalContainer.value)
// ... 其他初始化代码
```

## 注释应描述为什么而不是做什么

**错误示例** (描述做什么)
```javascript
// Handle terminal input
term.value.onData((data) => {
  // Send as TermSocket format: ['stdin', data]
  socket.value.send(JSON.stringify(['stdin', data]))
})

// Handle terminal resize
term.value.onResize((size) => {
  // Send as TermSocket format: ['set_size', rows, cols]
  socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
})
```

**正确示例** (描述为什么)
```javascript
// TermSocket requires data to be formatted as ['stdin', data] for server processing
term.value.onData((data) => {
  socket.value.send(JSON.stringify(['stdin', data]))
})

// Server needs to know terminal dimensions for proper PTY allocation
term.value.onResize((size) => {
  socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
})
```

**冗余注释示例** (描述做什么)
```javascript
// Initialize counter variable
let count = 0

// Function to increment counter
function increment() {
  count += 1
}

// Call increment function
increment()
```

**精简后示例** (代码自解释)
```javascript
let count = 0

function increment() {
  count += 1
}

increment()
```
