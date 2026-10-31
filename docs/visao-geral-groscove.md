# Groscove Ultra: visão geral completa

Documento de visão do produto. Junta três fontes:

1. **A conversa transcrita** sobre o novo rumo (agência, marcas e heróis).
2. **O que já está construído** no código e no banco (migrações 0001 a 0065).
3. **As decisões já aprovadas** em `docs/requisitos/` (DMR 1.0 e módulo de Gestão).

Onde a conversa e o que está planejado não batem, o texto diz isso e propõe um caminho.

---

## 1. Em uma frase

**O Groscove Ultra é o lugar onde marcas, heróis (influenciadores e personalidades) e a agência fecham, organizam e entregam campanhas, rápido e num só lugar. Com todos lá dentro, o mesmo sistema leva o conteúdo e os produtos até o público.**

Nas palavras da conversa: o Jonathan quer ser a melhor agência do Brasil porque consegue fazer a comunicação entre marca e influenciador mais rápido que todo mundo. O Groscove é a ferramenta que torna isso possível.

---

## 2. O problema

### A dor principal (B2B)
Hoje, uma campanha entre marca e influenciador passa por:

- **Muitos canais soltos:** WhatsApp, e-mail, DM do Instagram, planilha, PDF de media kit, contrato por e-mail.
- **Muita gente no meio:** marca, agência, gestor do influenciador e o próprio influenciador, cada um com sua versão da conversa.
- **Lentidão:** descobrir quem está disponível, quanto custa, se topa, quando pode gravar e se a marca aprovou o roteiro leva dias ou semanas.
- **Pouca visibilidade:** a marca não sabe em que pé está a campanha, a agência perde prazo e o influenciador esquece entrega.
- **Risco:** valores circulando em mensagens, contratos sem controle de versão e nenhuma trilha de quem aprovou o quê.

**Ninguém resolve bem a comunicação rápida entre marca e influenciador.** Essa é a dor que o Groscove ataca.

### A dor secundária (B2C)
O conteúdo das personalidades está espalhado pelas redes, sem estrutura. O fã consome, mas não tem um caminho para seguir (programa, receita, treino) nem para comprar o que o herói usa. Essa parte já está construída e vira o **canal de distribuição** da operação B2B.

---

## 3. Para quem o Groscove existe (os três lados e mais um)

| Lado | Quem é | O que ganha |
|---|---|---|
| **Marca** | empresa que quer fazer ação com influenciadores | encontra o herói certo, vê disponibilidade, faz a oferta, acompanha e aprova o conteúdo num só lugar |
| **Herói / creator** | personalidade ou influenciador | recebe ofertas organizadas, aceita ou recusa num toque, tem agenda, tarefas e contratos num lugar só, e não paga nada |
| **Agência** (a do Jonathan) | o "meio de campo" | controla todo o funil comercial, a comissão e o relacionamento, e responde mais rápido que qualquer concorrente |
| **Público / fã** | consumidor final | acessa o universo do herói (conteúdo, programas, receitas) e compra os produtos das campanhas |

Na conversa: *"se eu fizer isso, você ajudou os dois lados, os três lados"*.

---

## 4. A virada estratégica

A conversa deixa claro que o centro do produto mudou:

> *"Esquece tudo que a gente tava fazendo… é o esporro disso daí."*

| Antes | Agora |
|---|---|
| App de conteúdo e bem-estar com heróis (B2C) era o produto | **Plataforma de gestão entre marca, agência e herói (B2B) é o produto** |
| Loja e assinatura como receita principal | **Comissão da agência sobre campanhas** como receita principal |
| Fã era o primeiro usuário | **Marca e herói** são os primeiros usuários; o fã vem como consequência |

O que já existe para o fã **não é jogado fora**. Vira a ponta final do ciclo: *"no final, como tá todo mundo lá dentro, a gente faz a produção social, vende os produtos, porque desce pra população."*

### O ciclo completo

```
 MARCA                    AGÊNCIA                  HERÓI                    PÚBLICO
   │  procura herói,        │  intermedia,            │  aceita, cria,         │
   │  faz oferta ─────────► │  precifica, organiza ─► │  publica ────────────► │  consome e
   │                        │                         │                        │  compra
   │ ◄──── aprova conteúdo ─┴──── envia para aprovar ─┘                        │
   │                                                                           │
   └──────────────── produto e campanha chegam ao fã dentro do app ◄───────────┘
```

---

## 5. Por que as pessoas vão usar (a tese de adoção)

