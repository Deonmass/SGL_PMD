-- Empêche l'enregistrement de factures en doublon
-- Règle: numéro de facture unique, insensible à la casse et aux espaces autour
CREATE UNIQUE INDEX IF NOT EXISTS "FACTURES_numero_facture_unique_idx"
ON public."FACTURES" (lower(btrim("Numéro de facture")))
WHERE "Numéro de facture" IS NOT NULL
  AND btrim("Numéro de facture") <> '';
