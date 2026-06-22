import { JOB_PRIORITY } from "../domain/jobPriority.js";
import { JOB_STATUS } from "../domain/jobStatus.js";

const WGS84_SPATIAL_REFERENCE = Object.freeze({
  wkid: 4326,
});

const REAL_AOI_IDS = Object.freeze([
  "{123AB663-0487-4411-AAAE-DC7C630BB03E}",
  "{C5CEB79C-339B-49E3-93F3-BD0EFF1A3EE7}",
  "{08DF4863-F0F6-4158-A01F-B64D96B3B8FB}",
]);

const MOCK_AOI_IDS = Object.freeze({
  BALTIC_SEA: "mock-aoi-baltic-sea",
  BORNHOLM: "mock-aoi-bornholm",
  DANISH_STRAITS: "mock-aoi-danish-straits",
  EASTERN_DENMARK: "mock-aoi-eastern-denmark",
  FEHMARN_BELT: "mock-aoi-fehmarn-belt",
  GREAT_BELT: "mock-aoi-great-belt",
  KATTEGAT: "mock-aoi-kattegat",
  NORTH_SEA: "mock-aoi-north-sea",
  SKAGERRAK: "mock-aoi-skagerrak",
  SOUND: "mock-aoi-sound",
  WADDEN_SEA: "mock-aoi-wadden-sea",
});

const POINT_CLUSTER_SPECS = Object.freeze([
  {
    area: "Kattegat",
    center: [10.95, 56.75],
    relatedAoiIds: [MOCK_AOI_IDS.KATTEGAT, REAL_AOI_IDS[0]],
    points: [
      [
        "job-point-001",
        "Check Kattegat sounding report",
        -0.1,
        -0.06,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -7,
        3,
      ],
      [
        "job-point-002",
        "Validate Kattegat buoy update",
        0.04,
        -0.02,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.IN_PROGRESS,
        -6,
        9,
      ],
      [
        "job-point-003",
        "Review Kattegat source note",
        0.12,
        0.03,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -5,
        4,
      ],
      [
        "job-point-004",
        "Assess Kattegat encoding change",
        -0.04,
        0.08,
        JOB_PRIORITY.LOW,
        JOB_STATUS.TODO,
        -3,
        18,
      ],
      [
        "job-point-005",
        "Confirm Kattegat quality remark",
        0.18,
        -0.09,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.DONE,
        -14,
        -2,
      ],
    ],
  },
  {
    area: "Great Belt",
    center: [10.9, 55.45],
    relatedAoiIds: [MOCK_AOI_IDS.GREAT_BELT, MOCK_AOI_IDS.DANISH_STRAITS, REAL_AOI_IDS[1]],
    points: [
      [
        "job-point-006",
        "Check Great Belt notice",
        -0.04,
        0.0,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -4,
        3,
      ],
      [
        "job-point-007",
        "Validate Great Belt depth note",
        0.08,
        0.04,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.IN_PROGRESS,
        -2,
        7,
      ],
      [
        "job-point-008",
        "Review Great Belt update package",
        -0.1,
        -0.05,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -8,
        6,
      ],
      [
        "job-point-009",
        "Assess Great Belt follow-up",
        0.16,
        -0.03,
        JOB_PRIORITY.LOW,
        JOB_STATUS.TODO,
        -1,
        16,
      ],
      [
        "job-point-010",
        "Confirm Great Belt closure",
        0.02,
        0.11,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.DONE,
        -16,
        -1,
      ],
    ],
  },
  {
    area: "Sound",
    center: [12.62, 55.78],
    relatedAoiIds: [MOCK_AOI_IDS.SOUND, MOCK_AOI_IDS.EASTERN_DENMARK, REAL_AOI_IDS[2]],
    points: [
      [
        "job-point-011",
        "Validate Sound data report",
        0.0,
        0.0,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.IN_PROGRESS,
        -5,
        8,
      ],
      [
        "job-point-012",
        "Review Sound obstruction note",
        -0.08,
        0.04,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -3,
        5,
      ],
      [
        "job-point-013",
        "Assess Sound source update",
        0.11,
        -0.03,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.TODO,
        -2,
        12,
      ],
      [
        "job-point-014",
        "Check Sound data quality",
        0.17,
        0.06,
        JOB_PRIORITY.LOW,
        JOB_STATUS.TODO,
        -1,
        21,
      ],
      [
        "job-point-015",
        "Confirm Sound report closure",
        -0.14,
        -0.07,
        JOB_PRIORITY.LOW,
        JOB_STATUS.DONE,
        -12,
        -1,
      ],
    ],
  },
  {
    area: "North Sea",
    center: [7.95, 55.65],
    relatedAoiIds: [MOCK_AOI_IDS.NORTH_SEA, MOCK_AOI_IDS.WADDEN_SEA, REAL_AOI_IDS[0]],
    points: [
      [
        "job-point-016",
        "Review North Sea source update",
        -0.12,
        -0.04,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -9,
        5,
      ],
      [
        "job-point-017",
        "Check North Sea notice",
        0.04,
        0.07,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.IN_PROGRESS,
        -7,
        11,
      ],
      [
        "job-point-018",
        "Validate North Sea data change",
        0.15,
        -0.01,
        JOB_PRIORITY.HIGH,
        JOB_STATUS.TODO,
        -6,
        4,
      ],
      [
        "job-point-019",
        "Assess Wadden Sea overlap",
        -0.03,
        0.14,
        JOB_PRIORITY.LOW,
        JOB_STATUS.TODO,
        -4,
        17,
      ],
      [
        "job-point-020",
        "Confirm North Sea completion",
        0.19,
        0.09,
        JOB_PRIORITY.MEDIUM,
        JOB_STATUS.DONE,
        -13,
        -3,
      ],
    ],
  },
]);

