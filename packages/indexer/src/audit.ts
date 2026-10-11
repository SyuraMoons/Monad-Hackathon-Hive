import type { AuditEvent } from "envio";

type Required = "id" | "owner" | "kind" | "at" | "block" | "logIndex" | "txHash";

const BLANK = {
  agentId: undefined, name: undefined, agentType: undefined, edgeId: undefined, fromAgent: undefined, toAgent: undefined,
  topic: undefined, expiresAt: undefined, slotId: undefined, contentHash: undefined, propagatedCount: undefined,
};

/** An AuditEvent row: the generated type wants every nullable field present, so each kind lists only the ones it uses. */
export const auditRow = (row: Pick<AuditEvent, Required> & Partial<AuditEvent>): AuditEvent => ({ ...BLANK, ...row });
