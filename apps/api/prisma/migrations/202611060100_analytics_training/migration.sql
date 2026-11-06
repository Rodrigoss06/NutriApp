-- P14 (PR 2b) · La analítica de rutina (RF-33, RN-F03 a RN-F09; ADR-088).

ALTER TABLE analytics.patient_daily_summary
  -- La carga sRPE del registro diario, minutos × RPE, la que calculó su recuperación (RN-G14). Sin registro diario, null.
  ADD COLUMN srpe_load numeric(7,1),
  -- Los minutos de las series de cardio de los entrenos hechos (RN-F09, RN-F10). Sin entrenos, null.
  ADD COLUMN cardio_minutes numeric(6,1);

-- El SFR de la semana para el grupo muscular, del motor con las valoraciones de cada serie (RN-F07); sin valoraciones, null.
ALTER TABLE analytics.patient_weekly_muscle_volume ADD COLUMN sfr numeric(4,2);
