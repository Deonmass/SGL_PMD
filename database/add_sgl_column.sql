-- Ajouter la colonne SGL à la table COMPTES
alter table public."COMPTES"
  add column if not exists "SGL" boolean not null default false;
