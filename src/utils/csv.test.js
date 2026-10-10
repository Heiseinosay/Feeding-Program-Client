import {
    toCsvCell,
    buildCsv,
    sanitizeFilenamePart,
    buildStudentsCsvFilename,
    buildExportCsvFilename,
    downloadCsv,
} from "./csv";

describe("toCsvCell", () => {
    it("returns an empty string for null and undefined", () => {
        expect(toCsvCell(null)).toBe("");
        expect(toCsvCell(undefined)).toBe("");
    });

    it("leaves plain text and numbers untouched", () => {
        expect(toCsvCell("Liam")).toBe("Liam");
        expect(toCsvCell(13.9)).toBe("13.9");
        expect(toCsvCell(0)).toBe("0");
        expect(toCsvCell(-5)).toBe("-5");
    });

    it("quotes values containing commas", () => {
        expect(toCsvCell("Cruz, Liam")).toBe('"Cruz, Liam"');
    });

    it("doubles embedded quotes and wraps the value", () => {
        expect(toCsvCell('Juan "JJ" Cruz')).toBe('"Juan ""JJ"" Cruz"');
    });

    it("quotes values containing line breaks", () => {
        expect(toCsvCell("line1\nline2")).toBe('"line1\nline2"');
        expect(toCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
    });

    it("keeps accented characters as-is", () => {
        expect(toCsvCell("Peña, Niño")).toBe('"Peña, Niño"');
    });

    it.each(["=SUM(A1:A2)", "+1", "-1", "@cmd", "\tTab", "\rCR"])(
        "prefixes formula-like text %p with a single quote",
        (value) => {
            expect(toCsvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
        }
    );

    it("guards and quotes a formula value that also has a comma", () => {
        expect(toCsvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
    });
});

describe("buildCsv", () => {
    it("joins headers and rows with commas and CRLF", () => {
        const csv = buildCsv(["Name", "Age"], [["Cruz, Liam", 6], ["Reyes", null]]);
        expect(csv).toBe('Name,Age\r\n"Cruz, Liam",6\r\nReyes,');
    });

    it("returns only the header row when there are no rows", () => {
        expect(buildCsv(["Name"], [])).toBe("Name");
    });

    it("handles a large section", () => {
        const rows = Array.from({ length: 5000 }, (_, i) => [`Student ${i}`, i]);
        const lines = buildCsv(["Name", "Age"], rows).split("\r\n");
        expect(lines).toHaveLength(5001);
        expect(lines[5000]).toBe("Student 4999,4999");
    });
});

describe("file names", () => {
    it("replaces spaces and unsafe characters with underscores", () => {
        expect(sanitizeFilenamePart('Section A/B\\C:D*E?F"G<H>I|J')).toBe("Section_A_B_C_D_E_F_G_H_I_J");
    });

    it("falls back when the section name is empty", () => {
        expect(sanitizeFilenamePart("   ")).toBe("section");
        expect(sanitizeFilenamePart(null)).toBe("section");
    });

    it("keeps accented characters", () => {
        expect(sanitizeFilenamePart("Sampaguita Niño")).toBe("Sampaguita_Niño");
    });

    it("uses the local date in YYYY-MM-DD format", () => {
        // Local-time constructor: 5 Mar 2026, 23:30 local, which must not roll over to the next day
        const date = new Date(2026, 2, 5, 23, 30);
        expect(buildStudentsCsvFilename("Section A", date)).toBe("students_Section_A_2026-03-05.csv");
    });

    it("names an admin export after its dataset, school and local date", () => {
        const date = new Date(2026, 9, 6, 23, 30);
        expect(buildExportCsvFilename("bmi_history", "All schools", date)).toBe("bmi_history_All_schools_2026-10-06.csv");
        expect(buildExportCsvFilename("students", "Sto. Niño / Annex", date)).toBe("students_Sto._Niño___Annex_2026-10-06.csv");
    });
});

describe("downloadCsv", () => {
    it("downloads a UTF-8 blob that starts with a BOM", async () => {
        const createObjectURL = jest.fn(() => "blob:mock");
        const revokeObjectURL = jest.fn();
        global.URL.createObjectURL = createObjectURL;
        global.URL.revokeObjectURL = revokeObjectURL;
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        downloadCsv("students_A_2026-03-05.csv", "Name\r\nPeña");

        const blob = createObjectURL.mock.calls[0][0];
        expect(blob.type).toBe("text/csv;charset=utf-8;");
        const buffer = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(blob);
        });
        const bytes = new Uint8Array(buffer);
        expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);

        const link = clickSpy.mock.instances[0];
        expect(link.download).toBe("students_A_2026-03-05.csv");
        expect(document.querySelector("a[download]")).toBeNull();

        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");

        clickSpy.mockRestore();
    });
});
