/** Timestamp de création d'une facture (ms), pour tri décroissant. */
export function getInvoiceCreatedAtMs(invoice: Record<string, unknown>): number {
  for (const key of ['created_at', 'Date_creation', 'createdAt']) {
    const raw = invoice[key];
    if (raw != null && raw !== '') {
      const t = new Date(String(raw)).getTime();
      if (Number.isFinite(t) && t > 0) return t;
    }
  }

  const fromLogs = parseCreationTimestampFromUpdatedAt(invoice.updated_at);
  if (fromLogs > 0) return fromLogs;

  const reception = invoice['Date de réception'];
  if (reception != null && reception !== '') {
    const t = new Date(String(reception)).getTime();
    if (Number.isFinite(t) && t > 0) return t;
  }

  return 0;
}

function parseCreationTimestampFromUpdatedAt(updatedAt: unknown): number {
  if (updatedAt == null || updatedAt === '') return 0;
  try {
    const logs =
      typeof updatedAt === 'string'
        ? (JSON.parse(updatedAt) as unknown[])
        : Array.isArray(updatedAt)
          ? updatedAt
          : [];
    if (!logs.length) return 0;

    const creationEntry = logs.find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const mod = String((entry as Record<string, unknown>).modification || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return mod.includes('ajout') || mod.includes('creation');
    });

    const pick = (creationEntry ?? logs[0]) as Record<string, unknown> | undefined;
    const ts = pick?.timestamp;
    if (!ts) return 0;
    const t = new Date(String(ts)).getTime();
    return Number.isFinite(t) && t > 0 ? t : 0;
  } catch {
    return 0;
  }
}

/** Plus récent en premier (date de création, puis ID décroissant). */
export function compareInvoicesByCreationDesc(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const ta = getInvoiceCreatedAtMs(a);
  const tb = getInvoiceCreatedAtMs(b);
  if (tb !== ta) return tb - ta;
  return (Number(b.ID) || 0) - (Number(a.ID) || 0);
}