A pergunta da conversa: *"por que o cara vai usar, se ele já tá no Instagram postando?"*

A resposta do Jonathan: **o Instagram continua sendo onde se posta. O Groscove é onde se trabalha.** O que prende cada lado:

- **Contratos e ofertas estão lá.** Para receber trabalho, o herói precisa estar no sistema.
- **A agenda está lá.** É onde a marca vê quando o herói está livre e marca a ação.
- **A aprovação está lá.** A marca só aprova roteiro e conteúdo pelo sistema.
- **O dinheiro está lá.** Cachê, comissão e repasse são registrados ali (por enquanto simulados).

Assim o sistema vira obrigatório pelo fluxo de trabalho, e não por apelo. Se a marca e a agência só trabalham por ali, o herói entra também.

> ⚠️ Essa tese só se sustenta se o sistema for **mais rápido que o WhatsApp**. Ver o risco nº 1 na seção 14.

---

## 6. Como funciona na prática (o fluxo da conversa)

Este é o fluxo descrito na transcrição, organizado em passos:

1. **A marca entra no painel** e vê os heróis disponíveis (o catálogo autorizado pela agência).
2. **Escolhe com quem quer trabalhar.** Vê perfil, media kit, números e segmento.
3. **Vê a agenda do herói**, ou seja, os horários livres.
4. **Faz uma oferta:** "quero uma ação neste dia, neste horário, com esta entrega, por este valor".
5. **O herói recebe a oferta** e aceita ou recusa.
6. **Aceitou:** a ação fica marcada na agenda dos dois. A conexão está feita.
7. **Contrato:** por enquanto é só um "concordo" registrado. Assinatura eletrônica fica para depois, porque depende de integração externa.
8. **Produção:** com o acordo fechado, o herói (ou a equipe de produção) cria o conteúdo dentro do sistema.
9. **Aprovação:** a marca aprova ou pede ajuste. O herói também aprova o que sai em nome dele.
10. **Publicação:** o herói publica nas redes e envia a comprovação.
11. **Fechamento:** a agência encerra, registra comissão e repasse, e o patrocínio pode aparecer na página pública do herói.
12. **Distribuição:** conteúdo e produtos da campanha chegam ao público no app.

Na conversa: *"a gente não tem certeza, porque não trabalha com isso, mas quando mostrar, a galera vai falar 'é isso, isso, isso' e aí ajeita."* Ou seja, o fluxo é uma hipótese a validar com marcas e heróis reais.

---

## 7. Os módulos do sistema

### 7.1 Portal da Marca (`/marca`, só na web)
- **Início:** campanhas, ofertas enviadas, propostas recebidas e avisos.
- **Buscar heróis:** catálogo só com quem autorizou e foi liberado pela agência, com filtros (segmento, região, público). Cada sugestão explica o critério; sem dados suficientes, a tela diz "dados insuficientes".
- **Agenda e disponibilidade** do herói (ver a seção 9, ponto B).
- **Nova campanha / oferta:** briefing em etapas curtas, com rascunho automático e anexos.
- **Campanha:** linha do tempo, conversa registrada, aprovações de roteiro e de conteúdo.
- **Calendário comercial:** datas da agência (Dia das Mães, Black Friday…) com o botão "quero uma campanha nesta data".
- **Equipe da marca:** dono e colaboradores.
- **Isolamento:** a marca A nunca vê nada da marca B.

### 7.2 Portal da Agência (`/agencia`, só na web)
- **Início executivo:** negócios por etapa, contratos ativos, comissão, entregas atrasadas, heróis sem contato.
- **Casting:** ficha de cada herói ou talento, com segmentos, redes, media kit, documentos e histórico.
- **Marcas:** carteira de clientes.
- **Pipeline:** funil comercial do briefing ao encerramento, com shortlist, consulta de interesse e proposta.
- **Tarefas, agenda da equipe e calendário comercial.**
- **Financeiro (simulado):** comissões e repasses, com seis formas de comissão aprovadas (percentual, fixa, híbrida, escalonada, por entregável e markup sobre o cachê).
- **Hierarquia:** o Adm da agência vê valores; Gestor e Colaborador **nunca** recebem valores, nem na tela nem na resposta do servidor.

### 7.3 Escritório do Herói (`/creator/escritorio`, no app e na web)
- **Oportunidades:** ofertas para aceitar, recusar ou pedir conversa.
- **Agenda e tarefas:** o que tem para fazer e quando.
- **Media kit:** editor, prévia e link público com escolha campo a campo do que aparece (`/kit/[token]`).
- **Consentimento (LGPD)** para aparecer no catálogo das marcas.
- **Contratos e entregas** compartilhados pela agência.
- **Gratuito** para o herói.
- No app das lojas aparece **sem valores**.

