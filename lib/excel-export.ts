import { isArmedHumanSpecies } from "./burst-species";
import { sortRowsByPhotoName } from "./csv";
import { CSV_HEADER, type CsvRow } from "./types";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Download name: same CTA stamp as CSV, but `.xls` (Excel can show cell colors). */
export function spreadsheetDownloadFilename(csvFilename: string): string {
  const base = csvFilename.trim() || "CTA.xls";
  return base.replace(/\.csv$/i, "") + ".xls";
}

/**
 * SpreadsheetML (.xls) with red highlight on Human (armed) rows.
 * Plain CSV cannot store colors; Excel/Sheets open this file with formatting.
 */
export function buildArmedHighlightSpreadsheet(rows: CsvRow[]): string {
  const ordered = sortRowsByPhotoName(rows);

  const headerCells = CSV_HEADER.map(
    (h) =>
      `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`,
  ).join("");

  const body = ordered
    .map((row) => {
      const armed = isArmedHumanSpecies(row[3] ?? "");
      const style = armed ? ' ss:StyleID="Armed"' : "";
      const cells = row
        .map(
          (value) =>
            `<Cell${style}><Data ss:Type="String">${escapeXml(value ?? "")}</Data></Cell>`,
        )
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("\n");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Bottom"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Armed">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#9B0000"/>
   <Interior ss:Color="#FFCDD2" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="Camera Trap Log">
  <Table>
   <Row>${headerCells}</Row>
   ${body}
  </Table>
 </Worksheet>
</Workbook>
`;
}

/** Parse our own CSV export back into rows (header + data). */
export function rowsFromCsvContent(csvText: string): CsvRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return [];

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]!);
    if (fields.length < 7) continue;
    rows.push([
      fields[0] ?? "",
      fields[1] ?? "",
      fields[2] ?? "",
      fields[3] ?? "",
      fields[4] ?? "",
      fields[5] ?? "",
      fields[6] ?? "",
    ]);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
