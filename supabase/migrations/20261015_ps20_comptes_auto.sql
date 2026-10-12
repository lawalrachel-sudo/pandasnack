-- PS-20 — Profil enfant auto pour tout élève eleves_connus dont la famille a déjà un compte Snack.
-- Déclenché par trigger sur eleves_connus (PandApp upsert directement dans la base partagée → un
-- trigger est le seul point qui garantit le profil quel que soit le chemin d'écriture). La
-- pré-création de COMPTE (familles sans compte) reste au rattrapage applicatif (createUser).

create or replace function public.pandasnack_jour_creneau(p_classe text)
returns text language plpgsql immutable
set search_path to 'public','pg_temp'
as $function$
declare t text; c text;
begin
  c := lower(translate(coalesce(p_classe,''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucaaaeeeeiioouuuc'));
  foreach t in array regexp_split_to_array(c, '[^a-z]+') loop
    if t like 'mer%' then return 'mercredi';
    elsif t like 'sam%' then return 'samedi';
    elsif t like 'ven%' then return 'vendredi';
    end if;
  end loop;
  return null;
end $function$;

create or replace function public.pandasnack_prenom_key(p text)
returns text language sql immutable
set search_path to 'public','pg_temp'
as $function$
  select lower(btrim(translate(coalesce(p,''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucaaaeeeeiioouuuc')));
$function$;

create or replace function public.pandasnack_sync_eleve(p_eleve_id uuid)
returns void language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare
  e record; v_account record; v_metier text; v_classe text; v_default boolean;
begin
  select prenom, nom, classe, lower(btrim(email_parent)) as ep, lower(btrim(email_parent2)) as ep2
    into e from public.eleves_connus where id = p_eleve_id;
  if not found then return; end if;

  select id, source_group into v_account from public.accounts where lower(btrim(email)) = e.ep limit 1;
  if v_account.id is null and e.ep2 is not null then
    select id, source_group into v_account from public.accounts where lower(btrim(email)) = e.ep2 limit 1;
  end if;
  if v_account.id is null then return; end if;

  v_metier := case v_account.source_group
    when 'ecole_la_patience' then 'ecole'
    when 'panda_guest' then 'panda_guest'
    else 'pandattitude' end;
  v_classe := public.pandasnack_jour_creneau(e.classe);
  if v_classe is null and v_metier <> 'panda_guest' then return; end if;

  if exists (
    select 1 from public.profils p
    where p.account_id = v_account.id
      and public.pandasnack_prenom_key(p.prenom) = public.pandasnack_prenom_key(e.prenom)
  ) then return; end if;

  v_default := not exists (
    select 1 from public.profils p
    where p.account_id = v_account.id and p.metier = v_metier and p.is_default = true and p.archived_at is null
  );

  insert into public.profils (account_id, prenom, nom, classe, metier, type_profil, active, is_default)
  values (v_account.id, e.prenom, e.nom, v_classe, v_metier, 'eleve', true, v_default);

  update public.accounts set archived_at = null where id = v_account.id and archived_at is not null;
end $function$;

create or replace function public.pandasnack_eleve_trigger()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
begin
  perform public.pandasnack_sync_eleve(NEW.id);
  return NEW;
end $function$;

drop trigger if exists trg_pandasnack_sync_eleve on public.eleves_connus;
create trigger trg_pandasnack_sync_eleve
  after insert or update on public.eleves_connus
  for each row execute function public.pandasnack_eleve_trigger();

revoke all on function public.pandasnack_sync_eleve(uuid) from public, anon, authenticated;
grant execute on function public.pandasnack_sync_eleve(uuid) to service_role;
