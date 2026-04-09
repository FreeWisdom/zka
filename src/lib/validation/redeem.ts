import { z } from 'zod';

export const checkRedeemCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, '兑换码不能为空')
    .transform((value) => value.toUpperCase()),
});

export const submitRedeemSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, '兑换码不能为空')
    .transform((value) => value.toUpperCase()),
  sessionInfo: z.string().trim().min(1, 'session_info 不能为空'),
});

export const pairRedeemCodeSchema = z.object({
  upstreamCode: z
    .string()
    .trim()
    .min(1, '上游卡密不能为空')
    .transform((value) => value.toUpperCase()),
  productName: z.string().trim().min(1, '商品名称不能为空').optional(),
  productSlug: z.string().trim().min(1, '商品标识不能为空').optional(),
  productDescription: z.string().trim().optional(),
});
