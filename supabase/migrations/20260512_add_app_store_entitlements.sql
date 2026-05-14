alter table public.user_plans
  add column if not exists entitlement_source text,
  add column if not exists app_store_product_id text,
  add column if not exists app_store_transaction_id text,
  add column if not exists app_store_original_transaction_id text,
  add column if not exists app_store_environment text,
  add column if not exists app_store_purchase_at timestamptz,
  add column if not exists app_store_expires_at timestamptz,
  add column if not exists app_store_last_verified_at timestamptz;

create index if not exists user_plans_app_store_original_transaction_id_idx
  on public.user_plans (app_store_original_transaction_id);
