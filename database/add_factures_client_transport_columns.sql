-- Colonnes Client, Titre de transport et numero sur FACTURES
ALTER TABLE public."FACTURES" ADD COLUMN IF NOT EXISTS "Client" text;
ALTER TABLE public."FACTURES" ADD COLUMN IF NOT EXISTS "Titre de transport" text;
ALTER TABLE public."FACTURES" ADD COLUMN IF NOT EXISTS "numero" text;
