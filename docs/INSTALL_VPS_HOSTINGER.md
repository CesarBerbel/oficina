# Instalação do zero numa VPS Hostinger (com subdomínio por oficina)

Passo a passo para **formatar a VPS** e subir o sistema do jeito que conversamos:
o stack roda em **Docker**, atrás do **servidor web do host** que já atende as
portas `80/443`, com **um subdomínio por oficina** (`nomedaoficina.meudominio.cloud`)
usando **wildcard de DNS + TLS**, e ainda suportando **domínio próprio de terceiro**
(com verificação por TXT).

> **Atenção ao porteiro (80/443).** Nas VPS Hostinger com Ubuntu, o front normalmente
> é o **OpenLiteSpeed** (em geral gerenciado pelo **CyberPanel**) — não o Nginx. Este
> guia usa o **OpenLiteSpeed como reverse proxy** (seção 7‑A). Se você reinstalar com
> um Ubuntu “puro” (sem OpenLiteSpeed), pode usar o **Nginx do host** (seção 7‑B).
> **Não rode os dois ao mesmo tempo** — só um pode escutar a 80/443.

> Visão geral da arquitetura: o porteiro do host atende `80/443` (TLS por domínio) e
> faz **reverse proxy** para o Nginx interno do Docker em `127.0.0.1:18081`, que
> distribui para `web` (Next.js) e `api` (NestJS). A oficina é resolvida pelo
> **host** da requisição (tabela `TenantDomain`). Detalhes em
> [`OPERACAO_PRODUCAO.md`](OPERACAO_PRODUCAO.md) (seção 12) e [`DEPLOY.md`](DEPLOY.md).

Convenções deste guia (troque pelos seus valores):
- domínio-base: `meudominio.cloud`
- painel administrativo: `app.meudominio.cloud`
- IP da VPS: `203.0.113.10`

---

## 0. Pré-requisitos

- VPS Hostinger **KVM** com **≥ 4 GB de RAM** (o build do Next.js é pesado; com 2 GB,
  use swap — passo 2 — ou faça o build em outra máquina).
- Um domínio que você controla (`meudominio.cloud`).
- Acesso ao **hPanel** da Hostinger e ao painel de **DNS** do domínio.

---

## 1. Formatar / reinstalar a VPS (hPanel)

1. hPanel → **VPS** → seu servidor → **Sistema operacional** → **Reinstalar**.
2. Escolha o template. Duas opções, conforme o porteiro que você quer:
   - **“Ubuntu 24.04 + OpenLiteSpeed/CyberPanel”** — se você quer manter o
     OpenLiteSpeed como front (e já serve outros sites nele). Use a seção **7‑A**.
   - **“Ubuntu 24.04” puro** (ou “+ Docker”) — front via **Nginx** (seção **7‑B**).
3. Defina a senha de root (ou cadastre sua **chave SSH** — recomendado).
4. Aguarde a reinstalação concluir e anote o **IP** da VPS. Se veio com CyberPanel,
   anote também a senha do painel (porta `8090`).

> ⚠️ Reinstalar **apaga tudo** no servidor. Faça backup do que precisar antes.

---

## 2. Primeiro acesso e preparação do sistema

Conecte por SSH:

```bash
ssh root@203.0.113.10
```

Atualize e crie um usuário não-root com sudo (boa prática):

```bash
apt update && apt -y upgrade
adduser deploy
usermod -aG sudo deploy
# copia sua chave SSH para o novo usuário (se usa chave):
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Firewall (libere só SSH, HTTP e HTTPS — o `18081` é loopback e não é exposto):

```bash
apt -y install ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

(Opcional, recomendado em VPS com pouca RAM) **swap de 2 GB** para o build não falhar:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Reentre como `deploy` para os próximos passos:

```bash
exit
ssh deploy@203.0.113.10
```

---

## 3. Instalar Docker e Git

> Pule o Docker se usou um template que já o traz.

```bash
# Docker Engine + plugin compose (script oficial)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # aplica o grupo sem precisar deslogar

# Git
sudo apt -y install git
```

