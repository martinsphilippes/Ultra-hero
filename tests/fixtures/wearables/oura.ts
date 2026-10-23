// Fixtures da Oura API v2, montadas a partir da documentação pública:
//   https://cloud.ouraring.com/v2/docs (DailyReadinessModel, DailySleepModel, SleepModel,
//   DailyActivityModel, DailySpO2Model, DailyStressModel, PublicWorkout, Webhook Subscription Routes).
// Valores-sentinela provam que tags, rótulos digitados e treinos manuais nunca entram.

export const ouraNotification = { event_type: "update", data_type: "sleep", object_id: "8f9a5221-639e-4a85-81cb-4065ef23f979", event_time: "2026-10-22T09:20:11+00:00", user_id: "oura-user-77" };

export const ouraReadiness = {
  id: "rd-2026-10-22",
  contributors: { activity_balance: 56, body_temperature: 98, hrv_balance: 75, previous_day_activity: null, previous_night: 35, recovery_index: 47, resting_heart_rate: 94, sleep_balance: 73 },
  day: "2026-10-22",
  score: 78,
  temperature_deviation: -0.24,
  temperature_trend_deviation: 0.02,
  timestamp: "2026-10-22T00:00:00.000-03:00",
};

export const ouraSleep = {
  id: "8f9a5221-639e-4a85-81cb-4065ef23f979",
  average_breath: 14.25,
  average_heart_rate: 53.5,
  average_hrv: 49,
  awake_time: 2730,
  bedtime_end: "2026-10-22T06:45:31-03:00",
  bedtime_start: "2026-10-21T22:51:01-03:00",
  day: "2026-10-22",
  deep_sleep_duration: 5370,
  efficiency: 88,
  heart_rate: { interval: 300, items: [55, 54, 52], timestamp: "2026-10-21T22:51:01.000-03:00" },
  hrv: { interval: 300, items: [40, 52, 55], timestamp: "2026-10-21T22:51:01.000-03:00" },
  latency: 540,
  light_sleep_duration: 13020,
  low_battery_alert: false,
  lowest_heart_rate: 49,
  movement_30_sec: "1111211",
  period: 0,
  readiness: { contributors: {}, score: 78, temperature_deviation: -0.24, temperature_trend_deviation: 0.02 },
  readiness_score_delta: 0,
  rem_sleep_duration: 6990,
  restless_periods: 211,
  sleep_phase_5_min: "4211122",
  sleep_score_delta: 0,
  sleep_algorithm_version: "v2",
  time_in_bed: 28470,
  total_sleep_duration: 25380,
  type: "long_sleep",
};

export const ouraNap = { ...ouraSleep, id: "nap-1", type: "late_nap", bedtime_start: "2026-10-22T14:00:00-03:00", bedtime_end: "2026-10-22T14:30:00-03:00", total_sleep_duration: 1500 };

export const ouraActivity = {
  id: "act-2026-10-22",
  class_5_min: "0000011111",
  score: 82,
  active_calories: 512,
  average_met_minutes: 1.4,
  contributors: {},
  equivalent_walking_distance: 9100,
  high_activity_met_minutes: 120,
  high_activity_time: 900,
  inactivity_alerts: 1,
  low_activity_met_minutes: 200,
  low_activity_time: 14000,
  medium_activity_met_minutes: 150,
  medium_activity_time: 1800,
  met: { interval: 60, items: [1.2], timestamp: "2026-10-22T04:00:00.000-03:00" },
  meters_to_target: 1200,
  non_wear_time: 3600,
  resting_time: 30000,
  sedentary_met_minutes: 10,
  sedentary_time: 25200,
  steps: 10234,
  target_calories: 500,
  target_meters: 10000,
  total_calories: 2468, // inclui metabolismo basal; não é "ativas" — não é lido
  day: "2026-10-22",
  timestamp: "2026-10-22T04:00:00.000-03:00",
};

export const ouraSpo2 = { id: "spo2-1", day: "2026-10-22", spo2_percentage: { average: 96.4 }, breathing_disturbance_index: 4 };
export const ouraStress = { id: "stress-1", day: "2026-10-22", stress_high: 3600, recovery_high: 5400, day_summary: "normal" };

export const ouraWorkoutAuto = { id: "wk-auto", activity: "walking", calories: 210, day: "2026-10-22", distance: 3200, end_datetime: "2026-10-22T18:40:00-03:00", intensity: "moderate", label: "Passeio com o cachorro", source: "autodetected", start_datetime: "2026-10-22T18:05:00-03:00" };
export const ouraWorkoutManual = { id: "wk-manual", activity: "cycling", calories: 9753, day: "2026-10-22", distance: 8642, end_datetime: "2026-10-22T20:00:00-03:00", intensity: "hard", label: "Digitado", source: "manual", start_datetime: "2026-10-22T19:00:00-03:00" };

/** Tag digitada pela pessoa (enhanced_tag): tipo não inscrito, nunca lido. */
export const ouraTagNotification = { event_type: "create", data_type: "enhanced_tag", object_id: "tag-1", event_time: "2026-10-22T09:20:11+00:00", user_id: "oura-user-77" };
