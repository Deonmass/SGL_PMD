-- Création des tables pour le système de gestion des factures

-- Table des factures
CREATE TABLE IF NOT EXISTS public."FACTURES" (
  "ID" bigserial primary key,
  "Date emission" date,
  "Date de réception" date,
  "Numéro de facture" text,
  "Fournisseur" text,
  "Catégorie fournisseur" text,
  "Région" text,
  "Centre de coût" text,
  "Gestionnaire" text,
  "Type de facture" text,
  "Catégorie de charge" text,
  "Numéro de dossier" text,
  "Motif / Description" text,
  "Devise" text,
  "Taux facture" numeric(18,6),
  "montant facture" numeric(18,2),
  "Montant" numeric(18,2),
  "Validité" text,
  "Niveau urgence" text,
  "Délais de paiement" integer,
  "Échéance" date,
  "Mode de paiement requis" text,
  "Facture attachée" text,
  "Commentaires" text,
  "Statut" text,
  "validation DR" boolean,
  "validation DOP" boolean,
  "validation DG" boolean,
  "Rejet" boolean
);

CREATE UNIQUE INDEX IF NOT EXISTS "FACTURES_numero_facture_unique_idx"
ON public."FACTURES" (lower(btrim("Numéro de facture")))
WHERE "Numéro de facture" IS NOT NULL
  AND btrim("Numéro de facture") <> '';

-- Table des fournisseurs
CREATE TABLE IF NOT EXISTS public."FOURNISSEURS" (
  "ID" bigserial primary key,
  "Fournisseur" text not null,
  "Catégorie fournisseur" text not null,
  constraint "FOURNISSEURS_unique" unique ("Fournisseur")
);

-- Table des agents
CREATE TABLE IF NOT EXISTS public."AGENTS" (
  "ID" bigserial primary key,
  "Nom" text not null,
  "email" text not null,
  "Role" text not null,
  "REGION" text not null,
  constraint "AGENTS_email_unique" unique ("email")
);

-- Table des centres de coût
CREATE TABLE IF NOT EXISTS public."CENTRE_DE_COUT" (
  "ID" bigserial primary key,
  "Designation" text not null,
  "REGION" text not null,
  constraint "CENTRE_DE_COUT_designation_unique" unique ("Designation")
);

-- Table des charges
CREATE TABLE IF NOT EXISTS public."CHARGES" (
  "ID" bigserial primary key,
  "designation_Charges" text not null,
  "Bloquant" text not null,
  constraint "CHARGES_designation_unique" unique ("designation_Charges")
);

-- Insertion de données de test pour les fournisseurs
INSERT INTO public."FOURNISSEURS" ("Fournisseur", "Catégorie fournisseur") VALUES
('Société Générale', 'Banque'),
('Total Energies', 'Énergie'),
('Orange RDC', 'Télécommunication'),
('Brasseries du Congo', 'Boissons'),
('SNEL', 'Énergie'),
('Vodacom RDC', 'Télécommunication'),
('Airtel RDC', 'Télécommunication'),
('Rawbank', 'Banque'),
('TMB', 'Banque'),
('Ecobank', 'Banque')
ON CONFLICT ("Fournisseur") DO NOTHING;

-- Insertion de données de test pour les agents
INSERT INTO public."AGENTS" ("Nom", "email", "Role", "REGION") VALUES
('Jean Mukendi', 'jean.mukendi@sgl.com', 'Directeur Administratif', 'OUEST'),
('Marie Kabeya', 'marie.kabeya@sgl.com', 'Responsable Financier', 'OUEST'),
('Pierre Ntumba', 'pierre.ntumba@sgl.com', 'Chef de Projet', 'EST'),
('Sophie Kalonji', 'sophie.kalonji@sgl.com', 'Responsable Logistique', 'SUD'),
('Michel Mbemba', 'michel.mbemba@sgl.com', 'Directeur Technique', 'OUEST')
ON CONFLICT (email) DO NOTHING;

-- Insertion de données de test pour les centres de coût
INSERT INTO public."CENTRE_DE_COUT" ("Designation", "REGION") VALUES
('Direction Générale', 'OUEST'),
('Ressources Humaines', 'OUEST'),
('Finance', 'OUEST'),
('Opérations', 'EST'),
('Logistique', 'SUD'),
('Maintenance', 'OUEST'),
('Informatique', 'OUEST'),
('Marketing', 'OUEST')
ON CONFLICT ("Designation") DO NOTHING;

-- Insertion de données de test pour les charges
INSERT INTO public."CHARGES" ("designation_Charges", "Bloquant") VALUES
('Loyer bureau', 'Oui'),
('Électricité', 'Oui'),
('Téléphone', 'Non'),
('Carburant véhicule', 'Oui'),
('Maintenance équipement', 'Oui'),
('Fournitures de bureau', 'Non'),
('Assurance', 'Oui'),
('Internet', 'Oui'),
('Nettoyage', 'Non'),
('Sécurité', 'Oui')
ON CONFLICT ("designation_Charges") DO NOTHING;
