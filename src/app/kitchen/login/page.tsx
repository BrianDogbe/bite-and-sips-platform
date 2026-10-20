import { LoginForm } from '@/components/LoginForm';
import { BrandMark } from '@/components/BrandMark';
import { C_BRAND, C_LOGIN_CARD, C_LOGIN_WRAP } from '@/components/ui';

export default async function KitchenLogin({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  return (
    <div className={C_LOGIN_WRAP}>
      <div className={`${C_LOGIN_CARD} stack`}>
        <div className={C_BRAND}>
          <BrandMark /> Kitchen display
        </div>
        {sp.denied && <p className="alert error">That account doesn’t have kitchen access.</p>}
        <LoginForm portal="kitchen" next="/kitchen" />
      </div>
    </div>
  );
}
