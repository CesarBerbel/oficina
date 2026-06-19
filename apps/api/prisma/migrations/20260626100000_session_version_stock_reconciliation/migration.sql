-- Invalidação imediata de access tokens por versão/sessão.
ALTER TABLE "users" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "refresh_tokens" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "refresh_tokens_userId_sessionVersion_idx" ON "refresh_tokens"("userId", "sessionVersion");
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");
