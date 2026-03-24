# Lona Highlight

基于 `../lona/grammar/*.lex|*.yacc` 和 `../lona/docs/language/*.md` 整理的一版 VS Code 语法高亮扩展。

当前覆盖：

- `.lo` 文件识别
- `//` 注释、字符串、字符、数值字面量
- `def` / `struct` / `var` / `if` / `for` / `ret` 等关键字
- `#[extern]` / `#[repr "C"]` 这类 tag line
- 内建类型、自定义类型、tuple type、函数指针类型、数组/指针/`const` 后缀
- `cast[T](...)`、`foo&<...>`、成员访问、调用和当前 grammar 中的主要运算符

## 本地调试

1. 用 VS Code 打开这个目录。
2. 按 `F5` 启动 Extension Development Host。
3. 在新窗口里打开任意 `.lo` 文件检查高亮效果。

## 发布到 Marketplace

1. 在 Visual Studio Marketplace 创建 publisher，并确认它的 ID 和 `package.json` 里的 `publisher` 一致。
2. 创建 Azure DevOps PAT，至少给 `Marketplace -> Manage` 权限。
3. 安装发布工具：`npm install -g @vscode/vsce`
4. 在仓库根目录登录：`vsce login tastynoob`
5. 先打包检查：`npm run package`
6. 发布：`vsce publish --no-dependencies`，或者直接用 `npm run publish:patch`

## 说明

这版是按当前 parser/lexer 实现做的第一版 TextMate grammar，优先保证现有语言特性可用。后续如果 `../lona/grammar` 有语法扩展，直接补 `syntaxes/lona.tmLanguage.json` 即可。
