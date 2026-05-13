import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationType =
  | "invoice_registered"
  | "validated_dr"
  | "validated_dop"
  | "validated_dg"
  | "rejected"
  | "on_hold"
  | "paid"
  | "urgent"
  | "validation_delay"
  | "partial_payment";

type AgentRow = {
  ID: number;
  Nom: string | null;
  email: string | null;
  Role: string | null;
  REGION: string | null;
  permission: unknown;
  statut: string | null;
};

type InvoiceData = {
  fournisseur?: string;
  numeroFacture?: string;
  montant?: number | string;
  devise?: string;
  numeroDossier?: string;
  region?: string;
  categorie?: string;
  dateValidation?: string;
  validePar?: string;
  datePaiement?: string;
  modePaiement?: string;
  referencePaiement?: string;
  motifRejet?: string;
  raisonAttente?: string;
  montantTotal?: number | string;
  montantPaye?: number | string;
  soldeRestant?: number | string;
  echeance?: string;
  ancienneteJours?: number | string;
};

type Payload = {
  notificationType: NotificationType;
  invoice: InvoiceData;
  createdByEmail?: string | null;
  createdByName?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  dryRun?: boolean;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

/** SMTP (même principe que SGL_Cotation / send-cotation-notification) */
const smtpHost = Deno.env.get("SMTP_HOST");
const smtpPort = Number(Deno.env.get("SMTP_PORT") ?? "587");
const smtpUser = Deno.env.get("SMTP_USER");
const smtpPass = Deno.env.get("SMTP_PASS");
const smtpFrom = Deno.env.get("SMTP_FROM");
const smtpFromName = Deno.env.get("SMTP_FROM_NAME") ?? "";
const smtpSecure =
  Deno.env.get("SMTP_SECURE") === "true" ||
  Deno.env.get("SMTP_SECURE") === "1" ||
  smtpPort === 465;

const isSmtpConfigured = (): boolean =>
  Boolean(smtpHost && smtpUser && smtpPass && smtpFrom);

let smtpTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

const getSmtpTransporter = (): ReturnType<typeof nodemailer.createTransport> => {
  if (smtpTransporter) return smtpTransporter;
  if (!isSmtpConfigured()) {
    throw new Error("SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).");
  }
  smtpTransporter = nodemailer.createTransport({
    host: smtpHost!,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser!,
      pass: smtpPass!,
    },
  });
  return smtpTransporter;
};

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const asText = (value: unknown, fallback = "-"): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
};

const asUpper = (value: unknown): string => asText(value, "").toUpperCase();

const formatDate = (value?: string): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR");
};

const formatAmount = (amount?: number | string, currency?: string): string => {
  const parsed = typeof amount === "number" ? amount : Number(String(amount ?? "").replace(",", "."));
  const ccy = asUpper(currency || "USD") || "USD";
  if (!Number.isFinite(parsed)) return "-";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: ccy }).format(parsed);
  } catch {
    return `${parsed.toLocaleString("fr-FR")} ${ccy}`;
  }
};

const parsePermission = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
};

const hasNestedFlag = (obj: unknown, targetKey: string, targetAction: string): boolean => {
  if (!obj || typeof obj !== "object") return false;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.toLowerCase() === targetKey.toLowerCase() && value && typeof value === "object") {
      for (const [actionKey, actionVal] of Object.entries(value as Record<string, unknown>)) {
        if (actionKey.toLowerCase() === targetAction.toLowerCase() && actionVal === true) {
          return true;
        }
      }
    }
    if (hasNestedFlag(value, targetKey, targetAction)) return true;
  }
  return false;
};

const canMarkAsPaid = (permission: unknown): boolean => {
  const perms = parsePermission(permission);
  if (!perms) return false;
  return (
    hasNestedFlag(perms, "factures_payment_order", "marquer_payee") ||
    hasNestedFlag(perms, "factures_ffg_payment_order", "marquer_payee") ||
    hasNestedFlag(perms, "factures", "marquer_payee") ||
    hasNestedFlag(perms, "factures_ffg", "marquer_payee")
  );
};

