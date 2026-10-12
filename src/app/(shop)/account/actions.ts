'use server';
import { getCurrentUser } from '@/server/auth/current';
import { runAction, bool } from '@/server/action';
import { sql } from '@/server/db';
import { unauthenticated } from '@/server/errors';
import type { ActionResult } from '@/lib/action-result';

export async function saveNotificationPrefs(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getCurrentUser();
    if (!user) throw unauthenticated();
    await sql`insert into customer_profiles (user_id, notify_sms, notify_email, marketing_opt_in) values (${user.id}, ${bool(fd, 'sms')}, ${bool(fd, 'email')}, ${bool(fd, 'marketing')})
              on conflict (user_id) do update set notify_sms = excluded.notify_sms, notify_email = excluded.notify_email, marketing_opt_in = excluded.marketing_opt_in`;
  }, 'Preferences saved.');
}
