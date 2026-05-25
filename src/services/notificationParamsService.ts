import { supabase } from './supabase';
import {
  NOTIFICATION_PARAMS_MODULE,
  NOTIFICATION_RECIPIENT_KEYS,
  NOTIFICATION_TRIGGERS,
  buildEmptyNotificationMatrix,
  normalizeNotificationMatrix,
} from '../constants/notificationConfig';

export type NotificationParamsMatrix = Record<string, Record<string, boolean>>;

export type NotificationParamsData = {
  version: 2;
  matrix: NotificationParamsMatrix;
};

export type NotificationParamsRow = {
  ID: number;
  module: string;
  params: string | null;
};

export type FetchNotificationParamsResult = {
  rowId: number | null;
  /** true si une ligne existe avec un JSON params non vide */
  hasSavedParams: boolean;
  data: NotificationParamsData;
};

function buildMatrixSkeleton(): NotificationParamsMatrix {
  return buildEmptyNotificationMatrix();
}

function applyParsedMatrix(raw: NotificationParamsMatrix): NotificationParamsMatrix {
  const skeleton = buildMatrixSkeleton();
  const normalized = normalizeNotificationMatrix(raw);
  for (const trigger of NOTIFICATION_TRIGGERS) {
    const src = normalized[trigger.id] || {};
    for (const key of NOTIFICATION_RECIPIENT_KEYS) {
      skeleton[trigger.id][key] = src[key] === true;
    }
  }
  return skeleton;
}

function parseParamsFromRow(params: string | null): NotificationParamsData | null {
  if (!params?.trim()) return null;
  try {
    const parsed = JSON.parse(params) as Partial<NotificationParamsData>;
    if (parsed?.matrix && typeof parsed.matrix === 'object') {
      return { version: 2, matrix: applyParsedMatrix(parsed.matrix) };
    }
  } catch {
    return null;
  }
  return null;
}

export function serializeNotificationParams(data: NotificationParamsData): string {
  return JSON.stringify(data);
}

export async function fetchNotificationParams(
  module: string = NOTIFICATION_PARAMS_MODULE,
): Promise<FetchNotificationParamsResult> {
  const { data, error } = await supabase
    .from('notification_params')
    .select('ID, module, params')
    .eq('module', module)
    .maybeSingle();

  if (error) throw error;

  const row = data as NotificationParamsRow | null;
  if (!row) {
    return {
      rowId: null,
      hasSavedParams: false,
      data: { version: 2, matrix: buildEmptyNotificationMatrix() },
    };
  }

  const parsed = parseParamsFromRow(row.params);
  if (!parsed) {
    return {
      rowId: row.ID,
      hasSavedParams: false,
      data: { version: 2, matrix: buildEmptyNotificationMatrix() },
    };
  }

  return {
    rowId: row.ID,
    hasSavedParams: true,
    data: parsed,
  };
}

let cachedForSending: FetchNotificationParamsResult | null = null;
let cacheForSendingAt = 0;
const CACHE_TTL_MS = 60_000;

/** Cache court pour éviter une requête à chaque action métier. */
export async function getNotificationParamsForSending(): Promise<FetchNotificationParamsResult> {
  const now = Date.now();
  if (cachedForSending && now - cacheForSendingAt < CACHE_TTL_MS) {
    return cachedForSending;
  }
  cachedForSending = await fetchNotificationParams();
  cacheForSendingAt = now;
  return cachedForSending;
}

export function invalidateNotificationParamsCache(): void {
  cachedForSending = null;
  cacheForSendingAt = 0;
}

export async function saveNotificationParams(
  matrix: NotificationParamsMatrix,
  rowId: number | null,
  module: string = NOTIFICATION_PARAMS_MODULE,
): Promise<void> {
  const normalized = normalizeNotificationMatrix(matrix);
  const payload: NotificationParamsData = { version: 2, matrix: applyParsedMatrix(normalized) };
  const paramsText = serializeNotificationParams(payload);

  if (rowId != null) {
    const { error } = await supabase
      .from('notification_params')
      .update({ params: paramsText })
      .eq('ID', rowId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from('notification_params').insert({
    module,
    params: paramsText,
  });
  if (error) throw error;
  invalidateNotificationParamsCache();
}