Confirme:

```bash
docker --version && docker compose version
```

> **Não instale o Nginx do host** se o servidor já roda **OpenLiteSpeed** — eles
> brigam pela porta 80/443. O front continua sendo o OpenLiteSpeed (seção 7‑A).
> O Docker convive numa porta interna (`127.0.0.1:18081`), sem conflito.

---

## 4. Clonar o projeto e configurar o `.env`

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/CesarBerbel/oficina.git
cd oficina
cp .env.example .env
```

Gere segredos fortes e cole no `.env`:

```bash
sh scripts/generate-secrets.sh
```

Edite o `.env` (`nano .env`) e ajuste **no mínimo**:

```bash
# Banco (senha forte; em produção o Postgres não fica exposto fora do Docker)
POSTGRES_USER=oficina
POSTGRES_PASSWORD=<senha-forte>
POSTGRES_DB=oficina

# Segredos (cole os gerados pelo generate-secrets.sh)
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
GARAGE_JWT_SECRET=...
ENCRYPTION_KEY=...

# Produção: cookies seguros (HTTPS)
AUTH_COOKIE_SECURE=true

# URLs públicas (painel administrativo)
WEB_ORIGIN=https://app.meudominio.cloud
APP_URL=https://app.meudominio.cloud

# Domínios das oficinas:
TENANT_DOMAIN_REQUIRE_VERIFIED=true
# Subdomínios SEUS entram verificados sem TXT; domínios de terceiros exigem TXT.
TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES=meudominio.cloud

# E-mail: ou configure SMTP real, ou desligue com MAIL_DRIVER=log
MAIL_DRIVER=smtp
SMTP_HOST=smtp.suaempresa.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=nao-responder@meudominio.cloud
SMTP_PASS=<senha-smtp>
SMTP_FROM="Oficina <nao-responder@meudominio.cloud>"

# (Opcional) Web Push — gere com: npx web-push generate-vapid-keys
# VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  NEXT_PUBLIC_VAPID_PUBLIC_KEY=<mesma pública>
```

E garanta o nome do projeto (usado pelos scripts de backup) no fim do `.env`:

```bash
echo 'COMPOSE_PROJECT_NAME=oficina' >> .env
```

> O `docker-compose.prod.yml` já força `NODE_ENV=production` na API — por isso o
> boot **valida** os segredos. Se algum estiver fraco/de exemplo, o container da
> API não sobe (proposital). Use os valores do `generate-secrets.sh`.

---

## 5. Subir o stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- O build pode levar alguns minutos (Next.js + Nest).
- As **migrations do banco são aplicadas automaticamente** no boot da API.

Verifique a saúde (responde só localmente, na 18081):

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:18081/healthz
curl -fsS http://127.0.0.1:18081/api/health/ready
```

Se algo não subir, veja os logs: `docker compose -f docker-compose.prod.yml logs -f api`.

---

## 6. DNS — apontar o domínio para a VPS

No painel de DNS do `meudominio.cloud`, crie:

```
A   app   203.0.113.10        # painel administrativo
A   *     203.0.113.10        # curinga: cobre TODOS os subdomínios de oficina
A   @     203.0.113.10        # (opcional) o domínio raiz
```

> O registro **`*` (curinga)** é o que faz `qualquercoisa.meudominio.cloud` cair na
> VPS sem você criar um DNS novo por oficina. Aguarde a propagação (minutos a horas).

### Sobre o certificado curinga (TLS)
Um certificado **wildcard** (`*.meudominio.cloud`) exige o desafio **DNS‑01**, que
precisa de **API do provedor de DNS**. O Let’s Encrypt **não** tem plugin oficial
para o DNS da Hostinger. Você tem duas opções:

- **A (recomendada p/ muitos subdomínios): usar Cloudflare no DNS.** Aponte os
  *nameservers* do domínio para a Cloudflare (grátis), recrie os registros A acima
  lá, e emita o cert wildcard via DNS‑01 (CyberPanel no passo 7‑A, ou certbot no
  passo 7‑B). Um único cert serve infinitas oficinas.
