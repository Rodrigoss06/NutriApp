-- P14.5 (PR 4) · La fatiga por grupo muscular de la hoja piloto de JV Fitness (P-27, respuesta de Jeremy del 2026-11-10; RN-G16;
-- ADR-115). El estado usa los umbrales de la carga que ya tiene esta tabla (P-23: ámbar sobre +15 % y rojo sobre +30 %).

-- «Recuperación est.» de cada grupo según su color: 48 h en verde, 60 h en ámbar y 72 h en rojo. Van con los demás umbrales del
-- panel, versionados igual: la fila global los recibe por el valor por defecto.
ALTER TABLE training.fatigue_panel_threshold
  ADD COLUMN muscle_recovery_green_hours smallint NOT NULL DEFAULT 48,
  ADD COLUMN muscle_recovery_amber_hours smallint NOT NULL DEFAULT 60,
  ADD COLUMN muscle_recovery_red_hours   smallint NOT NULL DEFAULT 72,
  ADD CONSTRAINT fatigue_panel_threshold_muscle_recovery_check CHECK (
    muscle_recovery_green_hours > 0
    AND muscle_recovery_green_hours <= muscle_recovery_amber_hours
    AND muscle_recovery_amber_hours <= muscle_recovery_red_hours
  );
