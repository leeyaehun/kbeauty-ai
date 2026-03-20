alter table products
add column if not exists global_affiliate_url text;

alter table products
add column if not exists region text default 'korea';

update products
set global_affiliate_url = affiliate_url
where affiliate_url like '%global.oliveyoung%'
  and (global_affiliate_url is null or global_affiliate_url = '');

update products
set region = 'global'
where affiliate_url like '%global.oliveyoung%';

update products
set region = 'korea'
where affiliate_url like '%oliveyoung.co.kr%';

create or replace function match_products(
  query_embedding vector(1536),
  category_filter text,
  region_filter text default 'korea',
  match_count int default 6
)
returns table (
  id uuid,
  name text,
  brand text,
  price integer,
  category text,
  affiliate_url text,
  global_affiliate_url text,
  image_url text,
  skin_profile jsonb,
  similarity float
)
language plpgsql
stable
as $$
begin
  set local statement_timeout = '25s';

  return query
  select
    p.id,
    p.name,
    p.brand,
    p.price,
    p.category,
    p.affiliate_url,
    p.global_affiliate_url,
    p.image_url,
    p.skin_profile,
    1 - (p.embedding <=> query_embedding) as similarity
  from products p
  where
    (category_filter is null or p.category = category_filter)
    and p.embedding is not null
    and p.price > 0
    and p.region = region_filter
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;
