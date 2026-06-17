-- Auditoria imutável: registros de audit_logs não podem ser alterados.
-- (DELETE permanece permitido para o cascade ao remover um tenant.)
CREATE OR REPLACE FUNCTION audit_logs_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs é imutável: UPDATE não é permitido';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_no_update ON "audit_logs";
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_update();
