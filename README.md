# zka

`zka` 已实现最小可运行兑换流，包含：

- `/redeem`：兑换码校验与提交页
- `/api/redeem/check-code`：兑换码检查接口
- `/api/redeem/submit`：兑换提交接口
- `/api/redeem/status/:requestNo`：兑换状态查询接口
- `/redeem/result/[requestNo]`：结果页
- `/api/health`：应用与数据库健康检查接口

## 文档

- [项目结构说明](./docs/project-structure.md)

## 本地运行

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

当前项目面向 `Vercel + Supabase(Postgres)` 部署，运行前需要先配置数据库连接串。

## 环境变量

可以复制 `.env.example` 作为本地开发配置：

```bash
cp .env.example .env.local
```

当前一期已经收口的环境变量包括：

- `DATABASE_URL`：运行时数据库连接串，建议使用 Supabase transaction pooler
- `MIGRATION_DATABASE_URL`：migration 连接串，建议使用 Supabase 直连或 non-pooling 连接
- `ADMIN_PASSWORD`：后台管理员密码
- `ADMIN_ALLOWED_IPS`：可选，后台允许访问的 IP 白名单，多个 IP 用逗号分隔
- `UPSTREAM_BASE_URL`：上游兑换服务基础地址
- `CARD_ENCRYPTION_KEY`：上游卡密加密密钥
- `ALIPAY_APP_ID`：支付宝应用 ID
- `ALIPAY_PRIVATE_KEY`：支付宝私钥
- `ALIPAY_PUBLIC_KEY`：支付宝公钥
- `ALIPAY_NOTIFY_URL`：支付宝异步回调地址

数据库连接配置会直接影响应用启动、migration 和健康检查；其余支付相关变量仍是后续能力预留。

## 健康检查

本地启动后可访问：

```bash
curl http://localhost:3000/api/health
```

返回内容会包含：

- 应用状态
- 数据库连通性
- 关键环境变量是否已配置

## 演示兑换码

- `ZKA-VALID-0001`：成功
- `ZKA-RETRY-0001`：可重试失败
- `ZKA-PROCESS-0001`：处理中
- `ZKA-LOCKED-0001`：锁定
- `ZKA-BROKEN-0001`：绑定卡密不可用

## 演示 session_info

```json
{
  "account": {
    "id": "user-1",
    "planType": "free"
  },
  "accessToken": "test-access-token",
  "user": {
    "email": "user@example.com"
  }
}
```
