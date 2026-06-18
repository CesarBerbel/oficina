-- Heartbeat operacional global (ex.: último backup) para métricas/alertas.
CREATE TABLE "ops_heartbeat" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_heartbeat_pkey" PRIMARY KEY ("key")
);
