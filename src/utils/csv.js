// CSV helpers used by the Students page export. Kept free of React so they can be unit tested.

// Characters that make spreadsheet apps treat a cell as a formula
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

// Characters that are not allowed (or awkward) in file names
// eslint-disable-next-line no-control-regex
const UNSAFE_FILENAME_CHARS = /[\s/\\:*?"<>|\x00-\x1f]/g;

export const toCsvCell = (value) => {
    if (value === null || value === undefined) {
        return "";
    }

    // Numbers can't carry a formula, so leave them as-is
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "";
    }

    let text = String(value);

    if (FORMULA_TRIGGERS.some((trigger) => text.startsWith(trigger))) {
        text = `'${text}`;
    }

    if (/[",\r\n]/.test(text)) {
        text = `"${text.replace(/"/g, '""')}"`;
    }

    return text;
};

export const buildCsv = (headers, rows) => {
    const lines = [headers, ...rows].map((row) => row.map(toCsvCell).join(","));
    return lines.join("\r\n");
};

const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const sanitizeFilenamePart = (value) => {
    const cleaned = String(value ?? "").trim().replace(UNSAFE_FILENAME_CHARS, "_");
    return cleaned || "section";
};

export const buildStudentsCsvFilename = (sectionName, date = new Date()) => {
    return `students_${sanitizeFilenamePart(sectionName)}_${formatLocalDate(date)}.csv`;
};

// File name of an admin data export (Settings > Data), e.g. "students_All_schools_2026-10-06.csv"
export const buildExportCsvFilename = (dataset, scope, date = new Date()) => {
    return `${sanitizeFilenamePart(dataset)}_${sanitizeFilenamePart(scope)}_${formatLocalDate(date)}.csv`;
};

// Triggers a browser download. The UTF-8 BOM makes Excel read accented characters (e.g. ñ) correctly.
export const downloadCsv = (filename, csv) => {
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
};
