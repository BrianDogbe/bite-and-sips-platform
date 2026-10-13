import { LoginForm } from '@/components/LoginForm';
import { BrandMark } from '@/components/BrandMark';

export const metadata = { title: 'Admin sign in', robots: { index: false, follow: false } };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ denied?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith('/admin') ? sp.next : '/admin';
  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <div className="brand">
          <BrandMark /> Bite &amp; Sips admin
        </div>
        {sp.denied && <p className="alert error">Your account doesn’t have access to that page.</p>}
        <LoginForm portal="admin" next={next} />
      </div>
    </div>
  );
}
