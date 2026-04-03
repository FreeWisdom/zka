import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Gift Redeem Platform B',
  description: '内部兑换码提交与结果查询平台',
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
