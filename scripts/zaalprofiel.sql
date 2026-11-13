-- Uitsluitend SELECT op Invest V0: pgajmjeicrwxthkwwiei.
-- Financiële activa privé + vennootschap, geen vastgoed of ondernemingswaarde.
-- Deelnemerscohort zoals de V0-admin: unie van beide editie-koppelingen,
-- uitsluitend klanten; geen beheerders, mentoren of planningsscenario's.
with leden as (
  select user_id from public.edition_users
  where edition_id = 'a47bafc8-7619-4161-904a-ebc8e62f468b'
  union
  select id from public.users
  where edition_id = 'a47bafc8-7619-4161-904a-ebc8e62f468b'
), deelnemers as (
  select u.id from leden l join public.users u on u.id = l.user_id
  where u.is_admin = false and u.user_type = 'klant'
    and not ('mentor' = any(coalesce(u.roles, '{}'::text[])))
), cellen as (
  select v.user_id, v.scope, k.key as categorie, k.value as cel
  from public.vermogen v join deelnemers d on d.id = v.user_id
  cross join lateral jsonb_each(to_jsonb(v)) k
  where v.scenario = 0
    and k.key in ('cash','aandelen','etf','obligaties','pensioensparen','tak2123',
                  'crypto','grondstoffen','private_equity','alternatief','tweede_pijler','vapz')
    and not (v.scope = 'vennootschap' and k.key = 'vapz')
), bedragen as (
  select user_id, categorie,
    case when jsonb_typeof(cel->'posities') = 'array'
              and jsonb_array_length(cel->'posities') > 0
      then coalesce((select sum(coalesce(nullif(p->>'waarde','')::numeric,0))
                     from jsonb_array_elements(cel->'posities') p),0)
      else coalesce(nullif(cel->>'waarde','')::numeric,0)
    end as bedrag
  from cellen
  where coalesce((cel->>'enabled')::boolean, false)
     or coalesce(nullif(cel->>'waarde','')::numeric,0) > 0
), per_deelnemer as (
  select user_id, sum(bedrag) as totaal from bedragen group by user_id
), groepen as (
  select categorie, sum(bedrag) as bedrag from bedragen group by categorie
)
select
  (select count(*) from deelnemers) as deelnemers,
  count(*) filter (where totaal > 0) as positief_ingevuld,
  coalesce(sum(totaal),0) as financieel_vermogen,
  avg(totaal) filter (where totaal > 0) as gemiddelde,
  (select jsonb_agg(to_jsonb(g) order by categorie) from groepen g) as verdeling,
  (select count(*) from (
    select v.user_id,v.scope from public.vermogen v join deelnemers d on d.id=v.user_id
    where v.scenario=0 group by v.user_id,v.scope having count(*)>1
  ) dubbel) as dubbele_actuele_scopes
from per_deelnemer;
