// Fixtures da WHOOP API v2, montadas a partir da documentação pública:
//   https://developer.whoop.com/api (Recovery, Cycle, Sleep, Workout v2)
//   https://developer.whoop.com/docs/developing/webhooks (corpo e assinatura do webhook)
// Valores-sentinela provam que medidas corporais, nome e e-mail nunca entram.

export const whoopNotification = { user_id: 10129, id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8", type: "recovery.updated", trace_id: "e369c784-5100-49e8-8098-75d35c47b31b" };

export const whoopSleep = {
  id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
  cycle_id: 93845,
  v1_id: 93845,
  user_id: 10129,
  created_at: "2026-10-22T10:25:44.774Z",
  updated_at: "2026-10-22T10:30:12.112Z",
  start: "2026-10-22T02:25:44.774Z",
  end: "2026-10-22T10:25:44.774Z",
  timezone_offset: "-03:00",
  nap: false,
  score_state: "SCORED",
  score: {
    stage_summary: {
      total_in_bed_time_milli: 28800000,
      total_awake_time_milli: 2400000,
      total_no_data_time_milli: 0,
      total_light_sleep_time_milli: 13200000,
      total_slow_wave_sleep_time_milli: 6000000,
      total_rem_sleep_time_milli: 7200000,
      sleep_cycle_count: 4,
      disturbance_count: 12,
    },
    sleep_needed: { baseline_milli: 27395716, need_from_sleep_debt_milli: 352230, need_from_recent_strain_milli: 208595, need_from_recent_nap_milli: -12312 },
    respiratory_rate: 16.11328125,
    sleep_performance_percentage: 98,
    sleep_consistency_percentage: 90,
    sleep_efficiency_percentage: 91.69533848,
  },
};

export const whoopCycle = {
  id: 93845,
  user_id: 10129,
  created_at: "2026-10-21T10:25:44.774Z",
  updated_at: "2026-10-22T14:25:44.774Z",
  start: "2026-10-22T02:25:44.774Z",
  end: "2026-10-22T14:25:44.774Z",
  timezone_offset: "-03:00",
  score_state: "SCORED",
  score: { strain: 5.2951527, kilojoule: 8288.297, average_heart_rate: 68, max_heart_rate: 141 },
};

export const whoopRecovery = {
  cycle_id: 93845,
  sleep_id: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
  user_id: 10129,
  created_at: "2026-10-22T10:25:44.774Z",
  updated_at: "2026-10-22T10:35:44.774Z",
  score_state: "SCORED",
  score: { user_calibrating: false, recovery_score: 44, resting_heart_rate: 64, hrv_rmssd_milli: 31.813562, spo2_percentage: 95.6875, skin_temp_celsius: 33.7 },
};

export const whoopWorkout = {
  id: "ecfc6a15-4661-442f-a9a4-f160dd7afae9",
  v1_id: 1043,
  user_id: 10129,
  created_at: "2026-10-22T21:25:44.774Z",
  updated_at: "2026-10-22T21:35:44.774Z",
  start: "2026-10-22T20:25:44.774Z",
  end: "2026-10-22T21:05:44.774Z",
  timezone_offset: "-03:00",
  sport_name: "running",
  sport_id: 0,
  score_state: "SCORED",
  score: {
    strain: 8.2463,
    average_heart_rate: 123,
    max_heart_rate: 146,
    kilojoule: 1569.34,
    percent_recorded: 100,
    distance_meter: 6200.5,
    altitude_gain_meter: 46.64,
    altitude_change_meter: -0.78,
    zone_durations: { zone_zero_milli: 300000, zone_one_milli: 600000, zone_two_milli: 600000, zone_three_milli: 900000, zone_four_milli: 600000, zone_five_milli: 0 },
  },
};

/** Perfil e medidas corporais: só o user_id do perfil é lido; read:body_measurement nem é pedido. */
export const whoopProfile = { user_id: 10129, email: "pessoa@example.com", first_name: "Ana", last_name: "Silva" };
export const whoopBody = { height_meter: 1.7, weight_kilogram: 7777, max_heart_rate: 200 };
