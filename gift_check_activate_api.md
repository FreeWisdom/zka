# Gift 模块 — Check & Activate 对接文档

> 基础路径: `/api/`

---

## 1. 查询 CDKEY（单条）

### 接口信息

| 项目   | 说明                    |
|--------|------------------------|
| URL    | `/api/check`           |
| 方法   | `GET` / `POST`         |
| 权限   | 无需认证（AllowAny）    |

### 请求参数

| 参数名  | 类型     | 必填 | 说明                |
|---------|---------|------|---------------------|
| `cdkey` | string  | 是   | 要查询的卡密字符串   |

- **GET** 时通过 Query Params 传递：`/api/check?cdkey=XXXXX-XXXXX-XXXXX`
- **POST** 时通过 JSON Body 传递：`{"cdkey": "XXXXX-XXXXX-XXXXX"}`

### 响应格式

```json
{
  "success": true,
  "msg": "待提交",
  "data": {
    "cdkey": "XXXXX-XXXXX-XXXXX",
    "gift_name": "ChatGPT Plus",
    "use_status": 0,
    "status_hint": "待提交",
    "account": "",
    "completed_at": "",
    "in_cooldown": false,
    "cooldown_remaining": 0
  }
}
```

### `use_status` 状态码对照

| 值     | 含义         | `status_hint` 示例                          |
|--------|-------------|---------------------------------------------|
| `0`    | 可用（待提交）| 待提交                                      |
| `-1`   | 处理中       | 正在领取中 请稍后再查询                       |
| `1`    | 已完成       | 充值已完成 上号查看吧~                        |
| `-9`   | 库存不足     | 充值库存不足 请联系客服处理                    |
| `-999` | 异常         | CDK异常 请联系客服处理                        |
| `-1000`| 已作废       | CDK已作废 请联系客服处理                      |

> 当 CDKEY 处于冷却期（`in_cooldown=true`）时，`status_hint` 会提示剩余等待时间，`cooldown_remaining` 为剩余秒数。

### 错误响应

```json
{
  "success": false,
  "msg": "CDKEY 不存在",
  "data": ""
}
```

---

## 3. 激活 CDKEY

### 接口信息

| 项目   | 说明                    |
|--------|------------------------|
| URL    | `/api/activate`        |
| 方法   | `GET` / `POST`         |
| 权限   | 无需认证（AllowAny）    |

### 请求参数

| 参数名          | 类型     | 必填 | 说明                                     |
|----------------|---------|------|------------------------------------------|
| `cdkey`        | string  | 是   | 要激活的卡密                              |
| `session_info` | string  | 是   | 账号 Session JSON 字符串（详见下方说明）    |

- **GET** 时通过 Query Params 传递
- **POST** 时通过 JSON Body 传递（推荐）

```json
{
  "cdkey": "XXXXX-XXXXX-XXXXX",
  "session_info": "{\"account\":{\"id\":\"user-xxx\",\"planType\":\"free\"},\"accessToken\":\"ey...\",\"user\":{\"email\":\"test@example.com\"}}"
}
```

### `session_info` 结构说明

接口支持两种 Session 格式，自动识别：

**格式 A — GPT 类型**

```json
{
  "account": {
    "id": "user-xxx",
    "planType": "free"
  },
  "accessToken": "eyJhbGci...",
  "user": {
    "email": "test@example.com"
  }
}
```

> **重要：** `planType` 必须为 `"free"` 才允许激活，其他 plan 将被拒绝。


### 成功响应

```json
{
  "success": true,
  "msg": "充值成功",
  "data": {
    "cdkey": "XXXXX-XXXXX-XXXXX",
    "gift_name": "ChatGPT Plus",
    "use_status": 1,
    "account": "test@example.com",
    "completed_at": "2026-03-18T01:00:00+08:00"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "msg": "错误原因描述",
  "data": ""
}
```

### 常见错误信息

| msg                                          | 原因                        |
|----------------------------------------------|-----------------------------|
| 参数缺少或错误                                | `cdkey` 或 `session_info` 为空 |
| Session信息或账号异常 请复制全部内容重新提交     | Session JSON 解析失败         |
| 该账号当前plan为{plan} 无法进行充值             | 账号非 free plan              |
| 未找到对应cdk                                 | CDKEY 不存在                  |
| CDKEY 已充值成功                               | 重复提交                     |
| CDKEY 正在充值中                               | 有正在进行的激活操作           |
| 礼物库存不足，请等待15分钟后再试或联系管理员补货  | 无可用库存，进入 15 分钟冷却   |
| 该卡密暂时无法提交，{n} 分钟后恢复              | CDKEY 在冷却期内              |
| 充值过程中发生异常                              | 激活后端返回非预期错误         |

---

## 4. 通用响应结构

所有接口返回 HTTP 200，响应体统一格式如下：

```json
{
  "success": true | false,
  "msg": "描述信息",
  "data": { ... } | ""
}
```

| 字段      | 类型           | 说明                           |
|-----------|---------------|-------------------------------|
| `success` | boolean       | 业务是否成功                    |
| `msg`     | string        | 可直接展示给用户的提示信息       |
| `data`    | object / ""   | 业务数据，失败时通常为空字符串   |

---

## 5. 对接示例（Python requests）

### 查询 CDKEY

```python
import requests

resp = requests.get(
    "https://your-domain.com/api/check",
    params={"cdkey": "XXXXX-XXXXX-XXXXX"},
)
result = resp.json()

if result["success"]:
    print(f"状态: {result['data']['status_hint']}")
else:
    print(f"失败: {result['msg']}")
```

### 激活 CDKEY

```python
import requests

resp = requests.post(
    "https://your-domain.com/api/activate",
    json={
        "cdkey": "XXXXX-XXXXX-XXXXX",
        "session_info": '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
    },
)
result = resp.json()

if result["success"]:
    print(f"激活成功: {result['data']}")
else:
    print(f"激活失败: {result['msg']}")
```

