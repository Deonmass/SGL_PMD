-- Migration simple pour mettre à jour les paiements existants avec NumeroFacture
-- Logique simple: extraire le numéro de facture depuis l'ID

-- Mise à jour des paiements existants
UPDATE public."PAIEMENTS" 
SET "NumeroFacture" = 
  CASE 
    -- Si l'ID contient au moins 2 tirets, extraire jusqu'au 2ème tiret
    WHEN length(id) - length(replace(id, '-', '')) >= 2 THEN
      substring(id from 1 for position('-' in substring(id from position('-' in id) + 1)) + position('-' in id) - 1)
    -- Sinon, extraire jusqu'au premier tiret
    ELSE
      split_part(id, '-', 1)
  END
WHERE "NumeroFacture" IS NULL OR "NumeroFacture" = '';

-- Afficher les résultats
SELECT 
    COUNT(*) as total_updated
FROM public."PAIEMENTS" 
WHERE "NumeroFacture" IS NOT NULL;

-- Afficher un échantillon des résultats
SELECT 
    id,
    "NumeroFacture",
    montantPaye,
    datePaiement
FROM public."PAIEMENTS" 
WHERE "NumeroFacture" IS NOT NULL 
ORDER BY datePaiement DESC 
LIMIT 5;
