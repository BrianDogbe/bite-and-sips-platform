import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '@/components/LoginForm';
import { BackLink } from '@/components/shop/BackLink';

export const metadata: Metadata = { title: 'Sign in' };

export default async function CustomerLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="wrap section" style={{ maxWidth: 460 }}>
      <BackLink href="/menu" label="Back to menu" />
      <h1>Sign in</h1>
      <p className="muted">An account is optional. It keeps your order history in one place.</p>
      <div className="panel">
        <LoginForm portal="customer" next={sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/account'} />
      </div>
      <p style={{ marginTop: 16 }}>
        New here? <Link href="/account/register">Create an account</Link>
      </p>
    </div>
  );
}
