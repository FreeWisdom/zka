import { RedeemForm } from '@/components/redeem/redeem-form';

export default function RedeemPage() {
  return (
    <main className="redeem-shell">
      <section className="redeem-layout">
        <RedeemForm />

        <aside className="redeem-side-panel">
          <div className="redeem-side-card">
            <span className="redeem-kicker">流程提示</span>
            <h2>平台 B 的最小闭环</h2>
            <ol>
              <li>输入内部兑换码，确认当前是否还能提交。</li>
              <li>粘贴完整的 session_info，系统会自动脱敏并留档。</li>
              <li>提交后跳转结果页，通过 requestNo 查询最终状态。</li>
            </ol>
          </div>

          <div className="redeem-side-card">
            <span className="redeem-kicker">当前约束</span>
            <p>一期不展示上游卡密，不开放登录体系，所有查询都围绕兑换码和 requestNo 展开。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}
