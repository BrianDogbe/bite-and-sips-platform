import { RiderLogin } from '@/components/rider/RiderLogin';
import { BrandMark } from '@/components/BrandMark';

export default async function RiderLoginPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card stack">
        <div className="rl-brand">
          <BrandMark /> <span>Bite &amp; Sips</span> <strong>Rider</strong>
        </div>
        {sp.denied && <p className="alert error">That account isn’t set up as a rider.</p>}
        <RiderLogin next="/rider" />
      </div>
    </div>
  );
}
