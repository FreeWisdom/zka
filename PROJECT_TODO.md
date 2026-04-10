# PROJECT TODO

## 说明

本文件用于把 [gift-redeem-project-plan.md](/Users/zhenhanzhe/Desktop/github/zka/gift-redeem-project-plan.md) 落成可执行的研发清单。

当前仓库现状：

- 已完成 zka 兑换端的最小可运行兑换链路
- 尚未完成 zka 售卖端
- 尚未完成 zka 后台管理端
- 一期默认继续沿用 `Next.js + better-sqlite3 + SQL migration`
- `Prisma` 迁移不作为一期上线阻塞项

执行顺序：

1. `M0 / P0` 基线与安全
2. `M1 / P1` 数据模型补齐
3. `M2 / P2` zka 后台最小版本
4. `M3 / P3` zka 兑换端真实兑换链路
5. `M4 / P4` zka 售卖端闭环
6. `M5 / P5` 上线硬化与运维

---

## Epic M0 / P0 基线与安全

目标：把当前 B 端 MVP 固化成可持续开发和可上线的底座。

### Issue P0-01 环境与密钥收口

- 范围：环境变量、密钥管理、健康检查
- 接口：`GET /api/health`
- 表结构：无
- 验收条件：
  - 存在 `.env.example`
  - 至少包含 `DATABASE_PATH`、`ADMIN_PASSWORD`、`UPSTREAM_BASE_URL`、`UPSTREAM_API_KEY`、`CARD_ENCRYPTION_KEY`、`ALIPAY_APP_ID`、`ALIPAY_PRIVATE_KEY`、`ALIPAY_PUBLIC_KEY`、`ALIPAY_NOTIFY_URL`
  - 开发/测试/生产数据库路径分离
  - `GET /api/health` 返回应用与数据库状态

子任务：

- [x] 新增 `.env.example`
- [x] 整理环境变量读取入口，避免业务代码到处直接读 `process.env`
- [x] 新增 `GET /api/health`
- [x] 补充 README 的启动说明和必填环境变量说明

### Issue P0-02 SQL migration 机制

- 范围：数据库版本管理
- 接口：`npm run db:migrate`、`npm run db:seed`
- 表结构：`_migrations(id, name, applied_at)`
- 验收条件：
  - 新机器可一键建库
  - 后续表结构修改不再依赖应用启动时隐式建表
  - migration 可重复执行且具备幂等性

子任务：

- [ ] 新建 `migrations/` 目录
- [ ] 新增 migration runner 脚本
- [ ] 增加 `_migrations` 表
- [ ] 把当前建表 SQL 拆到首个 migration
- [ ] 更新 `package.json` scripts

### Issue P0-03 上游卡密真实加密

- 范围：上游卡密落库安全
- 接口：内部 `encryptUpstreamCode()`、`decryptUpstreamCode()`
- 表结构：`upstream_codes` 新增 `encryption_version`
- 验收条件：
  - 数据库中不出现明文上游卡密
  - 不再使用 Base64 伪加密
  - 旧数据可迁移
  - 兑换流程能正常解密读取上游卡密

子任务：

- [ ] 新增 `src/lib/security` 或等价目录
- [ ] 实现加密/解密工具
- [ ] 修改 seed 逻辑，写入真实密文
- [ ] 修改上游适配层读取逻辑
- [ ] 设计旧数据迁移脚本

### Issue P0-04 统一错误码与请求日志

- 范围：API 错误响应、请求链路追踪、基础日志
- 接口：所有 `app/api/*`
- 表结构：无
- 验收条件：
  - 接口统一返回 `{ success, message, data?, errorCode?, requestId? }`
  - 每次请求有稳定 `requestId`
  - 4xx/5xx 有明确错误码
  - 服务端日志能按 `requestId` 追踪

子任务：

- [ ] 抽公共响应结构
- [ ] 实现 `requestId` 注入
- [ ] 为业务异常补充 `errorCode`
- [ ] 为关键 API 打请求开始/结束/异常日志
- [ ] 在结果页和后台错误提示中透出 `requestId`

### Issue P0-05 基线测试与发布脚本

- 范围：构建、测试、冒烟
- 接口：`npm test`、`npm run build`、`npm run smoke`
- 表结构：无
- 验收条件：
  - 本地和 CI 都能跑通构建与测试
  - 可通过 smoke 脚本校验关键接口在线

子任务：

