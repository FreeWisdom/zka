# Gift 模块 Check & Activate 对接文档

> 基础路径：`/api/`
>
> 真实上游激活地址：`https://gpt.86gamestore.com/api/activate`

---

## 1. 查询 CDKEY

### 接口信息

| 项目 | 说明 |
|------|------|
| URL | `/api/check` |
| 方法 | `GET` / `POST` |
| 权限 | 无需认证 |

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `cdkey` | string | 是 | 要查询的卡密 |

- `GET`：`/api/check?cdkey=XXXXX-XXXXX-XXXXX`
- `POST`：`{"cdkey":"XXXXX-XXXXX-XXXXX"}`

### 响应示例

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

### `use_status` 状态码

| 值 | 含义 | `status_hint` 示例 |
|----|------|--------------------|
| `0` | 可用，待提交 | 待提交 |
| `-1` | 处理中 | 正在充值中，请稍后再查询 |
| `1` | 已完成 | 充值已完成，上号查看结果 |
| `-9` | 库存不足 | 礼物库存不足，请等待 15 分钟后再试或联系管理员补货 |
| `-999` | 异常 | CDK 异常，请联系管理员处理 |
| `-1000` | 已作废 | CDK 已作废，请联系管理员处理 |

> 当 `in_cooldown=true` 时，`status_hint` 会提示剩余等待时间，`cooldown_remaining` 为剩余秒数。

### 错误示例

```json
{
  "success": false,
  "msg": "CDKEY 不存在",
  "data": ""
}
```

---

## 2. 激活 CDKEY

### 接口信息

| 项目 | 说明 |
|------|------|
| URL | `/api/activate` |
| 实际请求地址 | `https://gpt.86gamestore.com/api/activate` |
| 方法 | `GET` / `POST` |
| 权限 | 无需认证 |

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `cdkey` | string | 是 | 要激活的卡密 |
| `session_info` | string | 是 | 账号 Session JSON 字符串 |
| `force` | number | 否 | 勾选“放弃剩余会员时间，强制充值”时传 `1`，默认不传 |

- 推荐使用 `POST` JSON Body。

### 普通提交示例

```json
{
  "cdkey": "XXXXX-XXXXX-XXXXX",
  "session_info": "{\"account\":{\"id\":\"user-xxx\",\"planType\":\"free\"},\"accessToken\":\"ey...\",\"user\":{\"email\":\"test@example.com\"}}"
}
```

### 强制充值示例

当用户勾选“放弃剩余会员时间，强制充值”时，额外传 `force: 1`：

```json
{
  "cdkey": "MWJCT-XXXX-5MX9H",
  "session_info": "{\"account\":{\"id\":\"user-xxx\",\"planType\":\"free\"}}",
  "force": 1
}
```

### `session_info` 结构说明

当前已确认的 Session 结构如下：

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

> 重要：`account.planType` 必须为 `"free"` 才允许激活，其他 plan 会被拒绝。

### 成功响应示例

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

### 错误响应示例

```json
{
  "success": false,
  "msg": "错误原因描述",
  "data": ""
}
```

### 常见错误信息

| msg | 原因 |
|-----|------|
| 参数缺少或错误 | `cdkey` 或 `session_info` 为空 |
| Session 信息或账号异常，请复制完整内容重新提交 | Session JSON 解析失败 |
| 该账号当前 plan 为 {plan}，无法进行充值 | 账号不是 free plan |
| 未找到对应 cdk | CDKEY 不存在 |
| CDKEY 已充值成功 | 重复提交 |
| CDKEY 正在充值中 | 存在进行中的激活请求 |
| 礼物库存不足，请等待 15 分钟后再试或联系管理员补货 | 上游暂时无库存，进入冷却 |
| 该卡密暂时无法提交，{n} 分钟后恢复 | CDKEY 处于冷却期 |
| 充值过程中发生异常 | 上游返回非预期错误 |

---

## 3. 通用响应结构

所有接口业务层统一返回：

```json
{
  "success": true,
  "msg": "描述信息",
  "data": {}
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | boolean | 业务是否成功 |
| `msg` | string | 可直接展示给用户的提示信息 |
| `data` | object / string | 业务数据，失败时通常为空字符串 |

---

## 4. 对接示例

### Python 查询

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

### Python 激活

```python
import requests

resp = requests.post(
    "https://gpt.86gamestore.com/api/activate",
    json={
        "cdkey": "XXXXX-XXXXX-XXXXX",
        "session_info": '{"account":{"id":"user-xxx","planType":"free"},"accessToken":"ey...","user":{"email":"test@example.com"}}',
        "force": 1,
    },
)
result = resp.json()

if result["success"]:
    print(f"激活成功: {result['data']}")
else:
    print(f"激活失败: {result['msg']}")
```
