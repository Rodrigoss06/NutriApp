-- P8 · Datos maestros (RF-38, ADR-052): fuentes, nutrientes INFOODS, grupos de la TPCA 2017, lista de intercambio de
-- demostración y lotes de importación idempotentes. Los alimentos y las actividades no van aquí: los carga el importador
-- (pnpm catalog:load) desde seeds/, con lote, hash y conteos (RN-I04).

-- Catálogo global sin organization_id ------------------------------------------------------------------------------
-- Para las tablas globales que carga el importador: todos leen y solo SYSTEM inserta o actualiza (RN-I01).
CREATE FUNCTION app.enable_global_rls(p_table regclass) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('CREATE POLICY global_read ON %s FOR SELECT USING (true)', p_table);
  EXECUTE format('CREATE POLICY global_insert ON %s FOR INSERT WITH CHECK (app.role() = ''SYSTEM'')', p_table);
  EXECUTE format('CREATE POLICY global_update ON %s FOR UPDATE USING (app.role() = ''SYSTEM'')
                    WITH CHECK (app.role() = ''SYSTEM'')', p_table);
END $$;

-- Fuentes (RN-I02) ---------------------------------------------------------------------------------------------------
-- ⚠️ La TPCA 2017 prohíbe reproducirla sin autorización del INS: se carga mientras se tramita (decisión de Rodrigo,
-- 2026-10-20). imported_at lo fija el importador al cargar cada fuente.
INSERT INTO food.source (code, name, edition, publisher, license, url) VALUES
  ('TPCA_2017', 'Tablas peruanas de composición de alimentos', '10.ª edición, 2017 (ISBN 978-612-310-117-6)',
   'Instituto Nacional de Salud, Centro Nacional de Alimentación y Nutrición (INS-CENAN)',
   'Prohibida la reproducción total o parcial sin autorización del INS. Autorización pendiente',
   'https://lamejorreceta.ins.gob.pe/sites/default/files/2020-12/tablas-peruanas-QR_0.pdf'),
  ('ENGINE_DEMO', 'Lista de intercambio de demostración del motor de cálculo', '1.0.0', NULL,
   'Valores de demostración tipo ADA, provisionales hasta tener permiso de las listas Dextre y ADA (riesgo R4)', NULL),
  ('ORG', 'Propio de la organización', NULL, NULL, 'Privada', NULL)
ON CONFLICT (code) DO NOTHING;

-- Nutrientes (RN-I03) ------------------------------------------------------------------------------------------------
-- Las 22 columnas de la TPCA 2017 en su orden, con el identificador INFOODS de su Anexo 1. La tabla escribe <CARTBQ>;
-- aquí va CARTBEQ, el de INFOODS. «Ácido fólico» no trae identificador: es FOL (ADR-052). is_core: energía,
-- macronutrientes y fibra.
INSERT INTO food.nutrient (code, name_es, unit, display_order, is_core) VALUES
  ('ENERC_KCAL', 'Energía', 'kcal', 1, true),
  ('ENERC_KJ', 'Energía', 'kJ', 2, false),
  ('WATER', 'Agua', 'g', 3, false),
  ('PROCNT', 'Proteínas', 'g', 4, true),
  ('FAT', 'Grasa total', 'g', 5, true),
  ('CHOCDF', 'Carbohidratos totales', 'g', 6, true),
  ('CHOAVL', 'Carbohidratos disponibles', 'g', 7, false),
  ('FIBTG', 'Fibra dietaria', 'g', 8, true),
  ('ASH', 'Cenizas', 'g', 9, false),
  ('CA', 'Calcio', 'mg', 10, false),
  ('P', 'Fósforo', 'mg', 11, false),
  ('ZN', 'Zinc', 'mg', 12, false),
  ('FE', 'Hierro', 'mg', 13, false),
  ('CARTBEQ', 'β-caroteno equivalentes totales', 'µg', 14, false),
  ('VITA', 'Vitamina A equivalentes totales', 'µg', 15, false),
  ('THIA', 'Tiamina', 'mg', 16, false),
  ('RIBF', 'Riboflavina', 'mg', 17, false),
  ('NIA', 'Niacina', 'mg', 18, false),
  ('VITC', 'Vitamina C', 'mg', 19, false),
  ('FOL', 'Ácido fólico', 'µg', 20, false),
  ('NA', 'Sodio', 'mg', 21, false),
  ('K', 'Potasio', 'mg', 22, false)
ON CONFLICT (code) DO NOTHING;

-- Grupos de la TPCA 2017 -------------------------------------------------------------------------------------------
-- El grupo S (preparaciones del INEI) queda fuera por ahora (decisión de Rodrigo, 2026-10-20).
INSERT INTO food.food_group (code, source_code, name_es) VALUES
  ('TPCA_A', 'TPCA_2017', 'Cereales y derivados'),
  ('TPCA_B', 'TPCA_2017', 'Verduras, hortalizas y derivados'),
  ('TPCA_C', 'TPCA_2017', 'Frutas y derivados'),
  ('TPCA_D', 'TPCA_2017', 'Grasas, aceites y oleaginosas'),
  ('TPCA_E', 'TPCA_2017', 'Pescados y mariscos'),
  ('TPCA_F', 'TPCA_2017', 'Carnes y derivados'),
  ('TPCA_G', 'TPCA_2017', 'Leche y derivados'),
  ('TPCA_H', 'TPCA_2017', 'Bebidas (alcohólicas y analcohólicas)'),
  ('TPCA_J', 'TPCA_2017', 'Huevos y derivados'),
  ('TPCA_K', 'TPCA_2017', 'Productos azucarados'),
  ('TPCA_L', 'TPCA_2017', 'Misceláneos'),
  ('TPCA_Q', 'TPCA_2017', 'Alimentos infantiles'),
  ('TPCA_T', 'TPCA_2017', 'Leguminosas y derivados'),
  ('TPCA_U', 'TPCA_2017', 'Tubérculos, raíces y derivados')
ON CONFLICT (code) DO NOTHING;

-- Lista de intercambio de demostración (RN-E11, riesgo R4) -----------------------------------------------------------
-- La DEMO_EXCHANGE_LIST del motor, rotulada como provisional mientras no haya permiso de Dextre ni de ADA.
-- kcal = 4 × CHO + 4 × proteína + 9 × grasa, como la calcula el motor.
ALTER TABLE food.exchange_list ADD COLUMN provisional boolean NOT NULL DEFAULT false;

INSERT INTO food.exchange_list (id, organization_id, code, name, source_code, version, status, provisional,
                                license_note, published_at)
VALUES ('01926200-0000-7000-8000-000000000001', NULL, 'DEMO', 'Lista de demostración', 'ENGINE_DEMO', '1.0.0',
        'PUBLISHED', true, 'Provisional: valores de demostración del motor, no de una lista oficial',
        TIMESTAMPTZ '2026-10-20 00:00:00+00')
ON CONFLICT DO NOTHING;

INSERT INTO food.exchange_group (id, exchange_list_id, organization_id, code, name_es, kcal, cho_g, protein_g, fat_g,
                                 display_order)
VALUES
  ('01926201-0000-7000-8000-000000000001', '01926200-0000-7000-8000-000000000001', NULL, 'VEG', 'Verduras', 28, 5, 2, 0, 1),
  ('01926201-0000-7000-8000-000000000002', '01926200-0000-7000-8000-000000000001', NULL, 'FRU', 'Frutas', 60, 15, 0, 0, 2),
  ('01926201-0000-7000-8000-000000000003', '01926200-0000-7000-8000-000000000001', NULL, 'MILK', 'Lácteos', 80, 12, 8, 0, 3),
  ('01926201-0000-7000-8000-000000000004', '01926200-0000-7000-8000-000000000001', NULL, 'STA', 'Almidones', 81, 15, 3, 1, 4),
  ('01926201-0000-7000-8000-000000000005', '01926200-0000-7000-8000-000000000001', NULL, 'MEAT', 'Carnes magras', 46, 0, 7, 2, 5),
  ('01926201-0000-7000-8000-000000000006', '01926200-0000-7000-8000-000000000001', NULL, 'FAT', 'Grasas', 45, 0, 0, 5, 6)
ON CONFLICT DO NOTHING;

-- Lotes de importación (RN-I04) ----------------------------------------------------------------------------------------
-- file_name: el archivo que se importó desde la CLI (file_id queda para los que se suban por la web). Un archivo se
-- aplica una sola vez por organización y tipo: repetirlo deja un lote DUPLICATE y no toca los datos.
ALTER TABLE platform.import_batch
  ADD COLUMN file_name text,
  ADD CONSTRAINT import_batch_status
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'DUPLICATE'));
CREATE UNIQUE INDEX import_batch_once ON platform.import_batch (organization_id, kind, file_sha256) NULLS NOT DISTINCT
  WHERE status IN ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS');

-- Actividades del Compendium 2024 ------------------------------------------------------------------------------------
-- description_en: la descripción oficial, junto a la traducción propia (el Compendium pide no cambiar los MET ni
-- mezclar actividades). Las escribe el importador como SYSTEM; P7 le había quitado la escritura a app_user.
ALTER TABLE exercise.physical_activity ADD COLUMN description_en text;
SELECT app.enable_global_rls('exercise.physical_activity');
GRANT INSERT, UPDATE ON exercise.physical_activity TO app_user;

-- Permisos -----------------------------------------------------------------------------------------------------------
-- Fuentes, nutrientes y grupos llegan por migración; de las fuentes, el importador solo actualiza imported_at.
SELECT app.enable_global_rls('food.source');
REVOKE INSERT, UPDATE ON food.source, food.nutrient, food.food_group FROM app_user;
GRANT UPDATE (imported_at) ON food.source TO app_user;
