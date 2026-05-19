-- Migration pour mettre à jour les paiements existants avec NumeroFacture
-- Extrait le numéro de facture depuis l'ID au format: invoiceNumber-index-timestamp

-- Mise à jour des paiements existants avec NumeroFacture extrait de l'ID
UPDATE public."PAIEMENTS" 
SET "NumeroFacture" = 
  CASE 
    -- Format: YYYY-XXX-XXX-index-timestamp
    WHEN id ~ '^\d{4}-\d+-\d+-\d+-\d+$' THEN 
      substring(id from 1 for position('-' in substring(id from 9)) + 8)
    -- Format: YYYY-XXX-index-timestamp  
    WHEN id ~ '^\d{4}-\d+-\d+-\d+$' THEN
      CASE 
        WHEN substring(id from 9) ~ '^\d{1,2}$' THEN
          substring(id from 1 for 8) -- Seulement YYYY-XXX (index court)
        ELSE
          substring(id from 1 for position('-' in substring(id from 9)) + 8) -- YYYY-XXX-XXX
      END
    -- Format: YYYY-XXX-XXX-timestamp (sans index explicite)
    WHEN id ~ '^\d{4}-\d+-[A-Za-z0-9/]+-\d+$' THEN
      substring(id from 1 for position('-' in substring(id from 9)) + 8)
    -- Format: YYYY-XXX-timestamp
    WHEN id ~ '^\d{4}-\d+-\d+$' AND NOT id ~ '^\d{4}-\d+-\d+-\d+$' THEN
      CASE 
        WHEN substring(id from 9) ~ '^\d{1,2}$' THEN
          substring(id from 1 for 8) -- Seulement YYYY-XXX (index court)
        ELSE
          substring(id from 1 for position('-' in substring(id from 9)) + 8) -- YYYY-XXX-XXX
      END
    -- Fallback: utiliser la première partie avant le premier tiret
    ELSE
      split_part(id, '-', 1)
  END
WHERE "NumeroFacture" IS NULL OR "NumeroFacture" = '';

-- Afficher le nombre de paiements mis à jour
DO $$
DECLARE
    updated_count integer;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Nombre de paiements mis à jour: %', updated_count;
END $$;

-- Vérifier les résultats
SELECT 
    id,
    "NumeroFacture",
    montantPaye,
    datePaiement
FROM public."PAIEMENTS" 
WHERE "NumeroFacture" IS NOT NULL 
ORDER BY datePaiement DESC 
LIMIT 10;
