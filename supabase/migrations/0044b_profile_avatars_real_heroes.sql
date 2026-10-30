-- =============================================================================
-- Groscove Ultra · 0044b · Foto da CONTA das pessoas ligadas aos heróis reais
--   A 0044 trocou a foto dos heróis (creator_profiles), mas a foto da conta (profiles.avatar_url),
--   usada no menu do topo, ainda apontava para o arquivo do personagem antigo, que foi apagado.
--   Só troca o que ainda aponta para os arquivos antigos. Reaplicável; sem drop/delete.
-- =============================================================================
update public.profiles p
   set avatar_url = v.new_url
  from (values
    ('/heroes/helena-vilar-avatar.webp',      '/heroes/erick-jacquin-avatar.webp'),
    ('/heroes/tiago-albuquerque-avatar.webp', '/heroes/neymar-avatar.webp'),
    ('/heroes/davi-nascimento-avatar.webp',   '/heroes/gabriel-medina-avatar.webp'),
    ('/heroes/camila-sato-avatar.webp',       '/heroes/joao-fonseca-avatar.webp'),
    ('/heroes/lia-monteiro-avatar.webp',      '/heroes/anitta-avatar.webp'),
    ('/heroes/rafael-duarte-avatar.webp',     '/heroes/ronaldinho-gaucho-avatar.webp'),
    ('/heroes/bruna-castellano-avatar.webp',  null),
    ('/heroes/marcos-ferraz-avatar.webp',     null)
  ) as v (old_url, new_url)
 where p.avatar_url = v.old_url;
