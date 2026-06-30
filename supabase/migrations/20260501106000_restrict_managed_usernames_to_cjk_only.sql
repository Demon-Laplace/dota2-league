begin;

create or replace function private.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    char_length(private.normalize_username(p_username)) between 1 and 10
    and private.normalize_username(p_username) ~ '^[一-龥]+$',
    false
  );
$$;

create or replace function private.username_to_auth_email(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v_username text := private.normalize_username(p_username);
begin
  if not private.is_valid_username(v_username) then
    raise exception 'Invalid username format. Use 1-10 Chinese characters.'
      using errcode = '22023';
  end if;

  return format('user_%s@internal.local', v_username);
end;
$$;

alter table private.auth_identities
  drop constraint if exists auth_identities_username_check;

alter table private.auth_identities
  add constraint auth_identities_username_check
    check (
      username is not null
      and username = private.normalize_username(username)
      and private.is_valid_username(username)
    )
    not valid;

comment on function private.is_valid_username(text) is 'Allows 1-10 Chinese characters for managed usernames. Existing legacy rows remain until rewritten.';

commit;
