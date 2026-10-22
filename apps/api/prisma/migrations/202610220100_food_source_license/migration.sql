-- P8 · Licencia de la TPCA 2017 (ADR-055, ADR-056). Rodrigo autorizó usarla sin la autorización expresa del INS: la
-- app cita sus fuentes una sola vez, en «Acerca de», y la API ya no devuelve la licencia en el detalle del alimento.
-- La base conserva la fuente y su edición (RN-I02), con un texto que ya no dice «Autorización pendiente».
UPDATE food.source
SET license = 'Uso referencial, con atribución de la fuente en la app (ADR-055)'
WHERE code = 'TPCA_2017';