const isRegionalValidator = (agent: AgentRow, region: string): boolean => {
  const perms = parsePermission(agent.permission);
  if (!perms) return false;
  const validator =
    hasNestedFlag(perms, "factures_pending_dr", "valider") ||
    hasNestedFlag(perms, "factures_pending_dop", "valider") ||
    hasNestedFlag(perms, "factures_ffg_pending_dr", "valider") ||
    hasNestedFlag(perms, "factures_ffg_pending_dop", "valider");
  if (!validator) return false;
  const agentRegion = asUpper(agent.REGION);
  return agentRegion === "TOUT" || agentRegion === asUpper(region);
};

const isDG = (agent: AgentRow): boolean => {
  if (asUpper(agent.Role) === "DG") return true;
  const perms = parsePermission(agent.permission);
  return perms ? hasNestedFlag(perms, "dg_tout", "valider") : false;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const assetDir = new URL("./assets/", import.meta.url);

type EmailImageAssets = { logoDataUri: string };

let cachedEmailAssets: EmailImageAssets | null = null;

async function loadEmailImageAssets(): Promise<EmailImageAssets> {
  if (cachedEmailAssets) return cachedEmailAssets;
  let logoDataUri = "";
  try {
    const logoBytes = await Deno.readFile(new URL("./logo.png", assetDir));
    logoDataUri = `data:image/png;base64,${uint8ToBase64(logoBytes)}`;
  } catch {
    /* logo optionnel */
  }
  cachedEmailAssets = { logoDataUri };
  return cachedEmailAssets;
}

function buildAppOpenUrl(invoice: InvoiceData): string | null {
  const base = (Deno.env.get("NOTIFICATION_APP_BASE_URL") ?? Deno.env.get("PMD_APP_BASE_URL") ?? "").trim().replace(
    /\/+$/,
    "",
  );
  const num = String(invoice?.numeroFacture ?? "").trim();
  if (!base || !num) return null;
  const u = new URL(base.includes("://") ? base : `https://${base}`);
  u.searchParams.set("pmdOpenFacture", num);
  return u.toString();
}

const wrapPmdEmail = (opts: {
  headerTitle: string;
  headerRef: string;
  logoDataUri: string;
  greetingHtml?: string;
  introHtml: string;
  rows: [string, string][];
  statusLabel: string;
  statusValue: string;
  footerHtml: string;
  bottomCtaHtml: string;
}): string => {
  const greeting = opts.greetingHtml ?? `<p style="margin:0 0 14px;">Bonjour,</p>`;
  const rowHtml = opts.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:11px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;width:36%;">${escapeHtml(k)}</td>` +
        `<td style="padding:11px 16px;border-bottom:1px solid #e5e7eb;color:#111827;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const logoCell = opts.logoDataUri
    ? `<td align="right" style="vertical-align:middle;width:112px;padding-left:16px;"><img src="${opts.logoDataUri}" alt="Shipping GL" width="96" style="max-width:96px;height:auto;display:block;" /></td>`
    : "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head><body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 12px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,.08);">
<tr><td style="background:linear-gradient(135deg,#ef4444 0%,#b91c1c 45%,#7f1d1d 100%);padding:22px 26px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">
<div style="font-size:12px;font-weight:600;color:#fecaca;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(
    opts.headerTitle,
  )}</div>
<div style="font-size:28px;font-weight:700;color:#ffffff;line-height:1.15;padding-top:6px;">${escapeHtml(opts.headerRef)}</div>
</td>${logoCell}</tr></table></td></tr>
<tr><td style="padding:26px 26px 30px;font-size:15px;line-height:1.55;color:#374151;">
${greeting}
${opts.introHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:12px;">
${rowHtml}<tr><td colspan="2" style="padding:14px 16px;background:linear-gradient(90deg,#fef2f2,#fff1f2);border-top:1px solid #fecaca;"><span style="font-weight:700;color:#991b1b;">${escapeHtml(
    opts.statusLabel,
  )}</span> <span style="color:#111827;">${escapeHtml(opts.statusValue)}</span></td></tr>
</table>
<p style="margin:22px 0 0;font-size:13px;color:#6b7280;">${opts.footerHtml}</p>
${opts.bottomCtaHtml}
</td></tr>
</table></td></tr></table></body></html>`;
};

const buildEmailContent = async (
  type: NotificationType,
  i: InvoiceData,
): Promise<{ subject: string; text: string; html: string; appUrl: string | null }> => {
  const assets = await loadEmailImageAssets();
  const openUrl = buildAppOpenUrl(i);
  const bottomCtaHtml = openUrl
    ? `<div style="margin-top:28px;padding-top:22px;border-top:1px solid #e5e7eb;text-align:center;">
<a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#ef4444,#991b1b);color:#ffffff !important;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Accéder à la facture dans PMD</a>
<p style="margin:14px 0 0;font-size:12px;color:#6b7280;word-break:break-all;">${escapeHtml(openUrl)}</p>
</div>`
    : "";
  const w = (
    partial: Omit<
      {
        headerTitle: string;
        headerRef: string;
        logoDataUri: string;
        greetingHtml?: string;
        introHtml: string;
        rows: [string, string][];
        statusLabel: string;
        statusValue: string;
        footerHtml: string;
        bottomCtaHtml: string;
      },
      "logoDataUri" | "bottomCtaHtml"
    >,
  ) => wrapPmdEmail({ ...partial, logoDataUri: assets.logoDataUri, bottomCtaHtml });

  const detailsRows: [string, string][] = [
    ["Fournisseur", asText(i.fournisseur)],
    ["N° facture", asText(i.numeroFacture)],
    ["Montant", formatAmount(i.montant, i.devise)],
  ];

  switch (type) {
    case "invoice_registered": {
      const subject = "Nouvelle facture enregistree - Validation requise";
      const text = [
        "Bonjour,",
        "",
        "Une nouvelle facture fournisseur vient d'etre enregistree dans le systeme PMD et necessite votre validation.",
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        `* Dossier : ${asText(i.numeroDossier)}`,
        `* Region / Bureau : ${asText(i.region)}`,
        `* Categorie : ${asText(i.categorie)}`,
        "",
        "Statut :",
        "En attente de validation",
        "",
        "Merci de proceder a la verification et au traitement dans les meilleurs delais.",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Dossier", asText(i.numeroDossier)],
        ["Région / Bureau", asText(i.region)],
        ["Catégorie", asText(i.categorie)],
      ];
      const html = w({
        headerTitle: "Nouvelle facture",
        headerRef: asText(i.numeroFacture),
        introHtml:
          `<p style="margin:0 0 12px;">Une nouvelle facture fournisseur vient d&apos;être enregistrée dans le système <strong>PMD</strong> et nécessite votre validation.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "En attente de validation",
        footerHtml:
          "Merci de procéder à la vérification et au traitement dans les meilleurs délais.",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "validated_dr": {
      const subject = "Facture validee par le Directeur Regional";
      const vp = asText(i.validePar);
      const text = [
        "Bonjour,",
        "",
        `La facture ci-dessous a ete validee par ${vp} (Directeur Regional).`,
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        `* Valide par : ${vp}`,
        `* Date de validation : ${formatDate(i.dateValidation)}`,
        "",
        "Statut :",
        "Validee DR - En attente du niveau suivant",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Validé par", vp],
        ["Date de validation", formatDate(i.dateValidation)],
      ];
      const html = w({
        headerTitle: "Validation DR",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La facture ci-dessous a été validée par <strong>${escapeHtml(vp)}</strong> <span style="color:#6b7280;">(Directeur régional)</span>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Validée DR — en attente du niveau suivant",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "validated_dop": {
      const subject = "Facture validee par le Directeur des Operations";
      const vp = asText(i.validePar);
      const text = [
        "Bonjour,",
        "",
        `La facture suivante a ete validee par ${vp} (Directeur des Operations).`,
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        `* Valide par : ${vp}`,
        `* Date : ${formatDate(i.dateValidation)}`,
        "",
        "Statut :",
        "Validee DOP - Transmission Finance",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Validé par", vp],
        ["Date", formatDate(i.dateValidation)],
      ];
      const html = w({
        headerTitle: "Validation DOP",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La facture suivante a été validée par <strong>${escapeHtml(vp)}</strong> <span style="color:#6b7280;">(Directeur des opérations)</span>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Validée DOP — transmission Finance",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "validated_dg": {
      const subject = "Facture validee par la Direction Generale";
      const vp = asText(i.validePar);
      const text = [
        "Bonjour,",
        "",
        `La Direction Generale a valide la facture suivante pour paiement (par ${vp}).`,
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        `* Valide par : ${vp}`,
        `* Date : ${formatDate(i.dateValidation)}`,
        "",
        "Statut :",
        "Validation finale approuvee",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Validé par", vp],
        ["Date", formatDate(i.dateValidation)],
      ];
      const html = w({
        headerTitle: "Validation DG",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La <strong>Direction générale</strong> a validé la facture suivante pour paiement, par <strong>${escapeHtml(vp)}</strong>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Validation finale approuvée",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "rejected": {
      const subject = "Facture rejetee - Action corrective requise";
      const text = [
        "Bonjour,",
        "",
        "La facture ci-dessous a ete rejetee lors du processus de validation.",
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        `* Rejetee par : ${asText(i.validePar)}`,
        `* Date : ${formatDate(i.dateValidation)}`,
        "",
        "Motif du rejet :",
        `- ${asText(i.motifRejet)}`,
        "",
        "Statut :",
        "Rejetee",
        "",
        "Merci de corriger ou completer les informations demandees avant une nouvelle soumission.",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Rejetée par", asText(i.validePar)],
        ["Date", formatDate(i.dateValidation)],
        ["Motif du rejet", asText(i.motifRejet)],
      ];
      const html = w({
        headerTitle: "Facture rejetée",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La facture ci-dessous a été <strong>rejetée</strong> lors du processus de validation.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Rejetée",
        footerHtml:
          "Merci de corriger ou compléter les informations demandées avant une nouvelle soumission.",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "on_hold": {
      const subject = "Facture mise en attente";
      const text = [
        "Bonjour,",
        "",
        "La facture suivante a ete temporairement mise en attente.",
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        "",
        "Raison :",
        `- ${asText(i.raisonAttente)}`,
        "",
        "Statut :",
        "En attente",
      ].join("\n");
      const rows: [string, string][] = [...detailsRows, ["Raison", asText(i.raisonAttente)]];
      const html = w({
        headerTitle: "Mise en attente",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La facture suivante a été temporairement <strong>mise en attente</strong>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "En attente",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "paid": {
      const subject = "Paiement effectue - Facture fournisseur";
      const text = [
        "Bonjour,",
        "",
        "Le paiement de la facture suivante a ete effectue avec succes.",
        "",
        "Details :",
        `* Fournisseur : ${asText(i.fournisseur)}`,
        `* N° Facture : ${asText(i.numeroFacture)}`,
        `* Montant paye : ${formatAmount(i.montantPaye ?? i.montant, i.devise)}`,
        `* Date de paiement : ${formatDate(i.datePaiement)}`,
        `* Mode de paiement : ${asText(i.modePaiement)}`,
        `* Reference paiement : ${asText(i.referencePaiement)}`,
        "",
        "Statut :",
        "Payee",
      ].join("\n");
      const rows: [string, string][] = [
        ["Fournisseur", asText(i.fournisseur)],
        ["N° facture", asText(i.numeroFacture)],
        ["Montant payé", formatAmount(i.montantPaye ?? i.montant, i.devise)],
        ["Date de paiement", formatDate(i.datePaiement)],
        ["Mode de paiement", asText(i.modePaiement)],
        ["Référence paiement", asText(i.referencePaiement)],
      ];
      const html = w({
        headerTitle: "Paiement effectué",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">Le paiement de la facture suivante a été effectué avec <strong>succès</strong>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Payée",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "urgent": {
      const subject = "Facture critique necessitant un traitement urgent";
      const text = [
        "Attention,",
        "",
        "Une facture consideree comme critique necessite une prise en charge immediate afin d'eviter un impact operationnel.",
        "",
        "Nature du risque :",
        "* Surestaries",
        "* Blocage livraison",
        "* Occupation espace",
        "* Suspension fournisseur",
        "* Risque operationnel",
        "",
        "Details :",
        `* Fournisseur : ${asText(i.fournisseur)}`,
        `* Montant : ${formatAmount(i.montant, i.devise)}`,
        `* Echeance : ${formatDate(i.echeance)}`,
        "",
        "Statut :",
        "Priorite elevee",
      ].join("\n");
      const rows: [string, string][] = [
        ["Fournisseur", asText(i.fournisseur)],
        ["Montant", formatAmount(i.montant, i.devise)],
        ["Échéance", formatDate(i.echeance)],
        [
          "Risques",
          "Surestaries, blocage livraison, occupation espace, suspension fournisseur, risque opérationnel",
        ],
      ];
      const html = w({
        headerTitle: "Urgence facture",
        headerRef: asText(i.numeroFacture),
        greetingHtml: `<p style="margin:0 0 14px;"><strong>Attention,</strong></p>`,
        introHtml:
          `<p style="margin:0 0 12px;"><strong>Attention :</strong> une facture critique nécessite une prise en charge immédiate afin d&apos;éviter un impact opérationnel.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Priorité élevée",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "validation_delay": {
      const subject = "Facture en attente de validation depuis plusieurs jours";
      const text = [
        "Bonjour,",
        "",
        "La facture ci-dessous est toujours en attente de validation.",
        "",
        "Anciennete :",
        `${asText(i.ancienneteJours)} jour(s)`,
        "",
        "Details :",
        ...detailsRows.map(([k, v]) => `* ${k} : ${v}`),
        "",
        "Merci de proceder au traitement afin d'eviter tout retard operationnel ou financier.",
      ].join("\n");
      const rows: [string, string][] = [
        ...detailsRows,
        ["Ancienneté", `${asText(i.ancienneteJours)} jour(s)`],
      ];
      const html = w({
        headerTitle: "Délai de validation",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">La facture ci-dessous est toujours <strong>en attente de validation</strong>.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "En attente de validation",
        footerHtml:
          "Merci de procéder au traitement afin d'éviter tout retard opérationnel ou financier.",
      });
      return { subject, text, html, appUrl: openUrl };
    }
    case "partial_payment": {
      const subject = "Paiement partiel effectue";
      const text = [
        "Bonjour,",
        "",
        "Un paiement partiel a ete effectue sur la facture suivante :",
        "",
        "Details :",
        `* Fournisseur : ${asText(i.fournisseur)}`,
        `* Facture : ${asText(i.numeroFacture)}`,
        `* Montant facture : ${formatAmount(i.montantTotal ?? i.montant, i.devise)}`,
        `* Montant paye : ${formatAmount(i.montantPaye, i.devise)}`,
        `* Solde restant : ${formatAmount(i.soldeRestant, i.devise)}`,
        "",
        "Statut :",
        "Partiellement payee",
      ].join("\n");
      const rows: [string, string][] = [
        ["Fournisseur", asText(i.fournisseur)],
        ["Facture", asText(i.numeroFacture)],
        ["Montant facture", formatAmount(i.montantTotal ?? i.montant, i.devise)],
        ["Montant payé", formatAmount(i.montantPaye, i.devise)],
        ["Solde restant", formatAmount(i.soldeRestant, i.devise)],
      ];
      const html = w({
        headerTitle: "Paiement partiel",
        headerRef: asText(i.numeroFacture),
        introHtml: `<p style="margin:0 0 12px;">Un <strong>paiement partiel</strong> a été effectué sur la facture suivante.</p>`,
        rows,
        statusLabel: "Statut",
        statusValue: "Partiellement payée",
        footerHtml: "—",
      });
      return { subject, text, html, appUrl: openUrl };
    }
  }
};

const sendMailGrouped = async (
  primaryTo: string,
  ccList: string[],
  subject: string,
  text: string,
  html: string,
): Promise<void> => {
  const transporter = getSmtpTransporter();
  const fromName = smtpFromName.replace(/"/g, "'").trim();
  const from = fromName.length > 0 ? `"${fromName}" <${smtpFrom}>` : smtpFrom!;
  await transporter.sendMail({
    from,
    to: primaryTo,
    cc: ccList.length > 0 ? ccList : undefined,
    subject,
    text,
    html,
  });
};

function pickPrimaryRecipient(emails: string[], payload: Payload): string {
  const lower = (s: string) => s.toLowerCase().trim();
  const sorted = [...emails].sort((a, b) => a.localeCompare(b, "fr"));
  const created = payload.createdByEmail ? lower(payload.createdByEmail) : "";
  const actor = payload.actorEmail ? lower(payload.actorEmail) : "";
  if (created && sorted.some((e) => lower(e) === created)) {
    return sorted.find((e) => lower(e) === created)!;
  }
  if (actor && sorted.some((e) => lower(e) === actor)) {
    return sorted.find((e) => lower(e) === actor)!;
  }
  return sorted[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = (await req.json()) as Payload;
    const region = asText(payload.invoice?.region, "");

    const { data: agents, error } = await supabase
      .from("AGENTS")
      .select("ID, Nom, email, Role, REGION, permission, statut")
      .eq("statut", "Actif");

    if (error) throw error;

    const allAgents = (agents || []) as AgentRow[];
    const validEmail = (email: string | null | undefined): email is string => Boolean(email && email.includes("@"));

    const emitterRecipients = new Set<string>();
    if (validEmail(payload.createdByEmail)) emitterRecipients.add(payload.createdByEmail);
    if (payload.createdByName) {
      const byName = allAgents.find((a) => asText(a.Nom).toLowerCase() === asText(payload.createdByName).toLowerCase());
      if (validEmail(byName?.email)) emitterRecipients.add(byName!.email!);
    }

    const regionalValidators = new Set(
      allAgents
        .filter((a) => region && isRegionalValidator(a, region))
        .map((a) => a.email)
        .filter(validEmail),
    );

    const dgRecipients = new Set(
      allAgents
        .filter((a) => isDG(a))
        .map((a) => a.email)
        .filter(validEmail),
    );

    const financeRecipients = new Set(
      allAgents
        .filter((a) => {
          const r = asUpper(a.Role);
          const financeLike = r === "FINANCE" || r.includes("FINANCE");
          return financeLike && canMarkAsPaid(a.permission);
        })
        .map((a) => a.email)
        .filter(validEmail),
    );

    const recipients = new Set<string>();

    // Base targets: emitter + regional validators
    for (const e of emitterRecipients) recipients.add(e);
    for (const v of regionalValidators) recipients.add(v);

    // DG only on DOP validation
    if (payload.notificationType === "validated_dop") {
      for (const dg of dgRecipients) recipients.add(dg);
    }

    // Finance (rôle Finance + marquer_payee) : toutes les notifications facture
    for (const fin of financeRecipients) recipients.add(fin);

    if (validEmail(payload.actorEmail)) recipients.add(payload.actorEmail);
    if (validEmail(payload.createdByEmail)) recipients.add(payload.createdByEmail);

    const recipientList = Array.from(recipients).filter(validEmail);
    if (recipientList.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "No recipients resolved for this notification.",
          notificationType: payload.notificationType,
        }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    const { subject, text, html, appUrl } = await buildEmailContent(
      payload.notificationType,
      payload.invoice ?? {},
    );
    const textBody = appUrl ? `${text}\n\n---\nOuvrir dans PMD : ${appUrl}` : text;

    const primaryTo = pickPrimaryRecipient(recipientList, payload);
    const ccList = recipientList.filter((e) => e.toLowerCase() !== primaryTo.toLowerCase());

    if (payload.dryRun || !isSmtpConfigured()) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          transport: "smtp",
          reason: payload.dryRun
            ? "dryRun requested"
            : "SMTP not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM; optional SMTP_FROM_NAME, SMTP_SECURE)",
          notificationType: payload.notificationType,
          recipients: recipientList,
          mailTo: primaryTo,
          mailCc: ccList,
          subject,
          body: textBody,
          html,
        }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    await sendMailGrouped(primaryTo, ccList, subject, textBody, html);

    return new Response(
      JSON.stringify({
        success: true,
        transport: "smtp",
        sent: 1,
        recipientCount: recipientList.length,
        mailTo: primaryTo,
        mailCc: ccList,
        recipients: recipientList,
        notificationType: payload.notificationType,
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