const POLYGON_JOB_SPECS = Object.freeze([
  {
    id: "job-001",
    title: "Review North Sea source polygon",
    summary: "Assess new source data in the North Sea and identify affected Areas of Interest.",
    createdAtDays: -9,
    deadlineDays: 5,
    priority: JOB_PRIORITY.HIGH,
    status: JOB_STATUS.TODO,
    center: [7.75, 55.62],
    size: [0.32, 0.22],
    relatedAoiIds: [REAL_AOI_IDS[0], REAL_AOI_IDS[1], REAL_AOI_IDS[2]],
  },
  {
    id: "job-002",
    title: "Validate Kattegat depth polygon",
    summary: "Review potential changes affecting Kattegat AOIs before chart updates are prepared.",
    createdAtDays: -6,
    deadlineDays: 10,
    priority: JOB_PRIORITY.MEDIUM,
    status: JOB_STATUS.IN_PROGRESS,
    center: [11.25, 56.75],
    size: [0.28, 0.2],
    relatedAoiIds: [MOCK_AOI_IDS.KATTEGAT, REAL_AOI_IDS[0]],
  },
  {
    id: "job-004",
    title: "Review Bornholm coverage polygon",
    summary: "Inspect incoming data near Bornholm and prepare follow-up work if AOIs are affected.",
    createdAtDays: -3,
    deadlineDays: 16,
    priority: JOB_PRIORITY.LOW,
    status: JOB_STATUS.TODO,
    center: [14.9, 55.1],
    size: [0.3, 0.2],
    relatedAoiIds: [MOCK_AOI_IDS.BORNHOLM],
  },
  {
    id: "job-006",
    title: "Confirm Danish Straits follow-up polygon",
    summary:
      "Validate completed work around the Danish Straits and close the Job if no AOIs remain affected.",
    createdAtDays: -14,
    deadlineDays: -1,
    priority: JOB_PRIORITY.LOW,
    status: JOB_STATUS.DONE,
    center: [11.95, 55.2],
    size: [0.26, 0.18],
    relatedAoiIds: [MOCK_AOI_IDS.DANISH_STRAITS],
  },
  {
    id: "job-polygon-001",
    title: "Assess Fehmarn Belt polygon",
    summary: "Determine whether the Fehmarn Belt update introduces work for nearby AOIs.",
    createdAtDays: -8,
    deadlineDays: 12,
    priority: JOB_PRIORITY.MEDIUM,
    status: JOB_STATUS.TODO,
    center: [11.35, 54.65],
    size: [0.34, 0.18],
    relatedAoiIds: [MOCK_AOI_IDS.FEHMARN_BELT, MOCK_AOI_IDS.DANISH_STRAITS],
  },
  {
    id: "job-polygon-002",
    title: "Inspect Skagerrak polygon",
    summary: "Check whether new Skagerrak information affects current AOI coverage.",
    createdAtDays: -5,
    deadlineDays: 15,
    priority: JOB_PRIORITY.HIGH,
    status: JOB_STATUS.IN_PROGRESS,
    center: [9.45, 57.7],
    size: [0.3, 0.2],
    relatedAoiIds: [MOCK_AOI_IDS.SKAGERRAK],
  },
  {
    id: "job-polygon-003",
    title: "Review Baltic Sea polygon",
    summary: "Assess a compact Baltic Sea update area and decide whether nearby AOIs require work.",
    createdAtDays: -4,
    deadlineDays: 9,
    priority: JOB_PRIORITY.HIGH,
    status: JOB_STATUS.TODO,
    center: [13.55, 55.0],
    size: [0.32, 0.2],
    relatedAoiIds: [MOCK_AOI_IDS.BALTIC_SEA, MOCK_AOI_IDS.EASTERN_DENMARK],
  },
  {
    id: "job-polygon-004",
    title: "Validate Wadden Sea polygon",
    summary: "Review Wadden Sea source changes against current AOI coverage.",
    createdAtDays: -10,
    deadlineDays: 20,
    priority: JOB_PRIORITY.MEDIUM,
    status: JOB_STATUS.TODO,
    center: [8.3, 55.0],
    size: [0.26, 0.18],
    relatedAoiIds: [MOCK_AOI_IDS.WADDEN_SEA, MOCK_AOI_IDS.NORTH_SEA],
  },
]);