- [ ] 新增 `smoke` script
- [ ] 在 README 中明确发布前检查项
- [ ] 为当前 B 端流程保留回归测试
- [ ] 整理 seed 和 smoke 的串联方式

---

## Epic M1 / P1 数据模型补齐

目标：把数据库从 B 端演示模型扩展为可承载 A/B/C 一期业务的模型。

### Issue P1-01 商品模型补齐

- 范围：商品字段与状态流转
- 接口：后续供 `GET /api/products`、`GET /api/products/:slug` 使用
- 表结构：
  - `products(id, name, slug, description, price, status, created_at, updated_at)`
- 验收条件：
  - 支持 `draft / active / inactive / archived`
  - A 端仅展示 `active` 商品

子任务：

- [ ] 为 `products` 增加 `price`
- [ ] 为 `products` 增加 `status`
- [ ] 增加 `products(status, created_at)` 索引
- [ ] 更新 seed 数据

### Issue P1-02 导入批次与库存追溯

- 范围：卡密来源与库存追踪
- 接口：后续供后台库存导入与列表使用
- 表结构：
  - `inventory_batches(id, batch_no, supplier_name, product_id, cost_price, quantity, remark, created_at)`
  - `upstream_codes` 新增 `batch_id`、`bound_order_id`、`assigned_at`
- 验收条件：
  - 同一上游卡密不能重复导入
  - 每张卡密可追溯到导入批次
  - 可表达 `in_stock / reserved / bound / submitted / success / failed / invalid`

子任务：

- [ ] 新增 `inventory_batches` 表
- [ ] 扩展 `upstream_codes` 字段
- [ ] 增加唯一约束 `upstream_code_hash`
- [ ] 增加 `upstream_codes(product_id, status)` 等索引

### Issue P1-03 订单模型落地

- 范围：售卖与支付状态承载
- 接口：后续供 `POST /api/orders/create`、`POST /api/orders/pay/callback` 使用
- 表结构：
  - `orders(id, order_no, user_id, product_id, amount, payment_provider, payment_trade_no, payment_buyer_id, payment_status, fulfillment_status, payment_notified_at, payment_callback_raw, created_at, paid_at, delivered_at, updated_at)`
- 验收条件：
  - 支持 `pending / paid / failed / closed / refunded`
  - 支持 `pending / delivered / closed`
  - 交易号唯一且允许为空

子任务：

- [ ] 新增 `orders` 表
- [ ] 增加 `order_no` 唯一约束
- [ ] 增加 `payment_trade_no` 唯一约束
- [ ] 增加 `orders(payment_status, created_at)` 等索引

### Issue P1-04 兑换码与订单绑定

- 范围：一单一码一卡
- 接口：后续供订单发码与兑换链路使用
- 表结构：
  - `redeem_codes` 新增 `order_id`
- 验收条件：
  - 一个订单只能绑定一个兑换码
  - 一个兑换码只能绑定一个上游卡密

子任务：

- [ ] 为 `redeem_codes` 增加 `order_id`
- [ ] 增加 `redeem_codes(order_id)` 唯一约束
- [ ] 更新查询 SQL 和测试数据

### Issue P1-05 管理员审计日志

- 范围：后台关键操作追踪
- 接口：后续供 `GET /api/admin/audit-logs` 使用
- 表结构：
  - `admin_audit_logs(id, admin_user_id, action, target_type, target_id, detail_json, created_at)`
- 验收条件：
  - 商品编辑、卡密导入、锁码、重试、支付回调发码等关键操作均有审计记录

子任务：

- [ ] 新增 `admin_audit_logs` 表
- [ ] 定义标准 `action/target_type`
- [ ] 封装 `writeAdminAuditLog()`
- [ ] 在关键业务点接入写日志

### Issue P1-06 数据约束与索引补齐

- 范围：唯一约束、查询索引、事务基础
- 接口：内部数据库层
- 表结构：涉及 `products`、`inventory_batches`、`upstream_codes`、`orders`、`redeem_codes`、`redeem_requests`
- 验收条件：
  - 方案中一期必要唯一约束基本齐全
  - 关键列表查询不走全表扫描
  - 重试请求满足 `(redeem_code_id, attempt_no)` 联合唯一

子任务：

- [ ] 补全唯一约束清单
- [ ] 补全列表页与状态筛选索引
- [ ] 校验现有 SQL 是否与新字段兼容
- [ ] 更新测试夹具和 seed

---

## Epic M2 / P2 zka 后台最小版本

目标：让运营人员不直接碰数据库，也能完成商品、库存、订单和异常处理。

