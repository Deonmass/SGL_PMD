-- Ajouter la colonne statut à la table AGENTS si elle n'existe pas
ALTER TABLE public."AGENTS"
ADD COLUMN IF NOT EXISTS "statut" text NOT NULL DEFAULT 'Actif';

-- Ajouter des contraintes si souhaité
ALTER TABLE public."AGENTS"
ADD CONSTRAINT statut_check CHECK (statut IN ('Actif', 'Inactif'));

-- Mettre à jour les enregistrements existants qui n'auraient pas de statut
UPDATE public."AGENTS" SET "statut" = 'Actif' WHERE "statut" IS NULL OR "statut" = '';
