begin;

create or replace function private.is_valid_username(p_username text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    char_length(private.normalize_username(p_username)) between 3 and 32
    and private.normalize_username(p_username) ~ '^[a-z0-9_一-龥]+$',
    false
  );
$$;

alter table private.auth_identities
  drop constraint if exists auth_identities_username_check;

alter table private.auth_identities
  add constraint auth_identities_username_check
    check (
      username is not null
      and username = private.normalize_username(username)
      and private.is_valid_username(username)
    );

comment on function private.is_valid_username(text) is 'Allows 3-32 chars made of lowercase latin letters, digits, underscore, or CJK usernames.';

commit;