### 7.4 Área pública / app do fã (já existe)
- **Feed** estilo Instagram, Explorar e página do herói com atalhos (Dia a dia, Alimentação, Treinos, Gastronomia, Programas, Produtos).
- **Programas** em etapas, com certificado.
- **Receitas** com Modo Cozinha e lista de compras.
- **Hoje e Evolução:** relógio simulado, sequência e "Você vs Hero".
- **Loja de teste, colecionáveis com lance ao vivo e contratação de profissionais** (nutricionista, personal).
- **Assinatura simulada** por módulos.
- Heróis atuais: Neymar, Gabriel Medina, João Fonseca, Anitta, Ronaldinho Gaúcho e Érick Jacquin (uso de imagem sob contrato informado pelo responsável).

### 7.5 Administração geral (`/admin`)
Cerca de 30 telas: usuários, convites, heróis, marcas, agência, produtos, pedidos, profissionais, colecionáveis, indicadores, configurações e auditoria de tudo.

---

## 8. Estágio atual

O módulo de Gestão foi dividido em seis etapas (A a F), e cada uma é publicada sozinha.

| Etapa | O que entrega | Situação |
|---|---|---|
| **A · Fundação** | agência e marca com equipe, convites, sino de avisos, documentos privados, contas de demonstração | ✅ feita (0064) |
| **B · Casting e media kit** | casting da agência, media kit, link público `/kit`, escritório do herói, consentimento | ✅ feita (0065) |
| **C · Briefing até a proposta** | briefing da marca, pipeline, busca de heróis, consulta de interesse, cálculo de comissão, proposta | ⏳ próxima |
| **D · Contratação e entregas** | aceite do contrato, 12 tarefas por campanha, roteiro e conteúdo aprovados pela marca | ⏳ |
| **E · Agenda** | agenda dos três portais, calendário comercial, exportação para Google/Apple Agenda (`.ics`) | ⏳ |
| **F · Financeiro e dashboards** | comissões e repasses simulados, inícios com indicadores, alertas de relacionamento | ⏳ |

**Resumo:** a base (quem é quem, quem pode o quê, casting) está pronta. O coração da conversa (oferta, aceite, agenda, aprovação) está **especificado, mas ainda não construído**.

---

## 9. O que a conversa pede e o que está planejado: onde bate e onde não bate

| # | Conversa | Planejado hoje | Avaliação |
|---|---|---|---|
| A | Marca vê heróis e escolhe | Busca de heróis no portal da marca (Etapa C) | ✅ bate |
| B | **Marca vê a agenda do herói** e oferta num horário | Agenda só na Etapa E, e o evento privado do herói **não aparece** para ninguém | ❌ **lacuna** |
| C | **Oferta direta e rápida:** marca oferta, herói aceita, está marcado | Fluxo mais pesado: briefing → agência monta shortlist → consulta de interesse → proposta → aceite | ⚠️ **conflito de velocidade** |
| D | Contrato agora é só "concordo"; assinatura depois | Aceite "registrado no app"; assinatura eletrônica é integração futura | ✅ bate |
| E | Herói cria conteúdo; marca aprova ou reprova | Roteiro e entregáveis aprovados pela marca (Etapa D) | ✅ bate |
| F | **O herói também aprova** | Não previsto (o herói é quem envia) | ⚠️ ajustar se outra pessoa produz por ele |
| G | Talvez não seja bom no celular | Marca e agência só na web; escritório do herói no app | ✅ bate |
| H | "Segundo aplicativo" | Não previsto | ❓ precisa de decisão (seção 15) |
| I | Agência como meio de campo | Agência é intermediária obrigatória: a marca não negocia valor direto com o herói | ✅ bate, mas tensiona com C |

### Proposta para B: disponibilidade sem expor a vida do herói
A marca **não deve ver a agenda inteira** do herói (privacidade e segurança, porque são pessoas famosas). A proposta:

- O herói (ou a agência) marca **janelas disponíveis para ações** ("livre para gravação", "livre para evento").
- A marca vê só **livre ou ocupado** nessas janelas, sem título nem local de outros compromissos.
- Ao aceitar uma oferta, o horário vira compromisso nas duas agendas.

Vantagem: atende o pedido sem vazar a rotina de ninguém. Desvantagem: o herói ou a agência precisa manter as janelas atualizadas. Mitigação: integrar o Google Agenda mais tarde para ler o livre/ocupado automaticamente.

