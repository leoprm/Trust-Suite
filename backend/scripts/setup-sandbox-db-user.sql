-- ============================================================================
-- setup-sandbox-db-user.sql
-- Crea usuario MySQL trust_sandbox_ro con SELECT-only grants sobre trust_web.
-- Idempotente: usa CREATE USER IF NOT EXISTS y GRANT sin DROP previo.
--
-- Uso:
--   mysql -u root -p < scripts/setup-sandbox-db-user.sql
--
-- El password se genera aleatoriamente y se imprime al final para que el
-- administrador lo guarde en /home/trustmaker/.sandbox_db_creds (chmod 600).
-- ============================================================================

-- Generar password aleatorio (32 caracteres hexadecimales, mezcla MD5 + SHA2)
SET @pw = CONCAT(
  SUBSTRING(MD5(RAND()), 1, 12),
  SUBSTRING(SHA2(RAND(), 256), 1, 20)
);

-- Crear usuario (idempotente — no falla si ya existe)
SET @create_sql = CONCAT(
  'CREATE USER IF NOT EXISTS ''trust_sandbox_ro''@''localhost'' IDENTIFIED BY ''',
  @pw,
  ''''
);
PREPARE create_stmt FROM @create_sql;
EXECUTE create_stmt;
DEALLOCATE PREPARE create_stmt;

-- Crear usuario para IPv6 localhost también
SET @create_sql_v6 = CONCAT(
  'CREATE USER IF NOT EXISTS ''trust_sandbox_ro''@''::1'' IDENTIFIED BY ''',
  @pw,
  ''''
);
PREPARE create_stmt_v6 FROM @create_sql_v6;
EXECUTE create_stmt_v6;
DEALLOCATE PREPARE create_stmt_v6;

-- Grant SELECT-only sobre todas las tablas de trust_web
GRANT SELECT ON trust_web.* TO 'trust_sandbox_ro'@'localhost';
GRANT SELECT ON trust_web.* TO 'trust_sandbox_ro'@'::1';
FLUSH PRIVILEGES;

-- Imprimir password para que el admin lo capture y guarde
SELECT CONCAT('trust_sandbox_ro password: ', @pw) AS result;
SELECT CONCAT(
  'Guárdalo con: echo "',
  @pw,
  '" > /home/trustmaker/.sandbox_db_creds && chmod 600 /home/trustmaker/.sandbox_db_creds'
) AS save_command;
