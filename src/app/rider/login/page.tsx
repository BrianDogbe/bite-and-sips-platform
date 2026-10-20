import { RiderLogin } from '@/components/rider/RiderLogin';
import { BrandMark } from '@/components/BrandMark';
import { C_LOGIN_CARD, C_LOGIN_WRAP } from '@/components/ui';

export default async function RiderLoginPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const sp = await searchParams;
  return (
    <div className={C_LOGIN_WRAP}>
      <div className={`${C_LOGIN_CARD} stack`}>
        <div className="flex items-center justify-center [gap:10px] [font-size:1.6rem] [&_.brand-mark]:[width:40px] [&_.brand-mark]:[height:40px] [&_strong]:font-extrabold">
          <BrandMark /> <span>Bite &amp; Sips</span> <strong>Rider</strong>
        </div>
        {sp.denied && <p className="alert error">That account isn’t set up as a rider.</p>}
        <RiderLogin next="/rider" />
      </div>
    </div>
  );
}