### Proposta para C: dois caminhos de negócio
O fluxo completo da Etapa C é bom para campanhas grandes, mas é lento para "quero o herói X na terça às 15h". A proposta é ter dois caminhos sobre a mesma base:

| | **Oferta rápida** (novo) | **Campanha completa** (planejada) |
|---|---|---|
| Para quê | ação pontual: 1 herói, 1 data, 1 entrega | campanha com vários heróis, entregas e etapas |
| Fluxo | marca escolhe herói e horário → oferta → **agência confirma o valor** → herói aceita → marcado | briefing → shortlist → consulta → proposta → contrato |
| Tempo esperado | horas | dias |
| Agência | continua no meio: confirma, ajusta o valor e registra a comissão | conduz tudo |

Assim a agência **continua sendo o meio de campo** (o modelo de negócio do Jonathan), mas sem travar a velocidade, que é a promessa central. A oferta rápida pode ser "promovida" a campanha completa se crescer.

**Decisão necessária:** a oferta da marca chega ao herói direto (e a agência só acompanha) ou passa primeiro pela agência? Recomendo **passar pela agência com prazo curto** (por exemplo, 2 horas, com alerta), porque protege o valor e a comissão.

---

## 10. Regras de negócio principais

1. **Uma identidade, vários papéis:** a mesma pessoa pode ser fã, herói e membro de marca.
2. **Herói só aparece para marcas** com consentimento dado e liberação da agência.
3. **Valores são separados fisicamente** e só o Adm da agência os vê por completo. O herói vê **só o próprio cachê**; a marca vê **só o total da proposta dela**.
4. **Uma agência ativa por marca.**
5. **Toda mudança de etapa, valor, aprovação e contrato fica auditada** (quem, quando, o quê).
6. **Comissão é cobrada da marca**, com seis formas configuráveis em três níveis (padrão da agência → marca → negócio).
7. **Mudar a regra de comissão não altera negócio já fechado.**
8. **Nada de dinheiro real** até existir integração financeira aprovada; toda tela de valores diz "registro interno, sem cobrança real".
9. **Métricas sempre com fonte e data** ("declarado pela agência em DD/MM"); sem dado, aparece "não informado", nunca zero.
10. **Conta de demonstração nunca vê nem mexe em dados reais.**

---

## 11. Casos especiais a tratar

- **Herói recusa:** a marca recebe o motivo (lista fixa) e sugestões parecidas.
- **Ninguém responde:** a oferta expira num prazo definido, com lembrete antes.
- **Duas marcas querem o mesmo horário:** quem é aceito primeiro trava a janela; a segunda oferta é avisada.
- **Herói é concorrente de outra marca** (exclusividade de categoria): é preciso bloquear oferta de marca concorrente durante o contrato. *Não está previsto; recomendo incluir.*
- **Marca muda o pedido depois do aceite:** volta para o herói confirmar.
- **Remarcação ou cancelamento:** com motivo, histórico e aviso aos dois lados.
- **Conteúdo reprovado várias vezes:** limite de rodadas de ajuste definido na oferta.
- **Herói sem login** (gerido só pela agência): a agência responde por ele.

---

## 12. Papéis e permissões

| Papel | Vê | Faz |
|---|---|---|
| **Admin da plataforma** | tudo | gere a plataforma inteira |
| **Adm da agência** | tudo da agência, inclusive valores | equipe, comissões, propostas com preço, financeiro |
| **Gestor da agência** | casting, marcas, pipeline (sem valores) | toca negócios, shortlist, contratos sem valores |
| **Colaborador da agência** | os negócios dele (sem valores) | tarefas, agenda, contatos |
| **Dono da marca** | campanhas da marca e total das propostas | oferta, aprova, convida a equipe |
| **Colaborador da marca** | campanhas da marca | acompanha e aprova conforme permissão |
| **Herói** | as próprias ofertas e o próprio cachê | aceita, recusa, cria, publica |
| **Fã** | conteúdo público e liberado | consome e compra |

---

## 13. Indicadores que o sistema deve mostrar

**Para a agência (a prova de que ela é a mais rápida):**
- tempo médio da oferta até o aceite;
- tempo médio do briefing até a proposta;
- taxa de aceite por herói e por marca;
- entregas no prazo (%);
- comissão do mês e acumulada;
- heróis sem contato há N dias.

**Para a marca:** campanhas ativas, custo por entrega, entregas aprovadas na primeira rodada, alcance declarado.

