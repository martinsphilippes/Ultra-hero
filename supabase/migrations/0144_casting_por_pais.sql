-- 0144 — Casting por país: Brasil e EUA (pedido do responsável, 17/11/2026).
--
-- A tela Casting ganha o seletor Brasil | EUA. O país de cada Hero já mora em talent_profiles.country (ISO de 2
-- letras; hoje todos 'BR'). Para cadastrar e importar Heros dos EUA, duas travas que só conheciam o Brasil passam a
-- aceitar os EUA também — nada que vale hoje deixa de valer:
--   • estado da ficha: UF para o Brasil; sigla dos 50 estados + DC para os EUA; outro país, sigla livre de até 3.
--   • celular do acesso (0112, Hero e contato da marca): além do celular brasileiro (+55 DDD 9XXXXXXXX), o número dos
--     EUA em E.164 (+1, código de área e número do plano norte-americano: nenhum dos dois começa com 0 ou 1).
-- Idempotente.

alter table public.talent_profiles drop constraint if exists talent_profiles_state_check;
alter table public.talent_profiles add constraint talent_profiles_state_check check (
  state is null
  or (country = 'BR' and state = any (array['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
                                             'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']))
  or (country = 'US' and state = any (array['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL',
                                             'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE',
                                             'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD',
                                             'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']))
  or (country not in ('BR', 'US') and state ~ '^[A-Z0-9]{1,3}$'));

alter table public.access_contacts drop constraint if exists access_contacts_phone_check;
alter table public.access_contacts add constraint access_contacts_phone_check check (
  phone_e164 ~ '^\+55[1-9][1-9]9[0-9]{8}$' or phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');

-- mesma assinatura e mesmas permissões (CREATE OR REPLACE)
create or replace function public.access_contact_valid(p_email text, p_phone text)
returns boolean language sql immutable set search_path = '' as $$
  select p_email is not null and char_length(p_email) <= 254 and p_email = lower(btrim(p_email))
     and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     and p_phone is not null and (p_phone ~ '^\+55[1-9][1-9]9[0-9]{8}$' or p_phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$')
$$;