### Issue P2-01 单管理员登录保护

- 范围：后台最小认证
- 接口：`GET /admin/login`、`POST /api/admin/login`、`POST /api/admin/logout`
- 表结构：无
- 验收条件：
  - 未登录不能访问 `/admin/*`
  - 一期使用单管理员密码即可

子任务：

- [ ] 实现管理员登录页
- [ ] 实现登录接口和登出接口
- [ ] 实现后台路由守卫
- [ ] 设置会话过期策略

### Issue P2-02 商品管理

- 范围：商品新增、编辑、上下架
- 接口：`GET /api/admin/products`、`POST /api/admin/products`、`PATCH /api/admin/products/:id`
- 表结构：`products`
- 验收条件：
  - 可创建商品
  - 可修改价格、描述、状态
  - 所有操作写审计日志

子任务：

- [ ] 新建 `/admin/products`
- [ ] 实现商品列表接口
- [ ] 实现商品创建接口
- [ ] 实现商品编辑接口
- [ ] 接入审计日志

### Issue P2-03 卡密批量导入与库存列表

- 范围：批量导入、批次管理、库存查看
- 接口：`POST /api/admin/inventory/import`、`GET /api/admin/inventory`、`GET /api/admin/batches`
- 表结构：`inventory_batches`、`upstream_codes`
- 验收条件：
  - 支持文本或 CSV 导入
  - 返回成功数、重复数、失败数
  - 后台默认脱敏展示卡密

子任务：

- [ ] 新建 `/admin/inventory`
- [ ] 新建 `/admin/batches`
- [ ] 实现导入接口
- [ ] 实现库存列表接口
- [ ] 实现批次列表接口
- [ ] 实现脱敏展示

### Issue P2-04 订单与兑换记录列表

- 范围：后台查询订单、兑换码、兑换请求
- 接口：`GET /api/admin/orders`、`GET /api/admin/redeems`
- 表结构：`orders`、`redeem_codes`、`redeem_requests`
- 验收条件：
  - 可按 `orderNo`、兑换码、`requestNo`、状态、时间筛选
  - 能串起“订单 -> 兑换码 -> 上游卡密 -> 兑换请求”链路

子任务：

- [ ] 新建 `/admin/orders`
- [ ] 新建 `/admin/redeems`
- [ ] 实现订单列表接口
- [ ] 实现兑换记录列表接口
- [ ] 增加详情视图或抽屉

### Issue P2-05 人工重试与锁码

- 范围：异常处理
- 接口：`POST /api/admin/redeems/:id/retry`、`POST /api/admin/redeem-codes/:id/lock`、`POST /api/admin/redeem-codes/:id/unlock`
- 表结构：`redeem_requests`、`redeem_codes`、`upstream_codes`、`admin_audit_logs`
- 验收条件：
  - 锁码后用户不能提交
  - 解锁后可恢复提交
  - 重试会新建一条请求且 `attempt_no + 1`

子任务：

- [ ] 实现锁码接口
- [ ] 实现解锁接口
- [ ] 实现后台人工重试接口
- [ ] 接入审计日志
- [ ] 补充状态流转测试

### Issue P2-06 审计日志页

- 范围：后台操作留痕查看
- 接口：`GET /api/admin/audit-logs`
- 表结构：`admin_audit_logs`
- 验收条件：
  - 支持按时间、操作类型、目标类型筛选
  - 能查看操作详情 JSON

子任务：

- [ ] 新建 `/admin/audit-logs`
- [ ] 实现审计日志列表接口
- [ ] 实现筛选与详情展示

---

## Epic M3 / P3 zka 兑换端真实兑换链路

目标：从“本地模拟上游”升级到“真实上游可用的一期兑换系统”。

### Issue P3-01 真实上游适配层

- 范围：上游 `/api/check`、`/api/activate`
- 接口：内部 `checkUpstreamCode(code)`、`activateUpstreamCode(code, sessionInfo)`
- 表结构：复用 `redeem_requests.upstream_status_code`、`redeem_requests.upstream_response`
- 验收条件：
  - 不再依赖本地字符串 mock
  - 能处理成功、处理中、可重试失败、最终失败

子任务：

- [ ] 实现上游 HTTP client
- [ ] 实现超时与错误处理
- [ ] 实现统一状态映射
- [ ] 保留当前 mock 作为开发 fallback 或测试工具

### Issue P3-02 兑换码校验与提交接口升级

