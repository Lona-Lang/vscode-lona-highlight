# Lona Highlight

`Lona Highlight` 是一个面向 VS Code 的 Lona 语言扩展，提供 `.lo` 文件识别、语法高亮与语义高亮支持。

本项目以当前 Lona 语言文档和语法实现为依据整理而成，主要参考：

- `../lona/grammar/*.lex`
- `../lona/grammar/*.yacc`
- `../lona/docs/language/*.md`

## 功能概览

当前版本覆盖以下语言元素：

- `.lo` 文件类型识别与基础编辑器配置
- `//` 注释、字符串、字符与数值字面量
- `def`、`struct`、`trait`、`impl`、`var`、`const`、`ref`、`set`、`dyn`、`if`、`for`、`ret` 等关键字
- `#[extern]`、`#[repr "C"]` 等 tag line
- 内建类型、自定义类型、点分类型、tuple type、函数指针类型、`Trait dyn`
- `struct Box[T Hash]`、`def hash_one[T Hash](...)`、`impl[T Hash] Box[T]: Hash` 等单 bound 泛型声明头
- 数组、指针、`const` 后缀等复杂类型字符串
- `cast[T](...)`、`foo&<...>`、`@id[T]`、成员访问、调用、命名参数与主要运算符
- 基于语义 token 的模块名、trait / struct / type parameter、函数、方法、字段、变量、参数区分

## 实现说明

扩展当前由两部分组成：

- `syntaxes/lona.tmLanguage.json`
  提供 TextMate grammar，用于基础词法级高亮。
- `lona-semantic.js`
  提供语义 token 分析，用于进一步区分命名空间、类型、函数、方法、字段、变量与参数。

这种组合方式可以在保持基础高亮稳定的同时，提升复杂表达式、复杂类型串和多行声明场景下的可读性。

## 本地开发

1. 使用 VS Code 打开当前仓库。
2. 按 `F5` 启动 `Extension Development Host`。
3. 在新窗口中打开任意 `.lo` 文件，检查语法高亮与语义高亮效果。

## 测试

仓库内置了一个最小语义高亮回归测试：

```bash
npm test
```

该测试主要覆盖多行函数签名、trait / impl、泛型 type parameter、函数指针、`cast[T]`、`Trait dyn`、命名参数、tuple 成员、命名空间访问和只读绑定等场景。

## 打包与发布

1. 在 Visual Studio Marketplace 中创建 publisher，并确保其 ID 与 `package.json` 中的 `publisher` 字段一致。
2. 创建 Azure DevOps PAT，并授予至少 `Marketplace -> Manage` 权限。
3. 安装发布工具：

```bash
npm install -g @vscode/vsce
```

4. 在仓库根目录执行登录：

```bash
vsce login tastynoob
```

5. 发布前建议先进行本地校验与打包：

```bash
npm test
npm run package
```

6. 发布扩展：

```bash
vsce publish --no-dependencies
```

或使用仓库内置脚本执行版本递进发布：

```bash
npm run publish:patch
```
