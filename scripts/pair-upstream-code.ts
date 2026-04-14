import './load-env';

import { pairRedeemCode } from '@/lib/redeem/pair-redeem-code';
import { closeDatabaseConnections } from '@/lib/storage/database';

async function main() {
  const upstreamCode = process.argv[2];

  if (!upstreamCode) {
    console.error('用法: npm run pair:code -- <上游卡密> [商品名称]');
    process.exitCode = 1;
    return;
  }

  const productName = process.argv[3];
  const result = await pairRedeemCode({
    upstreamCode,
    productName,
  });

  console.log(JSON.stringify(result, null, 2));
}

void main().finally(async () => {
  await closeDatabaseConnections();
});
