import { LoginForm } from '@/components/LoginForm';
import { BrandMark } from '@/components/BrandMark';

export default async function RiderLogin({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <div className="brand">
          <BrandMark /> Rider app
        </div>
        {sp.denied && <p className="alert error">That account isn’t set up as a rider.</p>}
        <LoginForm portal="rider" next="/rider" idLabel="Phone or email" />
        <p className="hint">Tip: use your browser’s “Add to Home screen” to install this app.</p>
      </div>
    </div>
  );
}
