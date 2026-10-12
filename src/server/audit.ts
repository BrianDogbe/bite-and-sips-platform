import 'server-only';
import { sql, type Db } from './db';

export interface Actor {
  userId: string | null;
  label: string; // 'system' | 'customer' | role name | provider name
  ip?: string | null;
}

export const SYSTEM: Actor = { userId: null, label: 'system' };

/** Append-only audit trail for financially or operationally significant actions. */
export async function audit(
  db: Db,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string | number | null,
  data: Record<string, unknown> = {},
) {
  await db`
    insert into audit_events (actor_user_id, actor_label, action, entity_type, entity_id, data, ip)
    values (${actor.userId}, ${actor.label}, ${action}, ${entityType}, ${entityId == null ? null : String(entityId)},
            ${db.json(data as never)}, ${actor.ip ?? null})`;
}

export async function listAudit(opts: { entityType?: string; entityId?: string; limit?: number } = {}, db: Db = sql) {
  const limit = Math.min(opts.limit ?? 100, 500);
  return db<
    {
      id: string;
      actorUserId: string | null;
      actorLabel: string | null;
      actorName: string | null;
      action: string;
      entityType: string;
      entityId: string | null;
      data: Record<string, unknown>;
      createdAt: Date;
    }[]
  >`
    select a.*, u.full_name as actor_name
    from audit_events a left join users u on u.id = a.actor_user_id
    where (${opts.entityType ?? null}::text is null or a.entity_type = ${opts.entityType ?? null})
      and (${opts.entityId ?? null}::text is null or a.entity_id = ${opts.entityId ?? null})
    order by a.id desc
    limit ${limit}`;
}
