import { appendIcEncReportViewerAction } from "../../icEncReportViewer/ui/icEncReportViewerAction.js";

const sourceLabels = { Email: "Decision by email", Manual: "Manual decision" };

const transportLabels = {
  Sending: "Sending",
  Delivered: "Delivered",
  Uncertain: "Delivery uncertain",
  NotDelivered: "Not delivered",
};

const utcFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function createIcEncDeliveryHistorySection(history, datasetName) {
  const section = document.createElement("details");
  section.className = "pc-icenc-history";
  section.append(textElement("summary", "IC-ENC deliveries"));

  if (history.availability !== "Available") {
    section.append(textElement("p", "IC-ENC deliveries could not be loaded."));
    return section;
  }

  if (!history.items.length) {
    section.append(textElement("p", "No IC-ENC deliveries found."));
    return section;
  }

  if (history.hasMore) {
    section.append(textElement("p", "Showing the 50 most recent delivery attempts."));
  }

  for (const item of history.items) {
    section.append(renderAttempt(item, datasetName));
  }
  return section;
}

function renderAttempt(item, datasetName) {
  const attempt = document.createElement("details");
  attempt.className = "pc-icenc-history__attempt";
  const summary = document.createElement("summary");
  const status =
    item.decision?.outcome ?? `${transportLabels[item.transportStatus]} · No recorded decision`;
  summary.append(
    textElement("strong", `Edition ${item.edition} / Update ${item.update} · ${status}`)
  );

  const reservation = timeLine("Reserved", item.reservedAt, "Reservation time unknown");
  const count =
    item.reportsAvailability === "Unavailable"
      ? "Reports unavailable"
      : `${item.reports.length} ${item.reports.length === 1 ? "report" : "reports"} shown`;
  reservation.append(textElement("span", ` · ${count}`));
  summary.append(reservation);
  attempt.append(summary);

  if (item.decision) {
    const source = sourceLabels[item.decision.source];
    if (source || !item.decision.source) {
      attempt.append(textElement("p", source ?? "Decision source unknown"));
    }
    attempt.append(
      timeLine(
        "Decision recorded",
        item.decision.recordedAt,
        "Decision recording time unknown",
        "p"
      )
    );
  }
  attempt.append(
    timeLine(
      "Delivery completed or reconciled",
      item.completedAt,
      "Completion or reconciliation time unknown",
      "p"
    )
  );

  if (item.reportsAvailability === "Partial") {
    attempt.append(textElement("p", "Some reports are unavailable. Up to 20 reports are shown."));
  } else if (item.reportsAvailability === "Unavailable") {
    attempt.append(textElement("p", "Reports could not be loaded."));
  } else if (!item.reports.length) {
    attempt.append(textElement("p", "No stored reports for this delivery."));
  }

  if (item.reports.length) {
    const list = document.createElement("ul");
    for (const report of item.reports) {
      const row = document.createElement("li");
      const relation = report.fromDecisionEmail
        ? "From decision email"
        : "Stored for this delivery";
      const link = textElement("a", report.fileName);
      link.setAttribute("href", report.url);
      link.setAttribute(
        "aria-label",
        `Download ${report.fileName}. Stored ${formatUtc(report.storedAt)}. ${relation}.`
      );
      const evidence = timeLine("Stored", report.storedAt, "Storage time unknown");
      evidence.append(textElement("span", ` · ${relation}`));
      row.append(link);
      // Only the normalized delivery report DTO establishes this typed owner relation.
      appendIcEncReportViewerAction(
        row,
        { ...report, kind: "IcEncReport", datasetName, originalReportUrl: report.url },
        datasetName,
        report.url
      );
      row.append(evidence);
      list.append(row);
    }
    attempt.append(list);
  }
  return attempt;
}

function timeLine(label, timestamp, fallback, tag = "span") {
  const line = document.createElement(tag);
  line.className = "pc-icenc-history__detail";
  if (!timestamp) {
    line.textContent = fallback;
    return line;
  }

  const time = textElement("time", formatUtc(timestamp));
  time.setAttribute("datetime", timestamp);
  line.append(textElement("span", `${label} `), time);
  return line;
}

function formatUtc(timestamp) {
  return `${utcFormatter.format(new Date(timestamp))} UTC`;
}

function textElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}
