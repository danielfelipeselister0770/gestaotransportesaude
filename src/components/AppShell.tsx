'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/motorista/');

  if (isPublic) return <>{children}</>;

  return (
    <>
      <Sidebar />
      <div className="md:ml-64">{children}</div>
    </>
  );
}
