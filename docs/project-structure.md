# 项目结构说明

## 项目概览

这是一个基于 `Next.js App Router + React + TypeScript + SQLite` 的兑换码提交与状态查询小应用。

项目当前实现的是一条最小可运行兑换链路：

- 用户进入 `/redeem`
- 校验兑换码是否可提交
- 提交兑换请求和 `session_info`
- 服务端模拟上游兑换结果
- 将兑换状态写入本地 SQLite
- 通过 `requestNo` 查询兑换结果

从职责上看，这个项目可以分成 5 层：

- 页面与 API 路由层：`src/app`
- 组件层：`src/components`
- 业务逻辑层：`src/lib/redeem`
- 存储层：`src/lib/storage`
- 校验与测试辅助层：`src/lib/validation`、`src/lib/redeem/__tests__`

## 顶层目录结构

### `src`

项目主代码目录，包含页面、接口、组件和业务逻辑。

### `data`

本地 SQLite 数据库目录。默认数据库文件是 `data/platform-b.db`。

### `scripts`

放初始化脚本。当前主要是种子数据脚本 `scripts/seed.ts`，用于写入演示商品和兑换码。

### `docs`

项目文档目录。

- `docs/project-structure.md`：当前这份项目结构说明
- `docs/superpowers/plans/2026-04-03-platform-b.md`：历史实现计划文档

### `.next`

Next.js 的本地构建产物目录，不属于业务源码。

### `node_modules`

项目依赖目录，不属于业务源码。

## `src` 目录详解

### `src/app`

这是 Next.js App Router 的页面与接口目录。

#### 页面文件

- `src/app/layout.tsx`
  - 全局布局入口，加载全局样式 `globals.css`
- `src/app/page.tsx`
  - 首页，不直接渲染内容，而是重定向到 `/redeem`
- `src/app/redeem/page.tsx`
  - 兑换提交页
- `src/app/redeem/result/[requestNo]/page.tsx`
  - 兑换结果页，根据动态路由参数 `requestNo` 查询状态并展示结果
- `src/app/globals.css`
  - 全局样式，定义兑换页和结果页的视觉样式

#### API 路由

- `src/app/api/redeem/check-code/route.ts`
  - 校验兑换码是否存在、当前是否允许提交
- `src/app/api/redeem/submit/route.ts`
  - 提交兑换请求，写入请求记录并更新兑换码状态
- `src/app/api/redeem/status/[requestNo]/route.ts`
  - 查询指定请求号对应的兑换状态

这几个 API 路由本身都比较薄，主要负责：

- 解析请求
- 调用 `zod` 校验入参
- 调用 `src/lib/redeem` 中的业务方法
- 把错误转换成 HTTP 响应

### `src/components`

当前组件层很精简，主要是：

- `src/components/redeem/redeem-form.tsx`

这是兑换页核心客户端组件，负责：

- 收集用户输入的兑换码
- 收集 `session_info`
- 请求 `/api/redeem/check-code`
- 请求 `/api/redeem/submit`
- 成功后跳转到结果页
- 展示校验成功、校验失败、提交失败等前端状态

### `src/lib/redeem`

这是项目最核心的业务逻辑目录，负责承接兑换流程。

#### `check-code.ts`

负责兑换码检查逻辑：

- 查询数据库里的兑换码、商品和上游码状态
- 判断当前是否允许提交
- 返回前端需要展示的 `canSubmit`、`message`、`productName` 等信息

#### `submit-redeem.ts`

负责兑换提交主流程：

- 再次校验兑换码是否可提交
- 读取关联的上游码
- 生成 `requestNo`
- 解析并脱敏 `session_info`
- 调用上游适配器模拟兑换结果
- 在事务里写入 `redeem_requests`
- 更新 `redeem_codes`
- 更新 `upstream_codes`

这是整个项目的核心编排文件。

#### `get-redeem-status.ts`

负责根据 `requestNo` 查询兑换请求状态，并把数据库状态映射成页面可读提示。

#### `session-info.ts`

负责处理用户提交的 `session_info`：

- 计算哈希
- 解析 JSON
- 提取账户和邮箱信息
- 做脱敏保存
- 在格式不合法时返回错误提示

#### `upstream-adapter.ts`

这是当前的“上游模拟层”。

它不会真的调用外部接口，而是根据预置的上游码内容，返回几种固定结果：

- `success`
- `processing`
- `failed_retryable`
- `failed_final`

这样项目可以先完成完整流程，后续再把这里替换成真实上游接口。

#### `types.ts`

集中定义兑换流程涉及的状态和返回结构，比如：

- 兑换码状态
- 上游码状态
- 兑换请求状态
- 提交结果结构
- 状态查询结构

#### `errors.ts`

