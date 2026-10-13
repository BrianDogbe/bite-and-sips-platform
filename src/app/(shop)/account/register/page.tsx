import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/components/shop/RegisterForm';
import { BackLink } from '@/components/shop/BackLink';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <div className="wrap section" style={{ maxWidth: 520 }}>
      <BackLink href="/menu" label="Back to menu" />
      <h1>Create an account</h1>
      <p className="muted">See your past orders and reorder in a tap. Earlier guest orders with the same phone and email are added automatically.</p>
      <div className="panel">
        <RegisterForm />
      </div>
      <p style={{ marginTop: 16 }}>
        Already have an account? <Link href="/account/login">Sign in</Link>
      </p>
    </div>
  );
}
