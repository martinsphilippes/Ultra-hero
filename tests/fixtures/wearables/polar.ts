// Fixtures do Polar AccessLink v3, montadas a partir da documentação pública:
//   https://www.polar.com/accesslink-api/ (Exercises, Sleep, Nightly Recharge, Daily activity, Webhooks)
// Valores-sentinela provam que a nota do sono dada pela pessoa, o esforço percebido, os
// percentuais de macronutrientes e treinos sem aparelho (lançados à mão no Flow) nunca entram.

export const polarNotificationExercise = { event: "EXERCISE", user_id: 475, entity_id: "aQlC83", timestamp: "2026-10-22T10:18:07.000Z", url: "https://www.polaraccesslink.com/v3/exercises/aQlC83" };
export const polarNotificationSleep = { event: "SLEEP", user_id: 475, date: "2026-10-22", timestamp: "2026-10-22T10:18:07.000Z", url: "https://www.polaraccesslink.com/v3/users/sleep/2026-10-22" };
export const polarPing = { timestamp: "2026-10-22T10:18:07.000Z", event: "PING" };

export const polarExercise = {
  id: "aQlC83",
  upload_time: "2026-10-22T10:18:07.000Z",
  polar_user: "https://www.polaraccesslink.com/v3/users/475",
  device: "Polar Grit X2 Pro",
  device_id: "1111AAAA",
  start_time: "2026-10-22T06:30:00",
  start_time_utc_offset: -180,
  duration: "PT45M30S",
  calories: 530,
  distance: 8100,
  heart_rate: { average: 146, maximum: 172 },
  training_load: 143.22,
  sport: "RUNNING",
  has_route: true,
  club_id: 999,
  club_name: "Clube de corrida da Ana",
  detailed_sport_info: "RUNNING_ROAD",
  fat_percentage: 60,
  carbohydrate_percentage: 38,
  protein_percentage: 2,
  running_index: 51,
  perceived_load: 9753, // ✕ esforço percebido dado pela pessoa — nunca entra
  heart_rate_zones: [
    { index: 1, "lower-limit": 95, "upper-limit": 114, "in-zone": "PT2M" },
    { index: 2, "lower-limit": 114, "upper-limit": 133, "in-zone": "PT8M" },
    { index: 3, "lower-limit": 133, "upper-limit": 152, "in-zone": "PT20M30S" },
    { index: 4, "lower-limit": 152, "upper-limit": 171, "in-zone": "PT14M" },
    { index: 5, "lower-limit": 171, "upper-limit": 190, "in-zone": "PT1M" },
  ],
};

/** Treino lançado à mão no Polar Flow: sem aparelho de origem → não entra. */
export const polarManualExercise = { ...polarExercise, id: "manual-1", device: "", distance: 8642, calories: 2468 };

export const polarSleep = {
  polar_user: "https://www.polaraccesslink.com/v3/users/475",
  date: "2026-10-22",
  sleep_start_time: "2026-10-21T23:39:07.000-03:00",
  sleep_end_time: "2026-10-22T06:58:24.000-03:00",
  device_id: "1111AAAA",
  continuity: 2.1,
  continuity_class: 2,
  light_sleep: 13500,
  deep_sleep: 5400,
  rem_sleep: 6300,
  unrecognized_sleep_stage: 0,
  sleep_score: 79,
  total_interruption_duration: 1800,
  sleep_charge: 3,
  sleep_goal: 28800,
  sleep_rating: 7777, // ✕ nota dada pela pessoa — nunca entra
  short_interruption_duration: 600,
  long_interruption_duration: 1200,
  sleep_cycles: 5,
  group_duration_score: 100,
  group_solidity_score: 75,
  group_regeneration_score: 54.2,
  hypnogram: { "00:39": 0 },
  heart_rate_samples: { "00:41": 76 },
};

export const polarRecharge = {
  polar_user: "https://www.polaraccesslink.com/v3/users/475",
  date: "2026-10-22",
  heart_rate_avg: 55,
  beat_to_beat_avg: 1090,
  heart_rate_variability_avg: 41,
  breathing_rate_avg: 14.1,
  nightly_recharge_status: 4,
  ans_charge: 3.5,
  ans_charge_status: 4,
  hrv_samples: { "00:41": 14 },
  breathing_samples: { "00:39": 13.4 },
};

export const polarActivity = { start_time: "2026-10-22T00:00:00", end_time: "2026-10-22T23:59:59", active_duration: "PT2H44M", inactive_duration: "PT1H2M", daily_activity: 112, calories: 2468, active_calories: 640, steps: 11030, inactivity_alert_count: 0, distance_from_steps: 8402 };
