import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '라이언의 2027 정시모집',
  description: '2027학년도 정시 전형 변화와 대학별 반영방법, 최근 3개년 입시결과 검색',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="dark">
      <body>{children}</body>
    </html>
  );
}