- 范围：B 端公开接口
- 接口：`POST /api/redeem/check-code`、`POST /api/redeem/submit`
- 表结构：复用 `redeem_codes`、`redeem_requests`
- 验收条件：
  - 仍只暴露内部兑换码
  - 仍只存 `sessionInfoMasked` 与 `sessionInfoHash`
  - 失败时明确区分可重试和不可重试

子任务：

- [ ] 校验现有提交逻辑与新状态映射兼容
- [ ] 梳理错误提示文案
- [ ] 保证状态落库完整
- [ ] 补全接口测试

### Issue P3-03 processing 查询与轮询刷新

- 范围：处理中状态的后续推进
- 接口：`GET /api/redeem/status/:requestNo`、可选 `GET /api/redeem/status/:requestNo?refresh=1`
- 表结构：`redeem_requests` 可新增 `last_checked_at`
- 验收条件：
  - `processing` 状态可在用户刷新时触发有限频率复查
  - 最终能推进为 `success`、`failed_retryable`、`failed_final`

子任务：

- [ ] 设计 refresh 策略和节流窗口
- [ ] 实现 processing 复查
- [ ] 更新结果页交互与提示
- [ ] 补充 processing 流程测试

### Issue P3-04 用户重试语义落实

- 范围：失败重试
- 接口：继续使用 `POST /api/redeem/submit`
- 表结构：复用 `retry_of_request_id`、`attempt_no`
- 验收条件：
  - 仅 `failed_retryable` 允许重试
  - `failed_final` 不自动重试
  - 新重试必须生成新请求记录

子任务：

- [ ] 明确可重试前置条件
- [ ] 复查 `check-code` 与 `submit` 的状态判断
- [ ] 补充 attempt 递增测试

### Issue P3-05 B 端页面与文案完善

- 范围：兑换页、结果页
- 接口：复用现有 B 端 API
- 表结构：无新增
- 验收条件：
  - 用户能理解当前状态、下一步操作和是否需要联系管理员
  - 不展示上游卡密或敏感信息

子任务：

- [ ] 调整结果页状态文案
- [ ] 为可重试失败提供明确指引
- [ ] 为最终失败提供联系管理员提示
- [ ] 校验前端不暴露敏感字段

---

## Epic M4 / P4 zka 售卖端闭环

目标：让用户能从下单支付走到拿到内部兑换码，再跳转到 B 端兑换。

### Issue P4-01 商品展示页

- 范围：A 端首页与商品详情页
- 接口：`GET /api/products`、`GET /api/products/:slug`
- 表结构：`products`
- 验收条件：
  - 首页展示所有上架商品
  - 商品详情页展示价格与描述

子任务：

- [ ] 新建 `/`
- [ ] 新建 `/products/[slug]`
- [ ] 实现商品列表接口
- [ ] 实现商品详情接口

### Issue P4-02 创建订单

- 范围：结算页、创建待支付订单
- 接口：`POST /api/orders/create`
- 表结构：`orders`
- 验收条件：
  - 只能为 `active` 商品创建订单
  - 创建订单时固化金额
  - 返回 `orderNo`、`amount`、`paymentProvider`、`payUrl`

子任务：

- [ ] 新建 `/checkout/[slug]`
- [ ] 实现创建订单接口
- [ ] 校验商品状态与金额
- [ ] 补充创建订单测试

### Issue P4-03 支付宝支付集成

- 范围：支付跳转、同步回跳、异步回调
- 接口：`POST /api/orders/create`、`POST /api/orders/pay/callback`
- 表结构：`orders`
- 验收条件：
  - 能生成支付宝支付链接或表单
  - 能正确处理同步回跳与异步通知
  - 以异步回调作为支付成功唯一依据

子任务：

- [ ] 接入支付宝 SDK
- [ ] 生成支付链接
- [ ] 实现回调参数验签
- [ ] 校验 `app_id`、金额、订单号、交易号

### Issue P4-04 支付回调幂等发码

- 范围：订单支付成功后的事务编排
- 接口：`POST /api/orders/pay/callback`
- 表结构：`orders`、`upstream_codes`、`redeem_codes`、`admin_audit_logs`
- 验收条件：
  - 回调处理幂等
  - 在同一事务内完成订单更新、库存分配、内部兑换码生成、审计写入
  - 重复通知不会重复发码

子任务：

- [ ] 实现库存分配函数 `allocateUpstreamCode(productId)`
- [ ] 实现内部兑换码生成
- [ ] 实现支付回调事务
- [ ] 写入审计日志
- [ ] 补充回调幂等测试

