import type { Metadata } from 'next';

import { RedeemForm } from '@/components/redeem/redeem-form';

export const metadata: Metadata = {
  title: 'zka 兑换中心',
  description: 'zka 项目的兑换码校验与兑换提交页面',
};

export default function RedeemPage() {
  return (
    <main className="redeem-shell">
      <section className="redeem-layout">
        <RedeemForm />

        <aside className="redeem-side-panel">
          <div className="redeem-side-card">
            <span className="redeem-kicker">流程提示</span>
            <h2>兑换流程提示</h2>
            <ol>
              <li>输入内部兑换码，确认当前是否还能提交。</li>
              <li>粘贴完整的 session_info，系统会自动脱敏并留档。</li>
            </ol>
          </div>
        </aside>
      </section>
    </main>
  );
}
