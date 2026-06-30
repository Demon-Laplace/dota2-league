begin;

create or replace function public.resolve_item_visibility(
  p_item_catalog_id uuid,
  p_stage text default 'used'
)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_visibility text;
  v_stage text := lower(coalesce(p_stage, 'used'));
begin
  if p_item_catalog_id is null then
    return 'public';
  end if;

  select ic.visibility_default
  into v_visibility
  from public.item_catalog ic
  where ic.id = p_item_catalog_id;

  if not found or v_visibility is null then
    return 'public';
  end if;

  if v_visibility = 'hidden_until_match_approved' then
    return case
      when v_stage in ('approved', 'match_approved') then 'public'
      else 'hidden_until_match_approved'
    end;
  end if;

  if v_visibility = 'hidden_until_used' then
    return case
      when v_stage in ('used', 'applied', 'approved', 'match_approved') then 'public'
      else 'hidden_until_used'
    end;
  end if;

  if v_visibility in ('public', 'staff_only') then
    return v_visibility;
  end if;

  return 'public';
end;
$$;

comment on function public.resolve_item_visibility(uuid, text)
  is 'Resolves the visibility_mode to persist for match item usages based on the item catalog default visibility and lifecycle stage.';

grant execute on function public.resolve_item_visibility(uuid, text) to anon, authenticated;

commit;
