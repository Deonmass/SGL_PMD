-- MIGRATION D'URGENCE - À EXÉCUTER IMMÉDIATEMENT
-- Met à jour NumeroFacture pour tous les paiements existants

-- ÉTAPE 1: Vérifier l'état actuel
SELECT 
    id,
    "NumeroFacture",
    montantPaye,
    datePaiement
FROM public."PAIEMENTS" 
ORDER BY datePaiement DESC 
LIMIT 5;

-- ÉTAPE 2: Mettre à jour tous les paiements avec NumeroFacture extrait de l'ID
UPDATE public."PAIEMENTS" 
SET "NumeroFacture" = 
    CASE 
        -- Format: YYYY-XXX-XXX-index-timestamp (ex: 2026-00652-1-1713801234567)
        WHEN id ~ '^\d{4}-\d+-\d+-\d+-\d+$' THEN
            substring(id from 1 for position('-' in substring(id from 9)) + 8)
        -- Format: YYYY-XXX-index-timestamp (ex: 2026-00652-1-1713801234567)
        WHEN id ~ '^\d{4}-\d+-\d+-\d+$' AND length(id) - length(replace(id, '-', '')) >= 2 THEN
            substring(id from 1 for position('-' in substring(id from 9)) + 8)
        -- Format simple: YYYY-XXX-timestamp
        ELSE
            CASE 
                WHEN length(id) - length(replace(id, '-', '')) >= 2 THEN
                    substring(id from 1 for position('-' in substring(id from position('-' in id) + 1)) + position('-' in id) - 1)
                ELSE
                    split_part(id, '-', 1)
            END
    END
WHERE "NumeroFacture" IS NULL OR "NumeroFacture" = '';

-- ÉTAPE 3: Vérifier les résultats
SELECT 
    COUNT(*) as nombre_paiements_mis_a_jour
FROM public."PAIEMENTS" 
WHERE "NumeroFacture" IS NOT NULL;

-- ÉTAPE 4: Afficher les paiements mis à jour
SELECT 
    id,
    "NumeroFacture",
    montantPaye,
    datePaiement
FROM public."PAIEMENTS" 
WHERE "NumeroFacture" IS NOT NULL 
ORDER BY datePaiement DESC 
LIMIT 5;
