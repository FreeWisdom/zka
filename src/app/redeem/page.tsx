import type { Metadata } from 'next';

import { RedeemForm } from '@/components/redeem/redeem-form';

type GuideStep = {
  id: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
};

const guideSteps: GuideStep[] = [
  {
    id: '01',
    title: '输入卡密并验证',
    description: '先校验兑换码，确认商品信息、可用状态和是否允许继续提交。',
  },
  {
    id: '02',
    title: '登录 ChatGPT',
    description: '在同一浏览器中登录目标账号，确保会话处于在线状态。',
    action: {
      label: '打开 ChatGPT',
      href: 'https://chatgpt.com/',
    },
  },
  {
    id: '03',
    title: '获取 AuthSession',
    description: '打开 AuthSession 页面，复制完整 JSON 内容并粘贴到 Session 输入框。',
    action: {
      label: '打开 AuthSession 页面',
      href: 'https://chatgpt.com/api/auth/session',
    },
  },
  {
    id: '04',
    title: '提交任务并查看结果',
    description: '确认 Session 信息无误后提交；如需覆盖已有会员，可勾选强制充值后继续。',
  },
];

export const metadata: Metadata = {
  title: 'zka 兑换中心',
  description: '校验兑换码、提交 Session 信息并跟踪兑换结果。',
};

export default function RedeemPage() {
  return (
    <main className="redeem-shell">
      <section className="redeem-hero">
        <div className="redeem-hero-copy">
          <span className="redeem-kicker">Redeem Center</span>
          <h1>ChatGPT 订阅兑换</h1>
          <p>
            先验证卡密，再提交 Session 信息。页面会在提交前给出账号和状态提示，服务端只保存脱敏摘要与哈希，不保留完整明文，请放心提交。
          </p>
        </div>
      </section>

      <section className="redeem-layout">
        <aside className="redeem-side-panel">
          <section className="redeem-side-card">
            <span className="redeem-kicker">操作指南</span>
            <h2>按顺序完成兑换</h2>
            <p>这里查看所有流程，右侧进行操作。左侧的关键步骤如下：</p>

            <ol className="redeem-guide-list">
              {guideSteps.map((step) => (
                <li className="redeem-guide-item" key={step.id}>
                  <span className="redeem-guide-number">{step.id}</span>
                  <div className="redeem-guide-copy">
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                    {step.action ? (
                      <a
                        className="redeem-guide-action"
                        href={step.action.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {step.action.label}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="redeem-side-card redeem-side-note-card">
            <span className="redeem-kicker">提交须知</span>
            <h2>减少失败和冷却</h2>
            <ul className="redeem-side-notes">
              <li>Session 信息必须是完整 JSON；如需覆盖已有会员，可勾选强制充值后提交。</li>
              <li>如果卡密已在处理或进入冷却期，先不要重复提交，等待状态更新后再操作。</li>
              <li>提交后会跳转到结果页，若状态仍在处理中，可继续刷新查询。</li>
            </ul>
          </section>
        </aside>

        <RedeemForm />
      </section>
    </main>
  );
}
