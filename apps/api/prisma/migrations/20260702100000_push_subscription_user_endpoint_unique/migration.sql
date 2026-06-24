-- Inscrição de push passa a ser única por (usuário, endpoint), não por endpoint
-- global. Evita que um usuário sequestre a inscrição de outro reenviando o mesmo
-- endpoint. Pares (userId, endpoint) já eram únicos sob a regra antiga (endpoint
-- global), então a nova constraint não conflita com dados existentes.

-- DropIndex
DROP INDEX "push_subscriptions_endpoint_key";

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_userId_endpoint_key" ON "push_subscriptions"("userId", "endpoint");
