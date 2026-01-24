# 项目规范

- [文档里减少标题的使用](#文档里减少标题的使用)
- [文档尽可能简洁](#文档尽可能简洁)
- [代码应 fail fast](#代码应-fail-fast)
- [注释规范](#注释规范)

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

## 注释规范

注释不要描述做什么，如果代码足够自解释，需要把多余的注释删除，否则可以描述为什么这么做

```javascript
// bad
// Handle terminal resize
term.value.onResize((size) => {
  // Send as TermSocket format: ['set_size', rows, cols]
  socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
})

// good
// Server needs to know terminal dimensions for proper PTY allocation
term.value.onResize((size) => {
  socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
})

// good
term.value.onResize((size) => {
  socket.value.send(JSON.stringify(['set_size', size.rows, size.cols]))
})
```
