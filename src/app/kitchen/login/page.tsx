import { LoginForm } from '@/components/LoginForm';
import { BrandMark } from '@/components/BrandMark';

export default async function KitchenLogin({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <div className="brand">
          <BrandMark /> Kitchen display
        </div>
        {sp.denied && <p className="alert error">That account doesn’t have kitchen access.</p>}
        <LoginForm portal="kitchen" next="/kitchen" />
      </div>
    </div>
  );
}
