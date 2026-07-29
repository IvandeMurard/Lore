// ─────────────────────────────────────────────
// LORE — AMM band classification
//
// An LLM does not evaluate an inequality; it produces a continuation that
// is usually consistent with one. Asked whether exactly 0.30 qt/hr is
// NORMAL, GPT-4o answered "considered NORMAL ... no further action is
// required" — confidently, and wrong, because AMM 72-53-00 writes NORMAL
// as strictly below 0.30.
//
// So the arithmetic moves out of the prompt. The band edges are declared
// once, with their inclusivity taken from the source notation, and a pure
// function decides. The model's job becomes explaining the result in
// speech, not deriving it.
//
// This is the same move as ensureAmmDisclaimer: an invariant that code can
// guarantee has no business being asked of a prompt.
// ─────────────────────────────────────────────

/** A bound, or null for an open end. `inclusive` mirrors the source notation. */
export type Bound = { value: number; inclusive: boolean } | null;

export type Band = {
    name: string;
    /** Verbatim from the AMM table, so responses can quote rather than paraphrase. */
    notation: string;
    action: string;
    lower: Bound;
    upper: Bound;
};

export type BandTable = {
    metric: string;
    unit: string;
    reference: string;
    /** Unit spellings that map to this table, lowercased. */
    unitAliases: string[];
    bands: Band[];
    /**
     * Conditional rules elsewhere in the SOP that override a classification
     * made from the value alone.
     *
     * These exist because the first version of this file did real damage: a
     * confident single-band verdict suppressed the qualifiers. At 2.9 NU it
     * announced MONITOR and the answer stopped mentioning the 2.5 NU
     * cold-weather trigger; at 0.28 qt/hr it announced NORMAL and the answer
     * stopped mentioning that the step change from 0.15 needs investigating.
     * Two cases that had passed began to fail.
     *
     * The list cannot be complete — a real AMM carries effectivity by serial
     * number, revision cross-references and nested exceptions. So the block
     * handed to the model says the classification is by value alone and that
     * conditional rules override it, rather than presenting it as the answer.
     */
    caveats: string[];
};

// ── AMM 72-21-00, severity classification ────
// NORMAL   "< 2.0 NU"      strict upper
// MONITOR  "2.0 - 3.5 NU"  inclusive both ends
// ESCALATE "> 3.5 NU"      strict lower
export const N1_VIBRATION: BandTable = {
    metric: "N1 vibration",
    unit: "NU",
    reference: "AMM 72-21-00",
    unitAliases: ["nu", "unit", "units"],
    bands: [
        {
            name: "NORMAL",
            notation: "< 2.0 NU",
            action:
                "No action required. Continuous monitoring by on-board systems.",
            lower: null,
            upper: { value: 2.0, inclusive: false },
        },
        {
            name: "MONITOR",
            notation: "2.0 - 3.5 NU",
            action:
                "Record reading. Monitor 3 flight cycles. Visual inspection of the fan section.",
            lower: { value: 2.0, inclusive: true },
            upper: { value: 3.5, inclusive: true },
        },
        {
            name: "ESCALATE",
            notation: "> 3.5 NU",
            action: "Immediate action. Do not dispatch. Detailed inspection.",
            lower: { value: 3.5, inclusive: false },
            upper: null,
        },
    ],
    caveats: [
        "Below 8 deg C, AMM 72-00-00-810-001 sets a cold-weather action trigger at 2.5 NU. That is stricter than this table and it governs in cold conditions.",
        "In cold conditions the vibration must also return below 2.0 NU after warm-up (oil temperature above 50 deg C); if it does not, the troubleshooting procedure applies whatever the band says.",
        "MONITOR persisting more than 3 consecutive flight cycles makes escalation mandatory regardless of the current reading.",
    ],
};

// ── AMM 72-53-00, oil consumption monitoring ─
export const OIL_CONSUMPTION: BandTable = {
    metric: "oil consumption",
    unit: "qt/hr",
    reference: "AMM 72-53-00",
    unitAliases: ["qt/hr", "qt/h", "quarts per flight hour"],
    bands: [
        {
            name: "NORMAL",
            notation: "< 0.30 qt/hr",
            action: "No action. Record in trend log.",
            lower: null,
            upper: { value: 0.3, inclusive: false },
        },
        {
            name: "ELEVATED",
            notation: "0.30 - 0.50 qt/hr",
            action: "Increase monitoring to every flight. Check for leaks.",
            lower: { value: 0.3, inclusive: true },
            upper: { value: 0.5, inclusive: true },
        },
        {
            name: "EXCESSIVE",
            notation: "> 0.50 qt/hr",
            action: "Do not dispatch. Investigate.",
            lower: { value: 0.5, inclusive: false },
            upper: null,
        },
    ],
    caveats: [
        "A sudden increase of more than 0.10 qt/hr from the established baseline requires investigation even when the absolute rate is inside NORMAL.",
        "Consumption is tracked over a rolling 50 flight-hour window, so a single reading does not settle a trend either way.",
    ],
};