export function createInitialMockJobs() {
  return [...createClusterPointJobs(), ...createPolygonJobs()];
}

export function createPointGeometry(longitude, latitude) {
  return {
    type: "point",
    longitude,
    latitude,
    spatialReference: WGS84_SPATIAL_REFERENCE,
  };
}

export function createPolygonGeometry(ring) {
  return {
    type: "polygon",
    rings: [ring],
    spatialReference: WGS84_SPATIAL_REFERENCE,
  };
}

export function createRectanglePolygonGeometry(center, size) {
  if (!Array.isArray(center) || center.length < 2) {
    throw new Error("Mock Job rectangle geometry requires a [longitude, latitude] center.");
  }

  if (!Array.isArray(size) || size.length < 2) {
    throw new Error("Mock Job rectangle geometry requires a [width, height] size.");
  }

  const [longitude, latitude] = center;
  const [width, height] = size;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  return createPolygonGeometry([
    [longitude - halfWidth, latitude - halfHeight],
    [longitude + halfWidth, latitude - halfHeight],
    [longitude + halfWidth, latitude + halfHeight],
    [longitude - halfWidth, latitude + halfHeight],
    [longitude - halfWidth, latitude - halfHeight],
  ]);
}

function createClusterPointJobs() {
  return POINT_CLUSTER_SPECS.flatMap((clusterSpec) =>
    clusterSpec.points.map(
      ([
        id,
        title,
        longitudeOffset,
        latitudeOffset,
        priority,
        status,
        createdAtDays,
        deadlineDays,
      ]) => ({
        id,
        title,
        summary: `Review ${clusterSpec.area} source information and decide whether related AOIs need follow-up.`,
        createdAt: createIsoDateDaysFromNow(createdAtDays),
        deadline: createIsoDateDaysFromNow(deadlineDays),
        priority,
        status,
        geometry: createPointGeometry(
          clusterSpec.center[0] + longitudeOffset,
          clusterSpec.center[1] + latitudeOffset
        ),
        relatedAoiIds: [...clusterSpec.relatedAoiIds],
      })
    )
  );
}

function createPolygonJobs() {
  return POLYGON_JOB_SPECS.map((jobSpec) => ({
    id: jobSpec.id,
    title: jobSpec.title,
    summary: jobSpec.summary,
    createdAt: createIsoDateDaysFromNow(jobSpec.createdAtDays),
    deadline: jobSpec.deadlineDays === null ? null : createIsoDateDaysFromNow(jobSpec.deadlineDays),
    priority: jobSpec.priority,
    status: jobSpec.status,
    geometry: createRectanglePolygonGeometry(jobSpec.center, jobSpec.size),
    relatedAoiIds: [...jobSpec.relatedAoiIds],
  }));
}

function createIsoDateDaysFromNow(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(9, 0, 0, 0);

  return date.toISOString();
}
