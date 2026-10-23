// Fixtures da Garmin Health API (push e ping), montadas a partir da documentação pública:
//   https://developer.garmin.com/gc-developer-program/health-api/
//   (a especificação completa dos resumos — dailies, sleeps, activities, hrv, respiration, skinTemp,
//   stressDetails, userMetrics, deregistrations — é entregue no Garmin Connect Developer Program;
//   nomes de campo conferidos também no esquema do Open Wearables, marcados [OW] no documento de desenho).
// Valores-sentinela (ex.: 4321 mL de água, 2468 kcal ingeridas) servem para provar que campos
// proibidos nunca chegam ao lote normalizado. Nenhuma chamada real à Garmin.

export const SENTINELS = [4321, 2468, 1357, 9753, 8642, 7777, 6666] as const;

export const garminPush = {
  dailies: [
    {
      userId: "garmin-user-1",
      summaryId: "x153a9f3-5f0c3d00-6",
      calendarDate: "2026-10-22",
      startTimeInSeconds: 1792638000, // 2026-10-22T03:00:00Z = 00:00 em São Paulo
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 41400, // até 11:30 local
      activityType: "WALKING",
      steps: 6234,
      distanceInMeters: 4870.4,
      activeKilocalories: 412,
      bmrKilocalories: 1680,
      consumedCalories: 2468, // ✕ alimentação digitada — nunca entra
      netKilocaloriesGoal: 1357, // ✕ meta de calorias — nunca entra
      hydrationInMilliliters: 4321, // ✕ água digitada — nunca entra
      moderateIntensityDurationInSeconds: 1500,
      vigorousIntensityDurationInSeconds: 600,
      intensityDurationGoalInSeconds: 9000,
      floorsClimbed: 7,
      floorsDescended: 6,
      floorsClimbedGoal: 10,
      stepsGoal: 8000,
      minHeartRateInBeatsPerMinute: 48,
      averageHeartRateInBeatsPerMinute: 66,
      maxHeartRateInBeatsPerMinute: 151,
      restingHeartRateInBeatsPerMinute: 52,
      averageStressLevel: 31,
      maxStressLevel: 88,
      restStressDurationInSeconds: 14400,
      lowStressDurationInSeconds: 10800,
      mediumStressDurationInSeconds: 3600,
      highStressDurationInSeconds: 900,
      stressQualifier: "balanced",
      bodyBatteryChargedValue: 63,
      bodyBatteryDrainedValue: 27,
      bodyBatteryHighestValue: 91,
      bodyBatteryLowestValue: 22,
      bodyBatteryMostRecentValue: 64,
    },
  ],
  sleeps: [
    {
      userId: "garmin-user-1",
      summaryId: "x153a9f3-5f0b0b40-6e10",
      calendarDate: "2026-10-22",
      startTimeInSeconds: 1792632000, // 2026-10-22T01:20:00Z = 22:20 local do dia 21
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 28200, // acorda 09:10Z = 06:10 local
      deepSleepDurationInSeconds: 5400,
      lightSleepDurationInSeconds: 13800,
      remSleepInSeconds: 6600,
      awakeDurationInSeconds: 2400,
      unmeasurableSleepInSeconds: 0,
      validation: "ENHANCED_FINAL",
      timeOffsetSleepRespiration: { "0": 14.1, "3600": 13.8, "7200": 14.4, "10800": 14.0 },
      timeOffsetSleepSpo2: { "0": 96, "3600": 95, "7200": 97, "10800": 94 },
      overallSleepScore: { value: 81, qualifierKey: "GOOD" },
      sleepLevelsMap: { deep: [{ startTimeInSeconds: 1792633800, endTimeInSeconds: 1792635800 }] },
    },
  ],
  activities: [
    {
      userId: "garmin-user-1",
      summaryId: "21047282990",
      activityId: 21047282990,
      activityName: "Corrida no parque com a Ana", // ✕ texto livre digitado — não é lido
      activityType: "RUNNING",
      deviceName: "fenix 9",
      startTimeInSeconds: 1792662000, // 09:40Z = 06:40 local
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 2520,
      averageHeartRateInBeatsPerMinute: 148,
      maxHeartRateInBeatsPerMinute: 171,
      averageSpeedInMetersPerSecond: 3.1,
      activeKilocalories: 512,
      distanceInMeters: 7812.3,
      totalElevationGainInMeters: 42,
      averageRunCadenceInStepsPerMinute: 168,
      manual: false,
      isWebUpload: false,
    },
    {
      userId: "garmin-user-1",
      summaryId: "21047282991",
      activityType: "CYCLING",
      startTimeInSeconds: 1792674000,
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 3600,
      distanceInMeters: 9753, // ✕ treino digitado à mão — nunca entra
      manual: true,
    },
    {
      userId: "garmin-user-1",
      summaryId: "21047282992",
      activityType: "RUNNING",
      startTimeInSeconds: 1792688400,
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 1800,
      distanceInMeters: 8642, // ✕ GPX enviado pela web — nunca entra
      isWebUpload: true,
    },
  ],
  hrv: [{ userId: "garmin-user-1", summaryId: "hrv-1", calendarDate: "2026-10-22", lastNightAvg: 47, lastNight5MinHigh: 77, startTimeInSeconds: 1792632000, startTimeOffsetInSeconds: -10800, durationInSeconds: 28200 }],
  skinTemp: [{ userId: "garmin-user-1", summaryId: "st-1", calendarDate: "2026-10-22", avgDeviationCelsius: 0.12, startTimeInSeconds: 1792632000, startTimeOffsetInSeconds: -10800, durationInSeconds: 28200 }],
  stressDetails: [
    {
      userId: "garmin-user-1",
      summaryId: "sd-1",
      calendarDate: "2026-10-22",
      startTimeInSeconds: 1792638000,
      startTimeOffsetInSeconds: -10800,
      durationInSeconds: 41400,
      timeOffsetStressLevelValues: { "0": 18, "180": 22 },
      timeOffsetBodyBatteryValues: { "0": 30, "21600": 91, "41220": 58 }, // último às 11:27 local
    },
  ],
  userMetrics: [{ userId: "garmin-user-1", summaryId: "um-1", calendarDate: "2026-10-22", vo2Max: 52, fitnessAge: 31 }],
  // tipos NÃO registrados: o conteúdo nem é lido
  bodyComps: [{ userId: "garmin-user-1", summaryId: "bc-1", weightInGrams: 7777000, bodyFatInPercent: 18 }],
  mct: [{ userId: "garmin-user-1", summaryId: "mct-1", periodStartDate: "2026-10-01", cycleLength: 28 }],
  bloodPressures: [{ userId: "garmin-user-1", summaryId: "bp-1", systolic: 120, diastolic: 80 }],
  pulseox: [{ userId: "garmin-user-1", summaryId: "po-1", calendarDate: "2026-10-22", onDemand: true, timeOffsetSpo2Values: { "0": 6666 } }],
  healthSnapshot: [{ userId: "garmin-user-1", summaryId: "hs-1", spo2: 6666 }],
};

/** Sono digitado no app (validation = MANUAL): nunca entra. */
export const garminManualSleep = {
  userId: "garmin-user-1",
  summaryId: "manual-sleep",
  calendarDate: "2026-10-21",
  startTimeInSeconds: 1792544400,
  startTimeOffsetInSeconds: -10800,
  durationInSeconds: 30000,
  deepSleepDurationInSeconds: 7777,
  lightSleepDurationInSeconds: 7777,
  remSleepInSeconds: 7777,
  awakeDurationInSeconds: 600,
  validation: "MANUAL",
};

/** Ping: só a URL para buscar (https://apis.garmin.com/wellness-api/rest/…). */
export const garminPing = {
  dailies: [{ userId: "garmin-user-1", callbackURL: "https://apis.garmin.com/wellness-api/rest/dailies?uploadStartTimeInSeconds=1792638000&uploadEndTimeInSeconds=1792724400" }],
};

export const garminDeregistration = { deregistrations: [{ userId: "garmin-user-1" }] };
