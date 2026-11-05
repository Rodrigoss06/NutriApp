-- P13 (PR 4) · ACCOUNT no ve ni escribe la recuperación del día (ADR-083), como el resto de los registros del paciente (P6,
-- 202610090003_account_scope): toda tabla con care_team_scope lleva también account_scope.
SELECT app.restrict_account('tracking.daily_readiness');
