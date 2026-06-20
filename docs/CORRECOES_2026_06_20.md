# Correções aplicadas em 2026-06-20

Este documento registra as correções aplicadas após a revisão profunda do projeto.

## Segurança, SaaS e operação

- Login por host/conta deixou de escolher usuário de forma ambígua quando o mesmo e-mail existe em mais de uma filial da mesma conta.
  - Se o host já resolve uma filial específica, o login usa essa filial.
  - Se o host resolve apenas a conta e houver múltiplas filiais para o mesmo e-mail, a API exige seleção explícita da oficina/filial.
  - A tela de login e a tela de recuperação de senha exibem seletor de filial quando o contexto público informar mais de uma filial ativa.
- Link de recuperação de senha passou a usar a origem confiável da requisição, preservando domínio/subdomínio da oficina quando válido, com fallback para `APP_URL`.
- Links públicos de acompanhamento/orçamento agora têm expiração persistida em `ServiceOrder.publicTokenExpiresAt`.
  - Nova OS recebe expiração inicial.
  - Geração/reenvio de orçamento renova o prazo.
  - Encerramento da OS invalida o link público; aprovação/recusa mantém o acompanhamento até o TTL e bloqueia nova decisão pelo status do orçamento.
  - `PUBLIC_TRACKING_TOKEN_TTL_DAYS` controla o prazo padrão.
- Caddyfile deixou de ter domínio fixo; agora usa `PLATFORM_BASE_DOMAIN`.
- Nginx e Next.js passaram a enviar headers adicionais de segurança: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy`.
- Dockerfile do web deixou de ignorar lint de forma fixa; `NEXT_DISABLE_ESLINT_DURING_BUILD` virou argumento configurável.

## Quotas e consistência transacional

- A quota mensal de OS passou a ser consumida dentro da transação de criação da OS, tanto na criação direta quanto na conversão de lead.
- A quota mensal de uploads passou a ser consumida na mesma transação do registro do asset.
- Em caso de falha após salvar o arquivo local, o arquivo é removido para evitar órfãos.
- A quota `STORAGE_MB` passou a ser aplicada com base no somatório real de `UploadAsset.sizeBytes` da conta.
- O resumo de quotas passou a mostrar armazenamento usado em MB calculado a partir dos assets cadastrados.
- O consumo de quotas por contador agora bloqueia a linha com `FOR UPDATE`, reduzindo corrida em operações concorrentes.

## Orçamento

- Adicionado desconto percentual por item do orçamento.
  - O desconto é informado na tela da OS antes de gerar/regerar o orçamento.
  - Cada `QuoteItem` persiste `discountPercent` e `discountAmount`.
  - O total do item já considera o desconto percentual.
  - A aprovação pública/garagem exibe percentual, valor descontado e valor original riscado.
  - Aprovação parcial recalcula totais da OS usando somente itens aprovados e já com desconto por item.
- O desconto geral da OS continua existindo e é aplicado depois da soma de serviços e peças já descontados por item.

## Banco de dados

Nova migration adicionada:

```txt
apps/api/prisma/migrations/20260620203000_quote_item_discount_public_token_expiry
```

Ela adiciona:

- `service_orders.publicTokenExpiresAt`
- índice de expiração do token público
- `quote_items.discountPercent`
- `quote_items.discountAmount`

As migrations que estavam com datas futuras foram renomeadas para timestamps de 2026-06-20, preservando a ordem relativa.

> Atenção: se as migrations com nomes antigos já tiverem sido aplicadas em algum banco, não renomeie diretamente no ambiente já aplicado sem reconciliar a tabela `_prisma_migrations`.

## Pendência técnica controlada

Os services/componentes maiores ainda devem ser quebrados em use cases/componentes menores gradualmente. Nesta correção foram extraídas regras pontuais e documentado o alvo de refatoração, mas uma decomposição ampla foi evitada para não introduzir regressão sem a suíte completa executável no ambiente de edição.
