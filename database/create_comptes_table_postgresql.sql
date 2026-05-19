-- Création de la table COMPTES pour PostgreSQL/Supabase
CREATE TABLE COMPTES (
    ID SERIAL PRIMARY KEY,
    Fournisseur VARCHAR(255) NOT NULL,
    Banque VARCHAR(255) NOT NULL,
    Compte VARCHAR(255) NOT NULL,
    SGL BOOLEAN NOT NULL DEFAULT FALSE,
    DateCreation TIMESTAMP DEFAULT NOW(),
    DateModification TIMESTAMP DEFAULT NOW()
);

-- Ajout d'index pour améliorer les performances
CREATE INDEX IX_COMPTES_Fournisseur ON COMPTES(Fournisseur);
CREATE INDEX IX_COMPTES_Banque ON COMPTES(Banque);

-- Ajout de contrainte pour éviter les doublons
CREATE UNIQUE INDEX UX_COMPTES_Unique ON COMPTES(Fournisseur, Banque, Compte);

-- Trigger pour mettre à jour DateModification automatiquement
CREATE OR REPLACE FUNCTION update_comptes_modification_time()
RETURNS TRIGGER AS $$
BEGIN
    NEW.DateModification = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_comptes_modification_time
    BEFORE UPDATE ON COMPTES
    FOR EACH ROW
    EXECUTE FUNCTION update_comptes_modification_time();
