# Integração com Instagram

Este projeto possui suporte para exibir as últimas publicações do Instagram na homepage utilizando a Meta Graph API.

## Pré-requisitos

- Conta Instagram Profissional (Empresa ou Criador)
- Página do Facebook vinculada ao Instagram
- Aplicação criada em https://developers.facebook.com

---

## Variáveis de Ambiente

Adicionar ao arquivo `.env`:

```env
INSTAGRAM_GRAPH_API_VERSION=v23.0
INSTAGRAM_USER_ID=
INSTAGRAM_ACCESS_TOKEN=
NEXT_PUBLIC_INSTAGRAM_PROFILE_URL=
```

Exemplo:

```env
INSTAGRAM_GRAPH_API_VERSION=v23.0
INSTAGRAM_USER_ID=17841400000000000
INSTAGRAM_ACCESS_TOKEN=EAABxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_INSTAGRAM_PROFILE_URL=https://www.instagram.com/automecanicabandeirantes/
```

---

## Passo 1 - Converter Instagram para Conta Profissional

No aplicativo Instagram:

Configurações → Conta → Tipo de Conta

Converter para:

- Empresa
ou
- Criador

---

## Passo 2 - Vincular uma Página do Facebook

O Instagram deve estar conectado a uma Página do Facebook.

Facebook:

Configurações da Página → Instagram

Conectar a conta do Instagram.

---

## Passo 3 - Criar Aplicação Meta

Acesse:

https://developers.facebook.com

Criar Aplicativo

Adicionar o produto:

- Instagram Graph API

ou

- Instagram API

---

## Passo 4 - Gerar Access Token

Utilize o Graph API Explorer.

Permissões recomendadas:

```text
instagram_basic
pages_show_list
pages_read_engagement
business_management
```

Após gerar o token:

- Trocar por Long-Lived Token
- Não utilizar token temporário em produção

---

## Passo 5 - Obter o Facebook Page ID

No Graph API Explorer execute:

```text
/me/accounts
```

Será retornado algo semelhante:

```json
{
  "data": [
    {
      "id": "123456789012345",
      "name": "Auto Mecânica Bandeirantes"
    }
  ]
}
```

Guarde o valor do campo:

```text
id
```

---

## Passo 6 - Obter o Instagram User ID

Execute:

```text
/{PAGE_ID}?fields=instagram_business_account
```

Exemplo:

```text
/123456789012345?fields=instagram_business_account
```

Resposta:

```json
{
  "instagram_business_account": {
    "id": "17841400000000000"
  }
}
```

O valor retornado será utilizado em:

```env
INSTAGRAM_USER_ID=17841400000000000
```

---

## Teste da API

Executar:

```text
/{INSTAGRAM_USER_ID}/media
```

ou

```text
/{INSTAGRAM_USER_ID}/media?fields=id,caption,media_type,media_url,permalink,timestamp
```

Se os dados forem retornados corretamente, a integração está funcionando.

---

## Segurança

Nunca exponha:

```env
INSTAGRAM_ACCESS_TOKEN
```

O token deve permanecer somente no backend.

Não utilize:

```env
NEXT_PUBLIC_INSTAGRAM_ACCESS_TOKEN
```

---

## Renovação do Token

Tokens Long-Lived expiram periodicamente.

Recomenda-se:

- Verificar validade mensalmente
- Renovar antes da expiração
- Monitorar erros da Meta Graph API

---

## Referências

Meta Developers

https://developers.facebook.com

Instagram Graph API

https://developers.facebook.com/docs/instagram-api

Graph API Explorer

https://developers.facebook.com/tools/explorer
