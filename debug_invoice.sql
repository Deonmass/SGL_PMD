-- Requête pour vérifier la facture L 36956
SELECT 
    "Numéro de facture", 
    Statut, 
    Montant, 
    "validation DR", 
    "validation DOP", 
    "validation DG",
    Région,
    "Date de réception",
    "Centre de coût",
    Fournisseur
FROM FACTURES 
WHERE "Numéro de facture" LIKE '%36956%' 
   OR "Numéro de facture" = 'L 36956' 
   OR "Numéro de facture" = 'L-36956'
   OR "Numéro de facture" = '36956'
ORDER BY "Date de réception" DESC;
