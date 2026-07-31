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
    /**
     * Monitoring interval the band prescribes, in flight cycles.
     *
     * Broken out because it is the parameter the captured experts contradict:
     * both Marc and Jean-Pierre work to 2 cycles where the AMM MONITOR band
     * requires 3, and the model relayed theirs while dropping the manual's.
     */
    monitorCycles?: number;
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
            monitorCycles: 3,
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

// ── Contradiction detection ──────────────────
// One implementation, two callers: the eval grader and the runtime enforcer.
// Two copies of a safety check is one copy too many — the same reason
// prompt-parity.test.ts exists.

export type BandContradiction = {
    reading: ClassifiedReading;
    kind: "wrong-band" | "shortened-interval";
    detail: string;
    /** The correction to state, in the manual's own terms. */
    correction: string;
};

const NUMBER_WORDS: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
};

/** Monitoring intervals the response prescribes, in flight cycles. */
function statedIntervals(text: string): number[] {
    const re =
        /monitor(?:ing|ed)?\b[^.]{0,40}?\b(\d+|one|two|three|four|five)\s+(?:consecutive\s+)?(?:flight\s+)?cycles?\b/gi;
    const found: number[] = [];

    for (const match of text.matchAll(re)) {
        const token = match[1].toLowerCase();
        const value = NUMBER_WORDS[token] ?? Number.parseInt(token, 10);
        if (!Number.isNaN(value)) found.push(value);
    }

    return found;
}

// Words that turn a band name into a claim about the reading. Reciting the
// table ("NORMAL below 2.0 NU, MONITOR 2.0 - 3.5") carries none of them,
// which is what keeps this from firing on a correct explanation.
//
// "still" and "remains" were added after a test fixture wrote "Still NORMAL
// as far as I can tell" and slipped through: a verb-less assertion is still
// an assertion.
const BAND_ASSERTION =
    String.raw`([Ii]s|[Aa]re|[Ff]alls?\s+(in|into|under)|[Cc]onsidered|[Cc]lassified\s+as|[Ww]ould\s+be|[Rr]emains|[Ss]tays|[Ss]till|[Cc]ounts\s+as|[Qq]ualifies\s+as|[Rr]eads\s+as)`;

function assertsBand(text: string, name: string): boolean {
    // Case-sensitive on the band name. "a cold-weather rise is normal" is the
    // adjective; "is NORMAL" is the band. The AMM writes band names in
    // capitals and every observed response reproduces them that way.
    return new RegExp(
        String.raw`\b${BAND_ASSERTION}\s+(the\s+)?(?:"|')?${name}\b`
    ).test(text);
}

export function findBandContradictions(
    response: string,
    question: string
): BandContradiction[] {
    const found: BandContradiction[] = [];

    for (const reading of classifyReadings(question)) {
        const { value, table, band } = reading;
        if (!band) continue;

        // 1. A different band asserted of the reading.
        const wrong = table.bands
            .map((b) => b.name)
            .filter((name) => name !== band.name)
            .find((name) => assertsBand(response, name));

        if (wrong) {
            found.push({
                reading,
                kind: "wrong-band",
                detail: `${value} ${table.unit} is ${band.name} per ${table.reference} (${band.notation}), but the response asserts ${wrong}`,
                correction: `${value} ${table.unit} is ${band.name} per ${table.reference} (band: ${band.notation}). ${band.action}`,
            });
            continue;
        }

        // 2. A shorter monitoring interval standing alone. Quoting an expert's
        // shorter interval is fine; letting it stand without the manual's is
        // not, and that is the failure the source-conflict cases found.
        if (band.monitorCycles !== undefined) {
            const stated = statedIntervals(response);
            const mentionsPrescribed = stated.includes(band.monitorCycles);
            const mentionsShorter = stated.some((n) => n < band.monitorCycles!);

            if (mentionsShorter && !mentionsPrescribed) {
                found.push({
                    reading,
                    kind: "shortened-interval",
                    detail: `${band.name} per ${table.reference} requires ${band.monitorCycles} flight cycles; the response states ${stated.join(", ")} and never the prescribed interval`,
                    correction: `${band.name} per ${table.reference} requires monitoring ${band.monitorCycles} flight cycles. A shorter interval from a captured note does not replace it.`,
                });
            }
        }
    }

    return found;
}

/**
 * The answer of last resort: the manual, and nothing else. Used when a
 * contradiction survives one correction attempt, so the pipeline fails
 * closed onto the SOP rather than shipping a contradiction.
 */
export function buildDeterministicVerdict(question: string): string {
    const readings = classifyReadings(question).filter((r) => r.band !== null);
    if (readings.length === 0) return "";

    return readings
        .map(
            ({ value, table, band }) =>
                `Per ${table.reference}, ${value} ${table.unit} ${table.metric} is ${band!.name} (band: ${band!.notation}). ${band!.action}`
        )
        .join(" ");
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
