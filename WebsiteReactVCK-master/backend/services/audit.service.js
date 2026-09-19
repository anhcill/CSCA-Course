import { query } from "../db/connect.js";

// Audit writes are intentionally centralized so every mutation records the same shape.
export const recordAuditEvent = async ({
  db = { query },
  actorId,
  action,
  entityType,
  entityId = null,
  beforeState = null,
  afterState = null,
  metadata = {},
}) => {
  await db.query(
    `INSERT INTO audit_events
       (actor_id, action, entity_type, entity_id, before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)`,
    [
      actorId,
      action,
      entityType,
      entityId,
      beforeState === null ? null : JSON.stringify(beforeState),
      afterState === null ? null : JSON.stringify(afterState),
      JSON.stringify(metadata || {}),
    ],
  );
};
