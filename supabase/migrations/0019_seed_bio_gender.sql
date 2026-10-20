-- 0019: unifica o gênero de "personagem fictício" nas bios do seed.
-- O selo e os textos da interface dizem "Personagem fictício" para todos os heróis (termo de papel,
-- sem flexão de gênero, como "herói"). Quatro bios do seed (0008) diziam "Personagem fictícia criada".
-- Só o seed muda; bios editadas pelo próprio herói não começam com essa frase e ficam intactas.
update public.creator_profiles
set bio = replace(bio, 'Personagem fictícia criada para a demonstração.', 'Personagem fictício criado para a demonstração.')
where bio like 'Personagem fictícia criada para a demonstração.%';