集中定义业务异常类型，比如：

- `RedeemCodeLookupError`
- `RedeemSubmitError`
- `RedeemRequestLookupError`

这样 API 路由可以按错误类型返回不同状态码。

### `src/lib/storage`

- `src/lib/storage/database.ts`

这是数据库访问入口，使用 `better-sqlite3` 直接连接 SQLite。

它负责：

- 解析数据库路径
- 初始化数据库连接
- 在首次启动时建表
- 返回全局复用的数据库实例

当前表结构主要包括：

- `products`
- `upstream_codes`
- `redeem_codes`
- `redeem_requests`

也就是说，这个项目当前不是通过 Prisma 或其他 ORM 操作数据库，而是直接执行 SQL。

### `src/lib/validation`

- `src/lib/validation/redeem.ts`

负责接口入参校验，使用 `zod` 定义：

- 校验兑换码请求结构
- 提交兑换请求结构

这样接口层不会直接信任前端传参。

### `src/test`

- `src/test/smoke.test.ts`

这是一个很轻量的 smoke test，用来确认测试环境能够正常启动。

## 测试目录结构

### `src/lib/redeem/__tests__`

这里的测试基本按业务能力拆分：

- `check-code.test.ts`
  - 测试兑换码校验逻辑与对应 API
- `submit-redeem.test.ts`
  - 测试提交兑换后的数据库状态变更和 API 返回
- `get-redeem-status.test.ts`
  - 测试状态查询逻辑和状态提示映射
- `helpers.ts`
  - 测试用数据库重置和种子数据辅助函数

测试设计整体上和业务目录结构是对齐的，所以比较容易从测试反推功能边界。

## 数据初始化与演示数据

### `scripts/seed.ts`

用于初始化演示数据，主要会：

- 清空旧数据
- 写入一个演示商品
- 写入多组演示兑换码

当前演示码包括：

- `GIFT-VALID-0001`：成功
- `GIFT-RETRY-0001`：可重试失败
- `GIFT-PROCESS-0001`：处理中
- `GIFT-LOCKED-0001`：锁定
- `GIFT-BROKEN-0001`：上游异常

## 配置文件说明

### `package.json`

定义项目依赖和脚本：

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run test`
- `npm run db:seed`

### `tsconfig.json`

TypeScript 配置文件，定义了严格模式以及 `@/* -> src/*` 的路径别名。

### `next.config.ts`

Next.js 配置文件，当前配置比较简洁。

### `eslint.config.mjs`

ESLint 配置，基于 `eslint-config-next/core-web-vitals`。

### `vitest.config.ts`

Vitest 配置，设置了：

- `jsdom` 测试环境
- `@` 路径别名
- 测试文件匹配规则
- 单 worker 顺序执行

### `vitest.setup.ts`

测试启动前的初始化文件，主要用于：

- 加载 `jest-dom`
- 指定测试数据库路径
- 清理旧测试数据库文件

## 一次完整请求的调用链

从用户视角看，这个项目的调用链如下：

1. 访问 `/`
2. 首页重定向到 `/redeem`
3. 在兑换页输入兑换码并点击“校验兑换码”
4. 前端调用 `/api/redeem/check-code`
5. 服务端进入 `checkRedeemCode`
6. 如果允许提交，用户继续填写 `session_info`
7. 前端调用 `/api/redeem/submit`
8. 服务端进入 `submitRedeem`
9. `submitRedeem` 调用 `analyzeSessionInfo`
10. `submitRedeem` 调用 `activateUpstreamCode`
11. 服务端把兑换请求和状态写入 SQLite
12. 前端跳转到 `/redeem/result/[requestNo]`
13. 页面通过 `getRedeemStatus` 展示当前状态

这条链路说明这个项目虽然体量不大，但前后端、接口、状态落库和结果页已经完整打通。

## 当前实现与计划文档的差异

`docs/superpowers/plans/2026-04-03-platform-b.md` 中提到过 `Prisma + SQLite` 的实现方向，但当前仓库实际代码已经采用了另一种更轻量的方案：

- 数据库：SQLite
- 访问方式：`better-sqlite3`
- 建表方式：应用启动时执行 SQL 初始化

所以理解项目时，应该以当前源码为准，而不是只看计划文档。

## 总结

这个项目的结构比较清楚，适合继续扩展：

- `src/app` 负责页面和接口入口
- `src/components` 负责前端交互
- `src/lib/redeem` 负责兑换业务主流程
- `src/lib/storage` 负责数据库访问
- `src/lib/validation` 负责参数校验
- `scripts` 和测试目录负责初始化与验证

如果后续要扩展真实上游接口、登录态、重试策略或运营后台，最自然的切入点都会是 `src/lib/redeem` 这一层。
