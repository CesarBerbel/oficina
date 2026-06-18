# Instalação do zero numa VPS Hostinger (Ubuntu puro + Nginx)

Passo a passo para **formatar a VPS com Ubuntu puro** e subir o sistema: o stack
roda em **Docker**, atrás do **Nginx do host** (porteiro das portas `80/443`, com
TLS via **certbot**), com **um subdomínio por oficina**
(`nomedaoficina.seudominio.com`) e suporte a **domínio próprio de terceiro**.

> **Arquitetura.** O Nginx do host atende `80/443` (termina o HTTPS) e faz
> `proxy_pass` para o Nginx interno do Docker em `127.0.0.1:18081`, que distribui
> para `web` (Next.js) e `api` (NestJS). A oficina é resolvida pelo **host** da
> requisição (tabela `TenantDomain`). Veja também
> [`OPERACAO_PRODUCAO.md`](OPERACAO_PRODUCAO.md) (seção 12) e [`DEPLOY.md`](DEPLOY.md).

Convenções (troque pelos seus valores):

- domínio-base: `seudominio.com`
- painel administrativo: `app.seudominio.com`
- IP da VPS: `203.0.113.10`

---

## 0. Pré-requisitos

- VPS Hostinger **KVM** com **≥ 4 GB de RAM** (o build do Next.js é pesado; com 2 GB
  use swap — passo 2 — ou faça o build em outra máquina).
- Um domínio que você controla (`seudominio.com`).
- Acesso ao **hPanel** da Hostinger e ao painel de **DNS** do domínio.

---

## 1. Formatar / reinstalar a VPS com Ubuntu puro (hPanel)

1. hPanel → **VPS** → seu servidor → **Sistema operacional** → **Reinstalar**.
2. Escolha **Ubuntu 24.04 LTS** (a versão “limpa”, **sem** painel/OpenLiteSpeed/
   CyberPanel — vamos instalar só o que precisamos).
3. Defina a senha de root (ou cadastre sua **chave SSH** — recomendado).
4. Aguarde concluir e anote o **IP** da VPS.
5. Em **hPanel → VPS → Firewall**, garanta que as portas **22, 80 e 443** estão
   liberadas (o firewall da Hostinger é separado do `ufw` da VPS).

> ⚠️ Reinstalar **apaga tudo** no servidor. Faça backup antes, se houver algo.

---

## 2. Primeiro acesso e preparação do sistema

Conecte por SSH:

```bash
ssh root@203.0.113.10
```

Atualize e crie um usuário não-root com sudo:

```bash
apt update && apt -y upgrade
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # copia sua chave SSH, se usa
```

Firewall da VPS (libere só SSH, HTTP e HTTPS — o `18081` é loopback, não exposto):

```bash
apt -y install ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

(Recomendado em VPS com pouca RAM) **swap de 2 GB** para o build não falhar:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

Reentre como `deploy`:

```bash
exit
ssh deploy@203.0.113.10
```

---

## 3. Instalar Docker, Git, Nginx e certbot

```bash
# Docker Engine + plugin compose (script oficial)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # aplica o grupo sem precisar deslogar

# Git, Nginx (porteiro 80/443) e certbot (TLS)
sudo apt -y install git nginx certbot python3-certbot-nginx
```

Confirme:

```bash
docker --version && docker compose version && nginx -v
```

> O Ubuntu puro não vem com servidor web ocupando a 80/443, então o Nginx assume
> o papel de porteiro sem conflito.

---

## 4. Clonar o projeto e configurar o `.env`

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/CesarBerbel/oficina.git
cd oficina
cp .env.example .env
```

Gere segredos fortes:

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
WEB_ORIGIN=https://app.seudominio.com
APP_URL=https://app.seudominio.com

# Domínios das oficinas:
TENANT_DOMAIN_REQUIRE_VERIFIED=true
# Subdomínios SEUS entram verificados sem TXT; domínios de terceiros exigem TXT.
TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES=seudominio.com

# E-mail: ou configure SMTP real, ou desligue com MAIL_DRIVER=log
MAIL_DRIVER=smtp
SMTP_HOST=smtp.suaempresa.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=nao-responder@seudominio.com
SMTP_PASS=<senha-smtp>
SMTP_FROM="Oficina <nao-responder@seudominio.com>"

# (Opcional) Web Push — gere com: npx web-push generate-vapid-keys
# VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  NEXT_PUBLIC_VAPID_PUBLIC_KEY=<mesma pública>
```

Garanta o nome do projeto (usado pelos scripts de backup) no fim do `.env`:

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

- O build leva alguns minutos (Next.js + Nest).
- As **migrations do banco são aplicadas automaticamente** no boot da API.

Verifique a saúde (responde só localmente, na 18081):

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:18081/healthz
curl -fsS http://127.0.0.1:18081/api/health/ready
```

Logs, se algo não subir: `docker compose -f docker-compose.prod.yml logs -f api`.

---

## 6. DNS — apontar o domínio para a VPS

No painel de DNS do `seudominio.com`, crie:

```
A   app   203.0.113.10        # painel administrativo
A   *     203.0.113.10        # curinga: cobre TODOS os subdomínios de oficina
A   @     203.0.113.10        # (opcional) o domínio raiz
```

> O registro **`*` (curinga)** faz `qualquercoisa.seudominio.com` cair na VPS sem
> criar um DNS novo por oficina. Aguarde a propagação (minutos a horas). Confira com
> `dig +short app.seudominio.com` (deve retornar o IP da VPS).

