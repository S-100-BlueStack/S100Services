import { JOB_PRIORITY } from "../domain/jobPriority.js";
import { JOB_STATUS } from "../domain/jobStatus.js";

const WGS84_SPATIAL_REFERENCE = Object.freeze({
  wkid: 4326,
});

export function createInitialMockJobs() {
  return [
    {
      id: "job-001",
      title: "Review North Sea source update",
      summary: "Assess new source data in the North Sea and identify affected Areas of Interest.",
      createdAt: createIsoDateDaysFromNow(-9),
      deadline: createIsoDateDaysFromNow(5),
      priority: JOB_PRIORITY.HIGH,
      status: JOB_STATUS.TODO,
      geometry: createPolygonGeometry([
        [7.25, 55.2],
        [8.35, 55.2],
        [8.35, 56.05],
        [7.25, 56.05],
        [7.25, 55.2],
      ]),
      relatedAoiIds: ["mock-aoi-north-sea", "mock-aoi-western-denmark"],
    },
    {
      id: "job-002",
      title: "Validate Kattegat depth changes",
      summary:
        "Review potential changes affecting Kattegat AOIs before chart updates are prepared.",
      createdAt: createIsoDateDaysFromNow(-6),
      deadline: createIsoDateDaysFromNow(10),
      priority: JOB_PRIORITY.MEDIUM,
      status: JOB_STATUS.IN_PROGRESS,
      geometry: createPolygonGeometry([
        [10.55, 56.0],
        [12.1, 56.0],
        [12.1, 57.2],
        [10.55, 57.2],
        [10.55, 56.0],
      ]),
      relatedAoiIds: ["mock-aoi-kattegat"],
    },
    {
      id: "job-003",
      title: "Check Great Belt notice",
      summary: "Confirm whether the reported update affects AOIs around the Great Belt.",
      createdAt: createIsoDateDaysFromNow(-4),
      deadline: createIsoDateDaysFromNow(3),
      priority: JOB_PRIORITY.HIGH,
      status: JOB_STATUS.TODO,
      geometry: createPointGeometry(10.86, 55.44),
      relatedAoiIds: ["mock-aoi-great-belt", "mock-aoi-eastern-denmark"],
    },
    {
      id: "job-004",
      title: "Review Bornholm coverage",
      summary:
        "Inspect incoming data near Bornholm and prepare follow-up work if AOIs are affected.",
      createdAt: createIsoDateDaysFromNow(-3),
      deadline: createIsoDateDaysFromNow(16),
      priority: JOB_PRIORITY.LOW,
      status: JOB_STATUS.TODO,
      geometry: createPolygonGeometry([
        [14.35, 54.75],
        [15.45, 54.75],
        [15.45, 55.45],
        [14.35, 55.45],
        [14.35, 54.75],
      ]),
      relatedAoiIds: ["mock-aoi-bornholm"],
    },
    {
      id: "job-005",
      title: "Assess Skagerrak update",
      summary: "Determine whether the reported Skagerrak update requires new work for nearby AOIs.",
      createdAt: createIsoDateDaysFromNow(-2),
      deadline: null,
      priority: JOB_PRIORITY.MEDIUM,
      status: JOB_STATUS.IN_PROGRESS,
      geometry: createPointGeometry(9.35, 57.65),
      relatedAoiIds: ["mock-aoi-skagerrak"],
    },
    {
      id: "job-006",
      title: "Confirm Danish Straits follow-up",
      summary:
        "Validate completed work around the Danish Straits and close the Job if no AOIs remain affected.",
      createdAt: createIsoDateDaysFromNow(-14),
      deadline: createIsoDateDaysFromNow(-1),
      priority: JOB_PRIORITY.LOW,
      status: JOB_STATUS.DONE,
      geometry: createPolygonGeometry([
        [11.25, 54.75],
        [12.65, 54.75],
        [12.65, 55.7],
        [11.25, 55.7],
        [11.25, 54.75],
      ]),
      relatedAoiIds: ["mock-aoi-danish-straits"],
    },
  ];
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

function createIsoDateDaysFromNow(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(9, 0, 0, 0);

  return date.toISOString();
}
