# Platform B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Platform B redeem flow with code check, redeem submission, status query, and result pages on a Next.js + Prisma + SQLite stack.

**Architecture:** Use a single Next.js App Router application with Prisma-backed domain services. Keep the upstream integration behind a local adapter so Platform B can ship now with deterministic mock behavior and later swap to the real upstream API without rewriting the redeem workflow.

**Tech Stack:** Next.js, React, TypeScript, Prisma, SQLite, Zod, Vitest, Testing Library

---

### Task 1: Bootstrap the project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Add the failing smoke test**

```ts
import { describe, expect, it } from 'vitest';

describe('project bootstrap', () => {
  it('loads the test environment', () => {
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify the toolchain is not ready yet**

Run: `npm test`
Expected: FAIL because dependencies and scripts do not exist yet

- [ ] **Step 3: Write minimal project configuration**

```json
{
  "name": "zka",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "vitest run"
  }
}
```

- [ ] **Step 4: Run test to verify bootstrap passes**

Run: `npm test`
Expected: PASS for the smoke test

### Task 2: Model Platform B data and Prisma client

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Test: `src/lib/redeem/__tests__/check-code.test.ts`

- [ ] **Step 1: Write the failing test for checking a usable redeem code**

```ts
it('returns canSubmit=true for an unused redeem code', async () => {
  const result = await checkRedeemCode('GIFT-VALID-0001');

  expect(result).toMatchObject({
    code: 'GIFT-VALID-0001',
    status: 'unused',
    canSubmit: true,
    productName: 'ChatGPT Plus 月卡',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- check-code`
Expected: FAIL because `checkRedeemCode` and database schema do not exist

- [ ] **Step 3: Add minimal Prisma schema and seed**

```prisma
model Product {
  id          String       @id @default(cuid())
  name        String
  slug        String       @unique
  redeemCodes RedeemCode[]
}
```

```ts
await prisma.product.create({
  data: {
    name: 'ChatGPT Plus 月卡',
    slug: 'chatgpt-plus-1m',
  },
});
```

- [ ] **Step 4: Run the test again after service implementation**

Run: `npm test -- check-code`
Expected: PASS

### Task 3: Implement code checking service and API

**Files:**
- Create: `src/lib/redeem/check-code.ts`
- Create: `src/app/api/redeem/check-code/route.ts`
- Create: `src/lib/validation/redeem.ts`
- Test: `src/lib/redeem/__tests__/check-code.test.ts`

- [ ] **Step 1: Write failing tests for valid, locked, and missing codes**

```ts
it('rejects a locked redeem code', async () => {
  await expect(checkRedeemCode('GIFT-LOCKED-0001')).rejects.toThrow(
    '兑换码当前不可提交',
  );
});
```

```ts
it('returns api payload for a valid code', async () => {
  const response = await POST(
    new Request('http://localhost/api/redeem/check-code', {
      method: 'POST',
      body: JSON.stringify({ code: 'GIFT-VALID-0001' }),
      headers: { 'content-type': 'application/json' },
    }),
  );

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify failures are expected**

Run: `npm test -- check-code`
Expected: FAIL for missing service logic and route handler

- [ ] **Step 3: Implement the minimal check-code flow**

```ts
if (!redeemCode || redeemCode.status === 'locked') {
  throw new RedeemCodeLookupError('兑换码当前不可提交');
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npm test -- check-code`
Expected: PASS

### Task 4: Implement redeem submission with upstream adapter

**Files:**
- Create: `src/lib/redeem/submit-redeem.ts`
- Create: `src/lib/redeem/upstream-adapter.ts`
- Create: `src/lib/redeem/session-info.ts`
- Create: `src/app/api/redeem/submit/route.ts`
- Test: `src/lib/redeem/__tests__/submit-redeem.test.ts`

- [ ] **Step 1: Write failing tests for success, retryable failure, and final failure**

```ts
it('creates a success request and marks the redeem code successful', async () => {
  const result = await submitRedeem({
    code: 'GIFT-VALID-0001',
    sessionInfo: JSON.stringify({
      account: { id: 'user-1', planType: 'free' },
      user: { email: 'user@example.com' },
    }),
  });

  expect(result.status).toBe('success');
});
```

```ts
it('returns failed_final for a non-free plan without consuming the upstream code', async () => {
  const result = await submitRedeem({
    code: 'GIFT-VALID-0001',
    sessionInfo: JSON.stringify({
      account: { id: 'user-1', planType: 'plus' },
      user: { email: 'user@example.com' },
    }),
  });

  expect(result.status).toBe('failed_final');
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `npm test -- submit-redeem`
Expected: FAIL because submit flow does not exist

- [ ] **Step 3: Implement minimal redeem workflow**

```ts
await tx.redeemRequest.create({
  data: {
    requestNo,
    redeemCodeId: redeemCode.id,
    attemptNo,
    status: normalized.state,
  },
});
```

```ts
if (normalized.state === 'success') {
  redeemCodeStatus = 'success';
  upstreamCodeStatus = 'success';
}
```

- [ ] **Step 4: Run submit tests**

Run: `npm test -- submit-redeem`
Expected: PASS

### Task 5: Expose status query and user-facing pages

**Files:**
- Create: `src/lib/redeem/get-redeem-status.ts`
- Create: `src/app/api/redeem/status/[requestNo]/route.ts`
- Create: `src/app/redeem/page.tsx`
- Create: `src/app/redeem/result/[requestNo]/page.tsx`
- Create: `src/components/redeem/redeem-form.tsx`
- Test: `src/lib/redeem/__tests__/get-redeem-status.test.ts`

- [ ] **Step 1: Write failing test for status hint mapping**

```ts
it('shows a processing hint for processing requests', async () => {
  const result = await getRedeemStatus('REQ-PROCESSING-0001');

  expect(result).toMatchObject({
    status: 'processing',
    statusHint: '上游处理中，请稍后刷新',
    retryable: false,
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `npm test -- get-redeem-status`
Expected: FAIL because status lookup does not exist

- [ ] **Step 3: Implement the minimal lookup and pages**

```ts
const hintMap = {
  processing: '上游处理中，请稍后刷新',
  success: '兑换成功，请登录账号查看结果',
  failed_retryable: '本次兑换失败，可稍后重试',
  failed_final: '本次兑换失败，请检查输入信息后重新提交',
} as const;
```

- [ ] **Step 4: Run the status tests and page smoke checks**

Run: `npm test -- get-redeem-status`
Expected: PASS

### Task 6: Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Document local usage**

```md
1. npm install
2. npx prisma migrate dev
3. npm run db:seed
4. npm run dev
```
