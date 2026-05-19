-- Ajouter les colonnes BanqueFournisseur et BanqueSGL à la table PAIEMENTS
alter table public."PAIEMENTS"
  add column if not exists "BanqueFournisseur" text,
  add column if not exists "BanqueSGL" text;