export const BAND_TABLES: BandTable[] = [N1_VIBRATION, OIL_CONSUMPTION];

function withinLower(value: number, lower: Bound): boolean {
    if (lower === null) return true;
    return lower.inclusive ? value >= lower.value : value > lower.value;
}

function withinUpper(value: number, upper: Bound): boolean {
    if (upper === null) return true;
    return upper.inclusive ? value <= upper.value : value < upper.value;
}

export function classify(table: BandTable, value: number): Band | null {
    return (
        table.bands.find(
            (band) => withinLower(value, band.lower) && withinUpper(value, band.upper)
        ) ?? null
    );
}

/**
 * Structural check on a table: no value may fall in two bands, and none may
 * fall in zero. Run as a test rather than trusted.
 *
 * This exists because a hand-written note in the eval case set claimed the
 * oil bands "overlap at the edge". They do not — `< 0.30` and `0.30 - 0.50`
 * partition at 0.30. A claim about edges should be checkable by machine
 * instead of asserted by whoever wrote the comment.
 */
export function findTableDefects(table: BandTable): string[] {
    const defects: string[] = [];
    const edges = new Set<number>();

    for (const band of table.bands) {
        if (band.lower) edges.add(band.lower.value);
        if (band.upper) edges.add(band.upper.value);
    }

    // Probe each edge and its immediate neighbourhood.
    const step = 0.01;
    const probes = [...edges].flatMap((edge) => [
        edge - step,
        edge,
        edge + step,
    ]);

    for (const probe of probes) {
        const rounded = Number(probe.toFixed(4));
        const hits = table.bands.filter(
            (band) =>
                withinLower(rounded, band.lower) && withinUpper(rounded, band.upper)
        );
        if (hits.length === 0) {
            defects.push(`${rounded} ${table.unit} falls in no band`);
        }
        if (hits.length > 1) {
            defects.push(
                `${rounded} ${table.unit} falls in ${hits.length} bands: ${hits.map((b) => b.name).join(", ")}`
            );
        }
    }

    return defects;
}

// ── Reading extraction ───────────────────────

const READING_RE =
    /(\d+(?:[.,]\d+)?)\s*(NU|units?|qt\/hr|qt\/h|quarts per flight hour)\b/gi;

export type ClassifiedReading = {
    value: number;
    table: BandTable;
    band: Band | null;
};

/** Finds every reading in free text and classifies it. */
export function classifyReadings(text: string): ClassifiedReading[] {
    const found: ClassifiedReading[] = [];
    const seen = new Set<string>();

    for (const match of text.matchAll(READING_RE)) {
        const value = Number.parseFloat(match[1].replace(",", "."));
        const alias = match[2].toLowerCase().replace(/\s+/g, " ");
        const table = BAND_TABLES.find((t) => t.unitAliases.includes(alias));
        if (!table || Number.isNaN(value)) continue;

        const key = `${table.metric}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);

        found.push({ value, table, band: classify(table, value) });
    }

    return found;
}

/**
 * A block to prepend to the model's context. Deterministic, quotable, and
 * explicitly marked as not-to-be-recomputed — the model's failure mode was
 * re-deriving the band from the prose table and getting the edge wrong.
 */
export function buildClassificationBlock(question: string): string {
    const readings = classifyReadings(question);
    if (readings.length === 0) return "";

    const lines = readings.map(({ value, table, band }) =>
        band
            ? `- ${value} ${table.unit} ${table.metric} → ${band.name} per ${table.reference} (band: ${band.notation}). Action for that band: ${band.action}`
            : `- ${value} ${table.unit} ${table.metric} → outside every band in ${table.reference}. Say so; do not guess a classification.`
    );

    const caveats = [
        ...new Set(readings.flatMap(({ table }) => table.caveats)),
    ];

    return [
        "COMPUTED CLASSIFICATION — by value alone. The arithmetic is settled; the answer is not.",
        "Take the band and its action as given, and do not re-derive them from the prose table.",
        ...lines,
        "",
        "CONDITIONAL RULES THAT OVERRIDE THE BAND ABOVE — apply any that fit the situation, and say which one you applied:",
        ...caveats.map((caveat) => `- ${caveat}`),
        "If the SOP excerpts below carry a condition not listed here, that condition wins over the band.",
    ].join("\n");
}