- **B (mais simples, sem API de DNS): um cert por subdomínio** via HTTP‑01,
  mantendo o DNS na Hostinger (Issue SSL por site no CyberPanel, ou passo 7‑C no
  Nginx). Funciona, mas exige emitir o cert a cada oficina nova.

---

## 7. Porteiro do host (reverse proxy) + HTTPS

O porteiro precisa: (1) atender `80/443`, (2) fazer reverse proxy para
`http://127.0.0.1:18081` **preservando o Host original** (é assim que a app
descobre a oficina) e (3) ter o TLS do domínio. Escolha **uma** opção: **7‑A**
(OpenLiteSpeed, padrão na Hostinger) **ou** **7‑B** (Nginx, Ubuntu puro).

### 7‑A. OpenLiteSpeed / CyberPanel (recomendado na Hostinger)

O OpenLiteSpeed já é o front. Crie um site para o domínio e configure-o como
reverse proxy para o Docker.

**1. Criar o site (CyberPanel):** painel em `https://IP_DA_VPS:8090` → **Websites →
Create Website** → domínio `app.meudominio.cloud` (e/ou `meudominio.cloud` para o
curinga, veja abaixo).

**2. Emitir SSL:** **Websites → Manage → Issue SSL** (Let's Encrypt). Para
**wildcard** (`*.meudominio.cloud`), use **SSL → Manage SSL** com validação **DNS**
(requer DNS com API, ex.: Cloudflare — mesmo princípio do 7‑B).

**3. Reverse proxy → Docker:** em **Websites → Manage → vHost Conf** (ou o botão
**Reverse Proxy** nas versões novas do CyberPanel), defina o backend e o contexto:

```
extprocessor oficina {
  type                    proxy
  address                 127.0.0.1:18081
  maxConns                100
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 oficina
  addDefaultCharset       off
}
```

Salve e reinicie o OpenLiteSpeed:

```bash
sudo systemctl restart lsws   # ou: sudo /usr/local/lsws/bin/lswsctrl restart
```

> No modo proxy o LiteSpeed **repassa o Host original** ao backend por padrão — que
> é o que a app precisa. Confirme no passo 9 que a oficina resolve; se aparecer
> “site indisponível”, o Host não está chegando (revise o contexto de proxy).
>
> **Upload de fotos/logos:** no vHost (Tuning → *Max Request Body Size*) suba para
> ~`25M`.

**Curinga no OpenLiteSpeed:** crie o vHost para `meudominio.cloud` e, no listener
SSL, mapeie também `*.meudominio.cloud` para ele (Listeners → SSL → *Virtual Host
Mappings*: `meudominio.cloud, *.meudominio.cloud`). Com o SSL wildcard do passo 2,
todos os subdomínios passam a servir pelo mesmo vHost/proxy — criar oficina nova
não exige mexer no servidor.

---

### 7‑B. Alternativa: Nginx do host (Ubuntu sem OpenLiteSpeed)

> Só use esta opção se o servidor **não** roda OpenLiteSpeed. Instale o Nginx:
> `sudo apt -y install nginx`.

```bash
sudo apt -y install certbot python3-certbot-dns-cloudflare

# Token de API da Cloudflare com permissão de editar DNS da zona:
sudo mkdir -p /root/.secrets
echo 'dns_cloudflare_api_token = SEU_TOKEN' | sudo tee /root/.secrets/cloudflare.ini
sudo chmod 600 /root/.secrets/cloudflare.ini

# Emite o cert curinga + o apex
sudo certbot certonly \
  --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d '*.meudominio.cloud' -d 'meudominio.cloud' \
  --deploy-hook 'systemctl reload nginx'
```

Crie o vhost `/etc/nginx/sites-available/oficina.conf`:

```nginx
# Redireciona HTTP → HTTPS
server {
    listen 80;
    server_name app.meudominio.cloud *.meudominio.cloud meudominio.cloud;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name app.meudominio.cloud *.meudominio.cloud meudominio.cloud;

    ssl_certificate     /etc/letsencrypt/live/meudominio.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/meudominio.cloud/privkey.pem;

    client_max_body_size 25m;   # uploads (fotos, logos)

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
        # ESSENCIAL: leva o host real até a app (é assim que ela acha a oficina).
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Ative e recarregue:

```bash
sudo ln -s /etc/nginx/sites-available/oficina.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

#### 7‑C. (Nginx, sem wildcard) Um cert por subdomínio

Crie o vhost **sem** as linhas `ssl_*` (deixe o certbot preenchê-las) com
`server_name app.meudominio.cloud;` e o mesmo `location /` acima. Depois, para
cada host (o painel e cada oficina), rode:

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d app.meudominio.cloud
# a cada oficina nova (após criar o A do subdomínio):
sudo certbot --nginx -d nomedaoficina.meudominio.cloud
```

> O certbot já instala um timer de **renovação automática**.

---

## 8. Primeira execução — criar a matriz e o super admin

Abra no navegador:

```
https://app.meudominio.cloud/instalar
```

Preencha os dados da **oficina matriz** e do **super usuário** (acessa todas as
oficinas). Concluído, faça login normalmente. A tela `/instalar` só funciona
enquanto o banco ainda não tem nenhuma oficina.

---

## 9. Criar uma oficina em `nomedaoficina.meudominio.cloud`

1. Logado, crie a **oficina** (tenant) no sistema.
2. Vá em **Configurações › Domínios** e cadastre `nomedaoficina.meudominio.cloud`.
   - Como o domínio bate com `TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES`, ele entra
     **verificado na hora** (sem TXT).
3. **Com wildcard de DNS+TLS**: já funciona — abra `https://nomedaoficina.meudominio.cloud`.
   **Sem wildcard**: crie o `A nomedaoficina` no DNS e emita o TLS do subdomínio
   (CyberPanel: Issue SSL no site; Nginx: `sudo certbot --nginx -d
   nomedaoficina.meudominio.cloud`).

### Oficina com domínio próprio (de terceiro)
1. A oficina aponta o domínio dela (`oficinadoze.com.br`) para a VPS (registro A).
2. Em **Configurações › Domínios**, cadastre `oficinadoze.com.br` → **não verificado**.
3. Publique o **TXT** `_oficina-verify.oficinadoze.com.br` = token e clique **Verificar**.
4. Emita o TLS desse domínio no porteiro (CyberPanel: novo site + Issue SSL +
   reverse proxy; Nginx: `sudo certbot --nginx -d oficinadoze.com.br`).

---

## 10. Backup, monitoramento e atualizações

```bash
# Backup automático diário (banco + uploads + manifesto)
sh scripts/install-backup-cron.sh

# Checagem rápida de saúde (Nginx do Docker está em 127.0.0.1:18081)
BASE_URL=http://127.0.0.1:18081 sh scripts/monitor-prod.sh
```

Atualizar para uma nova versão:

```bash
cd /opt/oficina
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build   # migrations no boot
sh scripts/monitor-prod.sh
```

Rotina completa de backup/restore e healthchecks em
[`OPERACAO_PRODUCAO.md`](OPERACAO_PRODUCAO.md).

---

## Resumo do que faz o quê

| Camada | Quem | Papel |
|---|---|---|
| Portas 80/443 + **TLS por domínio** | **Porteiro do host**: OpenLiteSpeed/CyberPanel (ou Nginx) | termina HTTPS e faz reverse proxy → `127.0.0.1:18081` |
| Roteamento interno | Nginx do Docker (catch-all) | repassa para `web`/`api` carimbando o host |
| “Qual oficina” | API + tabela `TenantDomain` | resolve pelo host real (verificado em produção) |
| Subdomínios seus | `TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES` + wildcard | criar oficina = só cadastrar o subdomínio |
| Domínio de terceiro | verificação por **TXT** + certbot por domínio | posse comprovada antes de servir |
