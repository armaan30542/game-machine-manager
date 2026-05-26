export interface MachineLine {
  position: number | null;
  ksys_game_id: string | null;
  game_name: string;
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  last_read_date: string | null;
}

export interface RevenueData {
  cash_in: number;
  cash_out: number;
  net_revenue: number;
  period_start: string;
  period_end: string;
  machine_lines: MachineLine[];
}

/**
 * Parse revenue data from ksys22.com HTML response.
 *
 * The HTML contains a table with per-game rows and a Totals row like:
 *   Totals | In $27,901.00 | Out $16,270.29 | Net $11,630.71 | Hold 41.7%
 *
 * Each game row has columns:
 *   Game | Start Date | Last Read Date | Start M In | Start M Out |
 *   End M In | End M Out | Period In | Period Out | Period Net | Hold
 */
export function parseRevenueResponse(rawData: string): RevenueData {
  // Try JSON first (unlikely but safe fallback)
  try {
    const json = JSON.parse(rawData);
    return parseJsonRevenue(json);
  } catch {
    // Not JSON, parse as HTML
  }

  return parseKsys22Html(rawData);
}

function parseJsonRevenue(json: Record<string, unknown>): RevenueData {
  const cashIn = Number(json.cashIn ?? json.cash_in ?? json.CashIn ?? 0);
  const cashOut = Number(json.cashOut ?? json.cash_out ?? json.CashOut ?? 0);
  const netRevenue = Number(
    json.netRevenue ?? json.net_revenue ?? json.NetRevenue ?? cashIn - cashOut
  );

  const now = new Date();
  const periodStart =
    (json.periodStart as string) ??
    (json.period_start as string) ??
    (json.startDate as string) ??
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const periodEnd =
    (json.periodEnd as string) ??
    (json.period_end as string) ??
    (json.endDate as string) ??
    now.toISOString().split("T")[0];

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    net_revenue: netRevenue,
    period_start: periodStart,
    period_end: periodEnd,
    machine_lines: [],
  };
}

/** Parse a dollar amount out of a (tag-stripped) table cell. */
function parseMoney(text: string): number {
  const m = text.match(/-?[\d,]+\.?\d*/);
  return m ? Number(m[0].replace(/,/g, "")) : 0;
}

/**
 * Extract per-game rows from a ksys22 revenue table (kperiod.php and the
 * kpbd.php date-range report share the same 11-column layout):
 *   Game | Start Date | Last Read Date | Start M In | Start M Out | End M In |
 *   End M Out | Period In | Period Out | Period Net | Hold
 *
 * The "Game" cell shows the on-screen label ("1", "2", ... -> "Game 1") and
 * may carry a tooltip (title='ID K7904381 ...'). Detection is structural so
 * it still works when the tooltip is absent; header and Totals rows are
 * rejected because they have no numeric game column or no period figures.
 */
function parseMachineLines(html: string): MachineLine[] {
  const lines: MachineLine[] = [];
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of rows) {
    // Include both <td> and <th> - kpbd.php uses <th> as the row header for
    // the game number while kperiod.php uses <td>; either way the cell
    // layout is identical so they parse the same way.
    const cells = row.match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
    if (!cells || cells.length < 10) continue;

    const cellText = (i: number): string =>
      i >= 0 && i < cells.length
        ? stripHtmlTags(cells[i]).replace(/&nbsp;?/gi, " ").trim()
        : "";

    // Game cell: prefer one carrying a ksys 'ID ...' tooltip; otherwise
    // pick the first cell whose text reads as a small game number. The
    // kpbd.php table has an empty leading column, so the Game cell is at
    // index 1 - we can't just assume cell 0.
    let posIdx = cells.findIndex(
      (c) => /title=/i.test(c) && /ID\s/i.test(c)
    );
    if (posIdx === -1) {
      posIdx = cells.findIndex((c) =>
        looksLikeGameNumber(
          stripHtmlTags(c).replace(/&nbsp;?/gi, " ").trim()
        )
      );
    }
    if (posIdx === -1) continue;

    const gameLabel = cellText(posIdx).replace(/\s+/g, " ").trim();
    const position = parseInt(gameLabel.replace(/\D/g, ""), 10);
    if (!Number.isFinite(position) || position <= 0 || position > 200) {
      continue;
    }

    const inText = cellText(posIdx + 7);
    const netText = cellText(posIdx + 9);
    if (!/\d/.test(inText) && !/\d/.test(netText)) continue;

    const titleMatch = row.match(/title=(['"])(.*?)\1/i);
    const idMatch = titleMatch?.[2].match(/ID\s+(\S+)/i);

    const lastReadRaw = parseDate(cellText(posIdx + 2));
    const lastReadDate =
      lastReadRaw && lastReadRaw >= "2010-01-01" ? lastReadRaw : null;

    lines.push({
      position,
      ksys_game_id: idMatch ? idMatch[1] : null,
      game_name: /game/i.test(gameLabel) ? gameLabel : `Game ${position}`,
      cash_in: parseMoney(inText),
      cash_out: parseMoney(cellText(posIdx + 8)),
      net_revenue: parseMoney(netText),
      last_read_date: lastReadDate,
    });
  }

  return lines;
}

function parseDate(str: string): string | null {
  // Parse "03/31/26" -> "2026-03-31"
  const match = str.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!match) return null;

  const month = match[1];
  const day = match[2];
  let year = match[3];
  if (year.length === 2) {
    // Pivot: 00-49 -> 2000-2049, 50-99 -> 1950-1999
    // ksys22 uses 01/01/70 (=> 1970) as a placeholder for "never read"
    const y = parseInt(year, 10);
    year = y < 50 ? `20${year.padStart(2, "0")}` : `19${year}`;
  }
  return `${year}-${month}-${day}`;
}

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, " ");
}

