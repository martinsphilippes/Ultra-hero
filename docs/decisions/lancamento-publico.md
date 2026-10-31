# Lançamento público: app gratuito, catálogo zerado e Termos do Parceiro

Decisão do responsável em 31/10/2026, antes de abrir o app nas lojas para o público geral.

## O que muda

- **App gratuito.** Não há mais planos, módulos nem assinatura simulada. Todo conteúdo é livre para quem tem conta (migração 0069). As tabelas de planos ficam no banco, sem uso.
- **Loja do site continua**, sem cobrança. Os Termos e a Política deixam de falar em "modo de teste" e passam a descrevê-la como "em fase de lançamento". O checkout real (InfinitePay) é uma etapa à parte.
- **Catálogo zerado.** Os 8 perfis de herói, os conteúdos, os programas e os colecionáveis saem do banco. A agência de demonstração também sai. As imagens saem do repositório (`public/heroes`, `public/content`, `public/collectibles`).
- **Contas zeradas.** Ficam só o admin e a conta de revisão das lojas. A `DEMO_ACCOUNTS_PASSWORD` sai da Vercel, o que desliga os botões de conta de exemplo.
- **Termos do Parceiro** (`/legal/partner-terms`, migração 0068). A pessoa aceita os Termos ao entrar por convite. Antes do primeiro envio de foto ou vídeo, ela confirma que tem os direitos sobre o material. Os dois aceites ficam gravados com a versão (`PARTNER_TERMS_VERSION`) e a data. O fluxo segue o modelo de cadastro de rede social: cada herói ou agência sobe o próprio material.

## Consequências

- Até os heróis publicarem, o catálogo fica vazio. **Não envie o app para revisão nas lojas com o catálogo vazio**: a Apple recusa apps sem conteúdo (diretriz 4.2), e o Google também pode recusar.
- Texto novo dos Termos do Parceiro: precisa de revisão jurídica antes do primeiro convite.
- Trocou o texto dos Termos do Parceiro de forma relevante? Atualize `PARTNER_TERMS_VERSION`. Na versão nova, a confirmação de direitos é pedida de novo.