### Issue P4-05 订单结果页

- 范围：支付完成后的用户页
- 接口：`GET /api/orders/:orderNo`
- 表结构：`orders`、`redeem_codes`
- 验收条件：
  - 页面展示订单号、商品信息、内部兑换码、B 端入口
  - 不提供通用订单中心

子任务：

- [ ] 新建 `/orders/[orderNo]`
- [ ] 实现订单详情接口
- [ ] 展示去 B 端兑换入口
- [ ] 补充结果页测试

### Issue P4-06 库存分配并发安全

- 范围：支付回调中的库存占用与绑定
- 接口：内部 `allocateUpstreamCode(productId)`
- 表结构：复用 `upstream_codes.status`
- 验收条件：
  - 只从 `in_stock` 选择库存
  - 事务内先 `reserved` 再 `bound`
  - 并发下不会同一张卡分配给多个订单

子任务：

- [ ] 设计条件更新 SQL
- [ ] 落实事务内状态流转
- [ ] 补充并发分配测试

---

## Epic M5 / P5 上线硬化与运维

目标：把一期功能从“能跑”推进到“能上线且能运维”。

### Issue P5-01 公开接口限流与防刷

- 范围：兑换、下单、后台登录
- 接口：`POST /api/redeem/check-code`、`POST /api/redeem/submit`、`POST /api/orders/create`、`POST /api/admin/login`
- 表结构：一期可无新增
- 验收条件：
  - 命中频率限制时返回 `429`
  - 至少支持按 IP 与关键业务键限流

子任务：

- [ ] 设计限流策略
- [ ] 接入中间件或轻量本地限流实现
- [ ] 为公开接口加统一限流
- [ ] 补充防刷说明

### Issue P5-02 监控与告警

- 范围：可观测性
- 接口：`GET /api/health`
- 表结构：无
- 验收条件：
  - 支付回调失败、上游连续失败、库存不足、管理员登录异常都有日志和告警

子任务：

- [ ] 定义关键告警事件
- [ ] 增加日志埋点
- [ ] 接入邮件、Webhook 或等价告警通道

### Issue P5-03 数据备份与恢复演练

- 范围：SQLite 数据安全
- 接口：`npm run db:backup`、`npm run db:restore:dry-run`
- 表结构：无
- 验收条件：
  - 可定期备份数据库
  - 至少完成一次恢复演练

子任务：

- [ ] 新增备份脚本
- [ ] 新增恢复演练脚本
- [ ] 补充运维文档

### Issue P5-04 上线测试矩阵

- 范围：关键业务集成测试
- 接口：覆盖 A/B/C 核心 API
- 表结构：无
- 验收条件：
  - 覆盖支付回调幂等
  - 覆盖库存并发分配
  - 覆盖真实上游成功/处理中/失败
  - 覆盖后台重试/锁码
  - 覆盖订单结果页展示

子任务：

- [ ] 新增支付回调集成测试
- [ ] 新增库存并发测试
- [ ] 新增后台人工操作测试
- [ ] 新增 A 端页面与 API 测试

### Issue P5-05 部署与上线清单

- 范围：正式部署、域名、HTTPS、回调配置
- 接口：无
- 表结构：无
- 验收条件：
  - 正式环境域名、HTTPS、支付宝回调、上游白名单、备份目录都配置完成
  - 有管理员密码轮换与故障回滚说明

子任务：

- [ ] 整理部署文档
- [ ] 配置正式环境变量
- [ ] 配置 HTTPS 与域名
- [ ] 配置支付宝回调地址
- [ ] 配置上游白名单
- [ ] 整理回滚与应急 SOP

---

## 一期上线定义

满足以下条件，视为达到 A/B/C 一期可上线范围：

- [ ] 管理员可登录后台并管理商品
- [ ] 管理员可按批次导入上游卡密并查看库存
- [ ] 用户可在 A 端下单并完成支付宝支付
- [ ] 支付回调后系统可幂等发放内部兑换码
- [ ] 用户可在 B 端使用内部兑换码提交真实兑换
- [ ] `processing`、`failed_retryable`、`failed_final` 状态都能被正确处理
- [ ] 后台可查看订单与兑换请求，并可锁码或人工重试
- [ ] 关键操作有审计日志
- [ ] 核心接口具备限流、日志、健康检查、备份能力
- [ ] 构建、测试、seed、smoke 全部可通过
