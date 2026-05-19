-- Ajouter la colonne devise à la table COMPTES
alter table public."COMPTES"
  add column if not exists "devise" text;
