-- Création de la table COMPTES
CREATE TABLE COMPTES (
    ID INT PRIMARY KEY IDENTITY(1,1),
    Fournisseur NVARCHAR(255) NOT NULL,
    Banque NVARCHAR(255) NOT NULL,
    Compte NVARCHAR(255) NOT NULL,
    DateCreation DATETIME DEFAULT GETDATE(),
    DateModification DATETIME DEFAULT GETDATE()
);

-- Ajout d'index pour améliorer les performances
CREATE INDEX IX_COMPTES_Fournisseur ON COMPTES(Fournisseur);
CREATE INDEX IX_COMPTES_Banque ON COMPTES(Banque);

-- Ajout de contrainte pour éviter les doublons
CREATE UNIQUE INDEX UX_COMPTES_Unique ON COMPTES(Fournisseur, Banque, Compte);
