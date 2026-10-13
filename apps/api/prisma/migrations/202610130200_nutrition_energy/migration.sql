-- P7 · Prescripción energética (RF-17, ADR-047) y actividades mínimas del Compendium 2024.

-- Prescripción energética -------------------------------------------------------------------------------------------
-- La tabla está vacía en todo entorno: ninguna versión anterior la escribe, así que las columnas nacen NOT NULL.
-- evaluation_id: la evaluación cerrada de la que salen peso, talla, edad y masa libre de grasa (assessment, sin FK).
-- tee_method_*: el GET es el método TEE_PAL (ADR-029). components: el sobre de cada componente (TMR, ejercicio, GET,
-- objetivo, proyección y macronutrientes) con su método, versión, insumos, hash, salidas y avisos (02 §7, RN-D01); las
-- columnas numéricas guardan lo mismo redondeado para consultas.
ALTER TABLE nutrition.energy_prescription
  ADD COLUMN evaluation_id      uuid  NOT NULL,
  ADD COLUMN tee_method_code    text  NOT NULL,
  ADD COLUMN tee_method_version text  NOT NULL,
  ADD COLUMN components         jsonb NOT NULL;

-- Una prescripción no se edita: se crea otra (RN-D08).
REVOKE UPDATE ON nutrition.energy_prescription FROM app_user;

-- Actividades -------------------------------------------------------------------------------------------------------
-- Semilla mínima mientras llega P8, con los códigos y MET oficiales del 2024 Adult Compendium of Physical Activities
-- (pacompendium.com). 12050 es el de G-15. P8 carga el subconjunto traducido completo encima.
INSERT INTO exercise.physical_activity (code, major_heading, description_es, met, source_version) VALUES
  ('01200', 'Ciclismo', 'Bicicleta estática, en general', 6.8, 'COMPENDIUM_2024'),
  ('02048', 'Acondicionamiento físico', 'Elíptica, esfuerzo moderado', 5.0, 'COMPENDIUM_2024'),
  ('02050', 'Acondicionamiento físico', 'Pesas: levantamiento de potencia o fisicoculturismo, esfuerzo vigoroso', 6.0,
   'COMPENDIUM_2024'),
  ('02054', 'Acondicionamiento físico', 'Pesas: varios ejercicios, de 8 a 15 repeticiones con carga variada', 3.5,
   'COMPENDIUM_2024'),
  ('12050', 'Correr', 'Correr a 6–6.3 mph (unos 10 km/h)', 9.3, 'COMPENDIUM_2024'),
  ('15610', 'Deportes', 'Fútbol recreativo, en general', 7.0, 'COMPENDIUM_2024'),
  ('17190', 'Caminar', 'Caminar a 2.8–3.4 mph, paso moderado, superficie firme', 3.8, 'COMPENDIUM_2024'),
  ('17200', 'Caminar', 'Caminar a 3.5–3.9 mph, paso rápido, como ejercicio', 4.8, 'COMPENDIUM_2024'),
  ('18240', 'Actividades acuáticas', 'Nadar estilo libre, lento, recreativo', 5.8, 'COMPENDIUM_2024')
ON CONFLICT (code) DO NOTHING;

-- El catálogo global es de solo lectura para la aplicación (RN-I01).
REVOKE INSERT, UPDATE ON exercise.physical_activity FROM app_user;
