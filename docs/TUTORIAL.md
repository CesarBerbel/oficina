# Tutorial de Uso do Sistema — Oficina

Guia passo a passo de como utilizar a plataforma de gestão da oficina, com prints
de cada tela. As imagens foram capturadas da base de demonstração (seed), então os
dados que aparecem são exemplos.

> **Como ler este tutorial:** ele segue a ordem do menu lateral (Atendimento →
> Catálogo → Estoque & Compras → Gestão → Sistema) e, ao final, cobre o **site
> público** e o **acompanhamento do cliente**. Use o índice abaixo para pular
> direto ao módulo desejado.

## Índice

- [1. Acesso ao sistema (login)](#1-acesso-ao-sistema-login)
- [2. Visão geral da tela](#2-visão-geral-da-tela)
- [3. Atendimento](#3-atendimento)
  - [3.1 Dashboard](#31-dashboard)
  - [3.2 Operacional](#32-operacional)
  - [3.3 Inbox](#33-inbox)
  - [3.4 Central de ações](#34-central-de-ações)
  - [3.5 Clientes](#35-clientes)
  - [3.6 Veículos](#36-veículos)
  - [3.7 Check-in](#37-check-in)
  - [3.8 Ordens de Serviço (OS)](#38-ordens-de-serviço-os)
  - [3.9 Kanban Técnico](#39-kanban-técnico)
- [4. Catálogo](#4-catálogo)
  - [4.1 Serviços](#41-serviços)
  - [4.2 Combos](#42-combos)
- [5. Estoque & Compras](#5-estoque--compras)
  - [5.1 Estoque](#51-estoque)
  - [5.2 Importar NF-e](#52-importar-nf-e)
  - [5.3 Compras](#53-compras)
- [6. Gestão](#6-gestão)
  - [6.1 Recepção (Pré-atendimento)](#61-recepção-pré-atendimento)
  - [6.2 CRM Pós-venda](#62-crm-pós-venda)
  - [6.3 Blog](#63-blog)
  - [6.4 Relatórios](#64-relatórios)
- [7. Sistema (Configurações)](#7-sistema-configurações)
  - [7.1 Hub de configurações](#71-hub-de-configurações)
  - [7.2 Site público](#72-site-público)
  - [7.3 Categorias](#73-categorias)
  - [7.4 Mensagens](#74-mensagens)
  - [7.5 CRM pós-venda (regras)](#75-crm-pós-venda-regras)
  - [7.6 Operação diária (regras)](#76-operação-diária-regras)
  - [7.7 Usuários e permissões](#77-usuários-e-permissões)
  - [7.8 Assistente de IA](#78-assistente-de-ia)
  - [7.9 Auditoria](#79-auditoria)
  - [7.10 Notificações (push)](#710-notificações-push)
- [8. Site público](#8-site-público)
- [9. Acompanhamento do cliente](#9-acompanhamento-do-cliente)

---

## 1. Acesso ao sistema (login)

Acesse o endereço do sistema (em desenvolvimento, `http://localhost:3000/login`).
O sistema é **multi-oficina**, por isso o login pede três dados:

| Campo | Descrição |
| --- | --- |
| **Oficina** | identificador da oficina (ex.: `oficina-modelo`) |
| **E-mail** | seu e-mail de acesso |
| **Senha** | sua senha |

Na base de demonstração, o botão **"Preencher dados de demonstração"** completa os
campos automaticamente. Clique em **Entrar** para acessar.

![Tela de login](imgs/00-login.png)

---

## 2. Visão geral da tela

Depois de entrar, a interface tem três áreas fixas:

- **Menu lateral (esquerda):** navegação por seções — Atendimento, Catálogo,
  Estoque & Compras, Gestão e Sistema.
- **Barra superior:** busca global (cliente, placa ou número de OS — atalho
  `Ctrl K`), sino de notificações, alternância de tema (claro/escuro) e o menu do
  usuário.
- **Área central:** o conteúdo da tela selecionada.

---

## 3. Atendimento

### 3.1 Dashboard

Visão geral da oficina. Mostra cartões com os números do dia: **OS ativas**,
**diagnóstico pronto**, **aguardando aprovação**, **aprovadas**, **em execução**,
**prontas**, **atrasadas**, **estoque baixo** e **compras pendentes**. Logo abaixo
ficam o **ciclo médio**, a **produtividade por técnico**, o **tempo médio por
etapa** e um resumo da **Central de ações**.

![Dashboard](imgs/01-dashboard.png)

### 3.2 Operacional

Painel da operação diária com regras configuráveis: fila do dia, alertas e
indicadores em tempo quase real para quem toca o atendimento.

![Operacional](imgs/02-operacional.png)

### 3.3 Inbox

Central de notificações internas — avisos do sistema e eventos relevantes das OS
chegam aqui para o atendimento/administração.

![Inbox](imgs/03-inbox.png)

### 3.4 Central de ações

Lista de pendências priorizadas (ex.: *OS aguardando diagnóstico*, *peças com
estoque baixo*). Cada item leva direto à tela onde a ação deve ser resolvida.

![Central de ações](imgs/04-central-acoes.png)

### 3.5 Clientes

Cadastro de clientes. A lista permite buscar por nome, telefone ou e-mail. Use
**"+ Novo cliente"** para cadastrar.

![Lista de clientes](imgs/05-clientes.png)

Ao abrir um cliente, você vê os **dados de contato**, os **veículos** vinculados e
o **histórico** de ordens de serviço.

![Detalhe do cliente](imgs/05b-cliente-detalhe.png)

### 3.6 Veículos

Cadastro de veículos (placa, marca, modelo, ano), sempre associado a um cliente.
A busca aceita placa. Os veículos também podem ser criados a partir do cadastro do
cliente ou do check-in.

![Veículos](imgs/06-veiculos.png)

### 3.7 Check-in

Registro de entrada do veículo na oficina. A lista mostra os check-ins em
andamento.

![Lista de check-in](imgs/07-check-in.png)

Em **"Novo"** você registra a chegada do veículo: cliente, veículo, problema
relatado e os itens de inspeção. Esse check-in é o ponto de partida para abrir a
ordem de serviço.

![Novo check-in](imgs/08-check-in-novo.png)

### 3.8 Ordens de Serviço (OS)

O coração do sistema. A lista mostra todas as OS com número, cliente/veículo,
técnico responsável, status e total. Use o filtro **"Todos os status"** para
refinar e **"+ Nova OS"** para abrir uma nova.

![Lista de OS](imgs/09-os-lista.png)

Ao abrir uma OS, a tela traz tudo em um só lugar:

- **Esteira de estados** no topo (Entrada → Diagnóstico → Orçamento → Aprovado →
  Em execução → Testado → Finalizado → Cliente avisado → Veículo retirado), com as
  ações disponíveis no momento.
- **Cliente** e **Veículo**, **problema relatado** e **diagnóstico**.
- **Serviços e peças** com subtotais e o **resumo financeiro** (serviços, peças,
  desconto e total).
- **Modo técnico mobile**: checklist, observações e fotos do técnico — itens podem
  ser marcados como públicos para aparecer na consulta do cliente.
- **Timeline da OS**: histórico de cada mudança de status e evento.
- Botões **"Gerar PDF"** e ações de transição de estado.

![Detalhe da OS](imgs/09b-os-detalhe.png)

### 3.9 Kanban Técnico

Quadro visual das OS em andamento, organizado por etapa (Entrada/diagnóstico, Em
orçamento, Aguardando aprovação, Aprovada, Em execução, Em teste, Pronta/
retirada). Os cards podem ser **arrastados** para a próxima coluna quando houver
uma transição rápida válida, ou movidos pelos botões de ação rápida do card. OS
canceladas, entregues e recusadas ficam fora do quadro.

![Kanban técnico](imgs/10-kanban.png)

---

## 4. Catálogo

### 4.1 Serviços

Catálogo de serviços oferecidos (mão de obra), com preço e as peças padrão
associadas a cada serviço.

![Serviços](imgs/11-servicos.png)

### 4.2 Combos

Pacotes que agrupam vários serviços. Ao adicionar um combo na OS, ele se
**expande** nos serviços que o compõem.

![Combos](imgs/12-combos.png)

---

## 5. Estoque & Compras

### 5.1 Estoque

Cadastro de peças e insumos. A lista mostra nome, marca, SKU, tipo, quantidade em
estoque e preço de venda. Itens no/abaixo do mínimo aparecem destacados; o botão
**"Estoque baixo"** filtra apenas esses. Use **"+ Nova peça"** para cadastrar.

![Estoque](imgs/13-estoque.png)

### 5.2 Importar NF-e

Importação de notas fiscais eletrônicas (XML ou ZIP) para dar entrada de peças no
estoque automaticamente, sem digitação manual.

![Importar NF-e](imgs/14-nfe-import.png)

### 5.3 Compras

Pedidos de compra a fornecedores. Ao **receber** um pedido, as quantidades entram
no estoque automaticamente.

![Compras](imgs/15-compras.png)

---

## 6. Gestão

### 6.1 Recepção (Pré-atendimento)

Central de Atendimento da recepção: fila, agenda, confirmação, chegada e conversão
para OS em uma jornada única. Os cartões no topo resumem **Novos**, **Retornos**,
**Hoje**, **Confirmados**, **Chegaram** e **Viraram OS**. Busca por nome, telefone
ou placa; alerta quando a placa pertence a outro cliente; e botão **"Receber
direto"** para atendimento imediato.

![Recepção](imgs/16-recepcao.png)

### 6.2 CRM Pós-venda

Acompanhamento pós-venda: lembretes de revisão, clientes inativos, campanhas e
ações de retenção, conforme as regras configuradas.

![CRM Pós-venda](imgs/17-crm.png)

### 6.3 Blog

Gestão de artigos do blog do site público (criar, editar, publicar). Há suporte a
upload de imagem e à **geração do artigo por IA** a partir do assunto.

![Blog](imgs/18-blog.png)

### 6.4 Relatórios

Relatórios gerenciais: faturamento, OS por status e rankings.

![Relatórios](imgs/19-relatorios.png)

---

## 7. Sistema (Configurações)

### 7.1 Hub de configurações

A área **Configurações** reúne todos os ajustes do sistema em cartões. A partir
daqui você acessa as telas das subseções a seguir.

![Hub de configurações](imgs/20-configuracoes.png)

### 7.2 Site público

Dados da oficina exibidos no site: nome, contatos, capacidade, logo e textos
institucionais. O **endereço** é cadastrado em campos separados (CEP, rua, número,
complemento, bairro, cidade, UF) com **busca automática por CEP**. O **rodapé do
PDF** tem um editor com formatação (negrito, itálico, sublinhado e listas).

![Configuração do site](imgs/21-site-config.png)

### 7.3 Categorias

Categorias de clientes, serviços e peças usadas para organizar os cadastros.

![Categorias](imgs/22-categorias.png)

### 7.4 Mensagens

Templates de mensagens (WhatsApp/e-mail) com variáveis e os **eventos automáticos**
que as disparam (ex.: OS aberta, diagnóstico pronto, orçamento enviado/aprovado, OS
pronta, veículo entregue).

![Mensagens](imgs/23-mensagens.png)

### 7.5 CRM pós-venda (regras)

Regras que alimentam o CRM: janelas de revisão, critérios de inatividade, campanhas
e retenção.

![Regras de CRM](imgs/24-config-crm.png)

### 7.6 Operação diária (regras)

Regras do painel **Operacional**: alertas, fila e parâmetros do inbox.

![Regras de operação](imgs/25-config-operacional.png)

### 7.7 Usuários e permissões

Cadastro de funcionários, atribuição de perfis e controle de acesso (RBAC). Cada
perfil define o que o usuário enxerga no menu e pode executar.

![Usuários](imgs/26-usuarios.png)

### 7.8 Assistente de IA

Configuração do provedor de IA (OpenAI/Gemini), a **chave de API** (armazenada
criptografada) e as instruções. Além da instrução geral, há **instruções por campo**
(relato/diagnóstico/observações da OS, corpo de mensagens e artigo do blog) — deixe
em branco para usar o padrão. A página também mostra o **uso recente da IA** (chamadas
e tokens dos últimos 30 dias). A IA auxilia em diagnóstico/observações da OS, corpo
de mensagens e geração de artigos do blog.

![Assistente de IA](imgs/27-ia.png)

### 7.9 Auditoria

Histórico de eventos e alterações do sistema — quem fez o quê e quando.

![Auditoria](imgs/28-auditoria.png)

### 7.10 Notificações (push)

Ativação das notificações push do navegador (PWA) e demais avisos.

![Notificações](imgs/29-notificacoes.png)

---

## 8. Site público

Além do sistema interno, a plataforma serve o **site público** da oficina, com SEO,
versão responsiva e blog. Páginas:

**Home** — destaque, marcas atendidas, diferenciais, serviços, depoimentos e CTA de
orçamento/WhatsApp.

![Site — Home](imgs/40-site-home.png)

**Sobre**

![Site — Sobre](imgs/41-site-sobre.png)

**Serviços**

![Site — Serviços](imgs/42-site-servicos.png)

**Garagem** — área onde o cliente consulta os veículos cadastrados.

![Site — Garagem](imgs/43-site-garagem.png)

**Blog**

![Site — Blog](imgs/44-site-blog.png)

**Contato** — endereço clicável (Google Maps/Waze), telefones e formulário.

![Site — Contato](imgs/45-site-contato.png)

**Consulta** — o cliente informa a placa e recebe um código de acesso por e-mail
para consultar sua garagem.

![Site — Consulta](imgs/46-site-consulta.png)

---

## 9. Acompanhamento do cliente

Cada OS gera um **link público de acompanhamento** (`/acompanhar/<token>`) que pode
ser enviado ao cliente. Sem necessidade de login, ele vê o veículo, o problema
relatado, a **linha do tempo** e o **orçamento** com o total — apenas o que foi
marcado como público pela oficina.

![Acompanhamento da OS](imgs/47-acompanhar.png)

---

## Como as imagens deste tutorial foram geradas

Os prints foram capturados automaticamente com Playwright, a partir da base de
demonstração (seed). O script vive em
[`apps/web/e2e/screenshots.spec.ts`](../apps/web/e2e/screenshots.spec.ts). Para
regenerar (com API em `:3333` e Web em `:3000` rodando e o seed aplicado):

```bash
pnpm --filter @oficina/web exec playwright test screenshots --workers=1
```

As imagens ficam em [`docs/imgs/`](imgs/).
