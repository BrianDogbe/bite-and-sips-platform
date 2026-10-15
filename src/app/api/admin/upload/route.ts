import { NextResponse } from '@/server/response';
import { handler, noStore, assertSameOrigin } from '@/server/http';
import { getCurrentUser } from '@/server/auth/current';
import { requirePerm } from '@/server/auth/guard';
import { saveImage } from '@/server/storage';
import { invalid } from '@/server/errors';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = handler(async (req: Request) => {
  assertSameOrigin(req);
  const user = requirePerm(await getCurrentUser(), 'menu.manage');
  const fd = await req.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) throw invalid('Choose an image to upload.');
  const url = await saveImage(file);
  await audit(sql, { userId: user.id, label: 'staff' }, 'media.uploaded', 'media', url, { size: file.size });
  return NextResponse.json({ url }, { status: 201, headers: noStore });
});