**Para o herói:** ofertas recebidas, aceitas e concluídas, ganhos do período (só no web) e próximas entregas.

> 💡 O indicador "**tempo de resposta**" é o argumento de venda do Jonathan. Ele deve ser medido desde o primeiro dia e virar destaque no início da agência e até no media kit ("responde em média em 3 h").

---

## 14. Riscos

1. **Avisos fora do sistema.** Pelo plano atual (decisão D8), **marca e agência só recebem avisos dentro do portal**: sem e-mail e sem push. Isso **contradiz a promessa de rapidez**. Se a marca precisa abrir o site para saber que o herói aceitou, ela volta para o WhatsApp. **Recomendação:** antecipar e-mail transacional e, depois, avisos por WhatsApp (API oficial) para ofertas, aceites e aprovações.
2. **Adoção pelo herói.** Herói famoso raramente opera sistema; quem opera é o assessor. O fluxo precisa funcionar com **o assessor agindo em nome do herói**, e o aceite precisa ser de um toque, pelo celular.
3. **Métricas declaradas.** Marca quer números reais de Instagram, TikTok e YouTube. Hoje são declarados. Integração com as APIs oficiais é necessária para ganhar confiança.
4. **Escopo espalhado.** Loja, leilão, profissionais, relógio, receitas e gestão competem por tempo. Com a virada, o B2C deve **congelar** (manter, não expandir) até o fluxo de oferta funcionar.
5. **Contrato só com "concordo".** Serve para demonstração e piloto. Para dinheiro real, é preciso assinatura eletrônica e revisão jurídica do termo.
6. **Dependência dos heróis atuais.** Seis personalidades reais com contrato de imagem são um ativo forte e um risco se um contrato cair.
7. **Fluxo não validado.** A própria conversa admite: "a gente não trabalha com isso". Mostrar a marcas e assessores reais **antes** de construir as etapas D a F.

---

## 15. Decisões pendentes

1. **A oferta da marca passa pela agência antes de chegar ao herói?** Recomendo: sim, com prazo curto e alerta.
2. **A marca vê a agenda como?** Recomendo: só janelas livre/ocupado definidas pelo herói ou pela agência.
3. **Quem aprova o conteúdo do lado do herói:** o próprio herói, o assessor ou os dois?
4. **"Segundo aplicativo":** é um app separado só para negócios ou o escritório dentro do app atual? Recomendo: **não fazer segundo app agora**. A marca e a agência usam a web (o próprio diálogo duvida da usabilidade no celular); o herói usa o escritório dentro do app atual. Reavaliar depois do piloto.
5. **Avisos por e-mail e WhatsApp para marca e agência:** antecipar? Recomendo: sim, e-mail já na Etapa C.
6. **Exclusividade de categoria** (herói não atende marca concorrente durante o contrato): incluir?

---

## 16. Próximos passos sugeridos

1. **Decidir os 6 pontos da seção 15.**
2. **Ajustar a Etapa C** para incluir a **oferta rápida** com disponibilidade (seções 9-B e 9-C) e o e-mail de aviso.
3. **Antecipar uma agenda mínima** (janelas disponíveis) da Etapa E para junto da C, porque é o coração da demonstração.
4. **Montar a demonstração do fluxo** com a agência e as contas demo: marca escolhe herói → vê horário livre → oferta → agência confirma → herói aceita → marcado.
5. **Mostrar a 3 a 5 marcas e assessores reais** e ajustar ("a galera vai falar: é isso, isso, isso").
6. **Só então** seguir com D (contrato e entregas), E completo e F (financeiro).
7. **Depois do piloto:** assinatura eletrônica, métricas reais das redes, Google Agenda, pagamento real e várias agências.

---

## 17. Melhorias futuras (visão de longo prazo)

- **IA de recomendação** de herói por marca, explicando o motivo (a base por regra já está especificada).
- **Assistente que rascunha o briefing** a partir de uma frase da marca ("quero lançar um suplemento para corredores em março").
- **Assistente que rascunha a resposta do herói** e o roteiro, sempre como rascunho que um humano confirma.
- **Relatório automático de campanha** com publicações e números.
- **Plataforma para várias agências** (o banco já está preparado), o que vira um novo modelo de negócio: SaaS para agências.
- **Pagamento e repasse reais** com split (marca paga, agência e herói recebem).
- **Fechar o ciclo B2C:** cada campanha gera automaticamente a vitrine do produto e o conteúdo no app do fã, com medição de venda por herói.
