# Platform B

平台 B 已实现最小可运行兑换流，包含：

- `/redeem`：兑换码校验与提交页
- `/api/redeem/check-code`：兑换码检查接口
- `/api/redeem/submit`：兑换提交接口
- `/api/redeem/status/:requestNo`：兑换状态查询接口
- `/redeem/result/[requestNo]`：结果页

## 文档

- [项目结构说明](./docs/project-structure.md)

## 本地运行

```bash
npm install
npm run db:seed
npm run dev
```

默认数据库文件位于 `data/platform-b.db`。

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
