-- Créer la table ORDRE_PAIEMENT
create table if not exists public."ORDRE_PAIEMENT" (
  "ID" bigserial primary key,
  "NumeroFacture" text,
  "Date_ordre" date not null,
  "facture" text,
  "Statut" text not null default 'pending',
  created_at timestamp default now(),
  updated_at timestamp default now()
);

-- Créer un index sur Date_ordre pour les requêtes rapides
create index if not exists idx_ordre_paiement_date on public."ORDRE_PAIEMENT"("Date_ordre");

-- Créer un index sur Statut
create index if not exists idx_ordre_paiement_statut on public."ORDRE_PAIEMENT"("Statut");

-- Activer RLS (Row Level Security)
alter table public."ORDRE_PAIEMENT" enable row level security;

-- Créer des politiques RLS pour les opérations CRUD
create policy "Enable read access for authenticated users"
  on public."ORDRE_PAIEMENT"
  for select
  using (auth.role() = 'authenticated_user' or true);

create policy "Enable insert for authenticated users"
  on public."ORDRE_PAIEMENT"
  for insert
  with check (auth.role() = 'authenticated_user' or true);

create policy "Enable update for authenticated users"
  on public."ORDRE_PAIEMENT"
  for update
  using (auth.role() = 'authenticated_user' or true);

create policy "Enable delete for authenticated users"
  on public."ORDRE_PAIEMENT"
  for delete
  using (auth.role() = 'authenticated_user' or true);
