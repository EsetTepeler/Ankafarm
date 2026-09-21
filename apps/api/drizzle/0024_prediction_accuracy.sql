-- Tahmin doğruluğu (bölüm 4.5): model sürümü bazında ortalama hata ve sapma.
-- Gerçek makine öğrenmesi bu tablo dolmadan başlamaz; ölçüm buradan okunur.
CREATE OR REPLACE VIEW v_prediction_accuracy AS
SELECT
  farm_id,
  type,
  model_version,
  count(*) AS total,
  count(*) FILTER (WHERE evaluated_at IS NOT NULL) AS evaluated,
  round(avg(abs(error)) FILTER (WHERE evaluated_at IS NOT NULL), 2) AS mean_abs_error,
  round(avg(error) FILTER (WHERE evaluated_at IS NOT NULL), 2) AS mean_error,
  max(evaluated_at) AS last_evaluated_at
FROM predictions
GROUP BY farm_id, type, model_version;
