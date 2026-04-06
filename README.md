# Platform B

平台 B 已实现最小可运行兑换流，包含：

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
npm run db:seed
npm run dev
```

默认数据库文件位于 `data/platform-b.db`。

## 环境变量

可以复制 `.env.example` 作为本地开发配置：

```bash
cp .env.example .env.local
```

当前一期已经收口的环境变量包括：

- `DATABASE_PATH`：SQLite 数据库文件路径
- `ADMIN_PASSWORD`：后台管理员密码
- `UPSTREAM_BASE_URL`：上游兑换服务基础地址
- `UPSTREAM_API_KEY`：上游兑换服务密钥
- `CARD_ENCRYPTION_KEY`：上游卡密加密密钥
- `ALIPAY_APP_ID`：支付宝应用 ID
- `ALIPAY_PRIVATE_KEY`：支付宝私钥
- `ALIPAY_PUBLIC_KEY`：支付宝公钥
- `ALIPAY_NOTIFY_URL`：支付宝异步回调地址

目前仓库里只有 `DATABASE_PATH` 和健康检查会实际读取上述配置；其余配置先完成统一收口，后续在后台、支付和真实上游对接时接入。

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

- `GIFT-VALID-0001`：成功
- `GIFT-RETRY-0001`：可重试失败
- `GIFT-PROCESS-0001`：处理中
- `GIFT-LOCKED-0001`：锁定
- `GIFT-BROKEN-0001`：绑定卡密不可用

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