/**
 * True if a cell's text looks like a ksys "Game" column value - either a
 * bare small positive integer ("1", "12") or "Game N". Dates, money and
 * percentages are rejected.
 */
function looksLikeGameNumber(text: string): boolean {
  if (/[$/.]/.test(text)) return false;
  const t = text.trim();
  if (!t || t.length > 15) return false;
  const m = t.match(/^(?:game\s+)?(\d{1,3})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n > 0 && n <= 200;
}

function parseKsys22Html(html: string): RevenueData {
  const now = new Date();
  let cashIn = 0;
  let cashOut = 0;
  let netRevenue = 0;
  let periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  let periodEnd = now.toISOString().split("T")[0];

  // Strip all HTML tags first so values like "$<font color="#000">11,630.71"
  // become "$11,630.71"
  const clean = stripHtmlTags(html);

  // Find the Totals row - it contains "Totals" followed by "In $X", "Out $X", "Net $X"
  // We match from "Totals" to end to avoid hitting "Start M In" etc in data rows
  const totalsSection = clean.match(/Totals[\s\S]*/);
  if (totalsSection) {
    const totals = totalsSection[0];
    const inMatch = totals.match(/In\s+\$?\s*([\d,]+\.?\d*)/);
    const outMatch = totals.match(/Out\s+\$?\s*([\d,]+\.?\d*)/);
    const netMatch = totals.match(/Net\s+\$?\s*([\d,]+\.?\d*)/);

    if (inMatch) cashIn = Number(inMatch[1].replace(/,/g, ""));
    if (outMatch) cashOut = Number(outMatch[1].replace(/,/g, ""));
    if (netMatch) netRevenue = Number(netMatch[1].replace(/,/g, ""));
  }

  // Extract period dates from the game rows.
  // Each row has: Game | Start Date | Last Read Date | ...
  // ksys22 uses 01/01/70 as a placeholder for machines that have never been read,
  // so we filter out any date before 2010. We take min/max of the remaining dates.
  const dateMatches = [...clean.matchAll(/(\d{2}\/\d{2}\/\d{2,4})/g)];
  const validDates: string[] = [];
  for (const m of dateMatches) {
    const parsed = parseDate(m[1]);
    if (parsed && parsed >= "2010-01-01") {
      validDates.push(parsed);
    }
  }

  if (validDates.length > 0) {
    validDates.sort();
    periodStart = validDates[0];
    periodEnd = validDates[validDates.length - 1];
  }

  // If net_revenue is 0 but we have cash_in and cash_out, calculate it
  if (netRevenue === 0 && cashIn > 0) {
    netRevenue = cashIn - cashOut;
  }

  return {
    cash_in: cashIn,
    cash_out: cashOut,
    net_revenue: netRevenue,
    period_start: periodStart,
    period_end: periodEnd,
    machine_lines: parseMachineLines(html),
  };
}
