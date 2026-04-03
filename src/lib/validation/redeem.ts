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