---

## 7. Nginx do host (reverse proxy)

Crie o vhost `/etc/nginx/sites-available/oficina.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.seudominio.com *.seudominio.com seudominio.com;

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

Teste em HTTP (ainda sem cadeado): abrir `http://app.seudominio.com` já deve cair
no app. Se aparecer “site indisponível”, o host não chegou — revise os
`proxy_set_header` acima.

---

## 8. HTTPS com certbot

Escolha **uma** estratégia.

### 8‑A. Um cert por domínio/subdomínio (simples, qualquer DNS)

Funciona com o DNS na própria Hostinger (desafio HTTP‑01, sem API de DNS). O
certbot edita o vhost e adiciona o SSL sozinho:

```bash
sudo certbot --nginx -d app.seudominio.com
# a cada oficina nova (após criar o A do subdomínio):
sudo certbot --nginx -d nomedaoficina.seudominio.com
```

> Aceite o redirect HTTP→HTTPS quando perguntado. O certbot já instala a
> **renovação automática**. Limitação: HTTP‑01 **não** emite curinga — você roda o
> comando por subdomínio.

### 8‑B. Curinga `*.seudominio.com` (escala melhor; exige DNS com API)

Um único certificado serve **todos** os subdomínios — criar oficina nova vira só
cadastrar no sistema. Exige desafio **DNS‑01**, ou seja, API do provedor de DNS. O
Let’s Encrypt **não** tem plugin oficial para o DNS da Hostinger; o caminho mais
comum é mover o DNS para a **Cloudflare** (grátis) e usar o plugin dela:

```bash
sudo apt -y install python3-certbot-dns-cloudflare
sudo mkdir -p /root/.secrets
echo 'dns_cloudflare_api_token = SEU_TOKEN' | sudo tee /root/.secrets/cloudflare.ini
sudo chmod 600 /root/.secrets/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d '*.seudominio.com' -d 'seudominio.com' \
  --deploy-hook 'systemctl reload nginx'
```

Como o certbot **não** edita o vhost no modo `certonly`, troque o `server { ... }`
do passo 7 por esta versão com SSL (note o redirect 80→443):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name app.seudominio.com *.seudominio.com seudominio.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name app.seudominio.com *.seudominio.com seudominio.com;

    ssl_certificate     /etc/letsencrypt/live/seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seudominio.com/privkey.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:18081;
        proxy_http_version 1.1;
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

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Recarregue `https://app.seudominio.com` — o cadeado deve aparecer.

---

## 9. Primeira execução — criar a matriz e o super admin

Abra no navegador:

```
https://app.seudominio.com/instalar
```

Preencha os dados da **oficina matriz** e do **super usuário** (acessa todas as
oficinas). A tela `/instalar` só funciona enquanto o banco ainda não tem nenhuma
oficina. Depois, faça login normalmente.

---

## 10. Criar uma oficina

### Em `nomedaoficina.seudominio.com` (subdomínio seu)

1. Logado, crie a **oficina** (tenant) no sistema.
2. **Configurações › Domínios** → cadastre `nomedaoficina.seudominio.com`.
   - Como bate com `TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES`, entra **verificado na hora**
     (sem TXT).
3. **Com curinga (8‑B):** já funciona — abra `https://nomedaoficina.seudominio.com`.
   **Sem curinga (8‑A):** crie o `A nomedaoficina` no DNS e rode
   `sudo certbot --nginx -d nomedaoficina.seudominio.com`.

### Com domínio próprio da oficina (de terceiro)

1. A oficina aponta o domínio dela (`oficinadoze.com.br`) para a VPS (registro A).
2. **Configurações › Domínios** → cadastre `oficinadoze.com.br` → **não verificado**.
3. Publique o **TXT** `_oficina-verify.oficinadoze.com.br` = token e clique **Verificar**.
4. Adicione o domínio ao `server_name` do vhost (ou crie um vhost próprio) e emita
   o TLS: `sudo certbot --nginx -d oficinadoze.com.br`.

---

## 11. Backup, monitoramento e atualizações

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
| --- | --- | --- |
| Portas 80/443 + **TLS por domínio** | **Nginx do host** + certbot | termina HTTPS e faz `proxy_pass` → `127.0.0.1:18081` |
| Roteamento interno | Nginx do Docker (catch-all) | repassa para `web`/`api` carimbando o host |
| “Qual oficina” | API + tabela `TenantDomain` | resolve pelo host real (verificado em produção) |
| Subdomínios seus | `TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES` + curinga | criar oficina = só cadastrar o subdomínio |
| Domínio de terceiro | verificação por **TXT** + certbot por domínio | posse comprovada antes de servir |

---

## Apêndice — comandos de diagnóstico

```bash
# O Docker está servindo na 18081?
curl -I http://127.0.0.1:18081/

# O Nginx faz proxy do seu host?
curl -I -H "Host: app.seudominio.com" http://127.0.0.1/

# DNS aponta para a VPS?
dig +short app.seudominio.com

# Estado dos containers / logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api

# Nginx do host
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status nginx
```

> Se aparecer **“Hello World”/página padrão**, o request não chegou no proxy
> (vhost/`server_name` errado). Se aparecer **502/503**, o proxy funciona mas o
> Docker está fora do ar (suba o stack). Se for aviso de **certificado**, falta o
> passo 8 (HTTPS).
