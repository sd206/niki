import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Niki — Family Operating System',
  description: 'Organize, manage, and preserve every aspect of family life.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
